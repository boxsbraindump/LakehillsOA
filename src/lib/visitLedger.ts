/**
 * A ledger of Renton visits, and the reconciliation that replaces counting them by hand.
 *
 * The second clinic cannot be given Unified Practice access without also seeing Bellevue's
 * business, so its appointments arrive separately and Bellevue works them through four steps.
 * That was a spreadsheet with four cell colours, and it broke the week a single Kaiser
 * remittance covered sixty patients across both clinics: colours can say what state a row is
 * in, but they cannot say *which payment settled which visit*, so telling this round from the
 * last one meant light green versus dark green, and counting meant counting. A miscount cost a
 * second pass through sixty rows.
 *
 * Here each visit carries the date it was paid, which makes rounds unlimited and the weekly
 * figure a sum rather than a tally.
 */
import { compactForSearch } from "./searchIndex";

/**
 * The spreadsheet's four colours plus the case it had no colour for. `new` is the blank cell —
 * the other clinic has booked someone and Bellevue has not touched it yet.
 */
export type VisitStatus = "new" | "entered" | "submitted" | "paid" | "denied";

export const VISIT_STATUSES: VisitStatus[] = ["new", "entered", "submitted", "paid", "denied"];

export interface Visit {
  id: string;
  name: string;
  /** yyyy-mm-dd — the day the patient was seen. */
  visitDate: string;
  status: VisitStatus;
  /** yyyy-mm-dd — the day the money arrived. Only meaningful once paid. */
  paidDate?: string;
  note?: string;
  createdAt: number;
}

/** Money is owed to the other clinic per visit reimbursed, so only paid visits count. */
export function isPayable(visit: Visit): boolean {
  return visit.status === "paid";
}

/** Still waiting on money: these are what a remittance can settle. */
export function isOpen(visit: Visit): boolean {
  return visit.status === "submitted" || visit.status === "denied";
}

export function newVisitId(): string {
  return `visit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * The parts of a name worth searching for. Initials and punctuation are dropped because they
 * appear everywhere in a remittance and would match anything.
 */
function nameTokens(name: string): string[] {
  return name
    .split(/[\s,./-]+/)
    .map((part) => part.replace(/[^A-Za-z0-9一-鿿]/g, ""))
    .filter((part) => part.length >= 2);
}

/**
 * Whether one line of the remittance names this person. Every part of the name has to be on
 * the line, which lets "DOE, JANE" match a ledger entry of "Jane Doe" without letting a line
 * about a different patient match on a shared surname alone.
 */
export function lineNamesPatient(line: string, name: string): boolean {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return false;
  const haystack = compactForSearch(line);
  // Compacted comparison per token, so spacing inside the remittance cannot break a match.
  return tokens.every((token) => haystack.includes(compactForSearch(token)));
}

/**
 * Dates written on one line of a remittance, normalised. Payers write the service date in
 * whatever style they like, and a line also carries claim numbers and amounts, so anything
 * that is not a plausible date is thrown away.
 */
export function datesInLine(line: string): string[] {
  const found = new Set<string>();
  const keep = (y: number, m: number, d: number) => {
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return;
    found.add(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  };

  for (const [, y, m, d] of line.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) {
    keep(Number(y), Number(m), Number(d));
  }
  for (const [, m, d, y] of line.matchAll(/\b(\d{1,2})[/](\d{1,2})[/](\d{2}|\d{4})\b/g)) {
    const year = Number(y) < 100 ? Number(y) + 2000 : Number(y);
    keep(year, Number(m), Number(d));
  }
  // Compact yyyymmdd, which is what most remittances actually print.
  for (const [, y, m, d] of line.matchAll(/\b(\d{4})(\d{2})(\d{2})\b/g)) {
    keep(Number(y), Number(m), Number(d));
  }
  return [...found];
}

export interface RemittanceMatch {
  visit: Visit;
  /** How many lines of the pasted text name this person — >1 usually means repeat visits. */
  lines: number;
  /**
   * Set when the remittance states a service date for this patient and none of them is the
   * date on the ledger. One remittance often settles visits months apart, so this is how a
   * payment landing on the wrong visit shows itself instead of passing silently.
   */
  datesOnRemittance?: string[];
}

export interface AmbiguousMatch {
  name: string;
  visits: Visit[];
  lines: number;
  /** Service dates the remittance gives for this patient, to inform the choice. */
  datesOnRemittance: string[];
}

export interface RemittanceResult {
  /** Exactly one open visit carries this name, and the remittance names it. Safe to settle. */
  matched: RemittanceMatch[];
  /** Two or more open visits share this name. Never guessed — the front desk picks. */
  ambiguous: AmbiguousMatch[];
  /** Open visits this remittance says nothing about. They stay open for the next one. */
  notReturned: Visit[];
}

/**
 * Deliberately searches the pasted text rather than parsing it.
 *
 * A remittance has no format worth relying on — it is whatever came out of the payer's portal,
 * with columns, wrapping and codes in the way. Parsing it would introduce a failure nobody
 * could see. Asking instead "is this patient named anywhere in here" needs no structure at
 * all, and the only thing it can miss is a name genuinely written differently, which is
 * reported rather than swallowed.
 *
 * Note this cannot say how many names in the remittance belong to the other clinic: nothing
 * here reads the remittance's own list. It does not need to — the question is how many of
 * *these* visits were paid.
 */
export function matchRemittance(visits: Visit[], text: string): RemittanceResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const open = visits.filter(isOpen);

  const byName = new Map<string, Visit[]>();
  for (const visit of open) {
    const key = compactForSearch(visit.name);
    byName.set(key, [...(byName.get(key) ?? []), visit]);
  }

  const matched: RemittanceMatch[] = [];
  const ambiguous: AmbiguousMatch[] = [];
  const notReturned: Visit[] = [];

  for (const group of byName.values()) {
    const named = lines.filter((line) => lineNamesPatient(line, group[0].name));
    const hits = named.length;
    if (hits === 0) {
      notReturned.push(...group);
      continue;
    }
    const datesOnRemittance = [...new Set(named.flatMap(datesInLine))].sort();
    if (group.length === 1) {
      const visit = group[0];
      // Only a stated date can disagree; a remittance that prints none says nothing either way.
      const disagrees =
        datesOnRemittance.length > 0 && !datesOnRemittance.includes(visit.visitDate);
      matched.push({
        visit,
        lines: hits,
        ...(disagrees ? { datesOnRemittance } : {}),
      });
      continue;
    }

    // A shared name. A remittance scatters one patient's payments across its pages, so two
    // lines far apart may be two different visits — but when each line states its service
    // date there is nothing to choose between, and asking would be busywork. Only a visit the
    // remittance dates explicitly is settled; a namesake it says nothing about stays open.
    const datedHere = group.filter((visit) => datesOnRemittance.includes(visit.visitDate));
    if (datedHere.length > 0) {
      for (const visit of datedHere) matched.push({ visit, lines: hits });
      notReturned.push(...group.filter((visit) => !datedHere.includes(visit)));
    } else {
      // No dates to separate them by, and amounts cannot help — every visit reimburses the
      // same. This is the one case a person has to decide.
      ambiguous.push({ name: group[0].name, visits: group, lines: hits, datesOnRemittance });
    }
  }

  const order = (a: Visit, b: Visit) => a.visitDate.localeCompare(b.visitDate);
  matched.sort((a, b) => order(a.visit, b.visit));
  notReturned.sort(order);
  return { matched, ambiguous, notReturned };
}

export interface DayGroup {
  date: string;
  total: number;
  paid: number;
  outstanding: number;
  visits: Visit[];
}

/** Grouped by the day the money arrived — the basis for what the other clinic is owed. */
export function groupByPaidDate(visits: Visit[]): DayGroup[] {
  const byDate = new Map<string, Visit[]>();
  for (const visit of visits) {
    if (!isPayable(visit) || !visit.paidDate) continue;
    byDate.set(visit.paidDate, [...(byDate.get(visit.paidDate) ?? []), visit]);
  }
  return [...byDate.entries()]
    .map(([date, group]) => ({
      date,
      total: group.length,
      paid: group.length,
      outstanding: 0,
      visits: group,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Grouped by the day of the visit, which is how a bad day shows itself: everything around it
 * came back and that one did not. The spreadsheet made this visible by eye; here it is counted.
 */
export function groupByVisitDate(visits: Visit[]): DayGroup[] {
  const byDate = new Map<string, Visit[]>();
  for (const visit of visits) {
    byDate.set(visit.visitDate, [...(byDate.get(visit.visitDate) ?? []), visit]);
  }
  return [...byDate.entries()]
    .map(([date, group]) => ({
      date,
      total: group.length,
      paid: group.filter(isPayable).length,
      outstanding: group.filter((visit) => !isPayable(visit)).length,
      visits: group,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Days since a visit was submitted and still unpaid — an old one deserves a phone call. */
export const CHASE_AFTER_DAYS = 30;

export function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00`);
  const to = Date.parse(`${toISO}T00:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export function isStale(visit: Visit, todayISO: string): boolean {
  if (isPayable(visit)) return false;
  if (visit.status === "new" || visit.status === "entered") return false;
  return daysBetween(visit.visitDate, todayISO) >= CHASE_AFTER_DAYS;
}

/** One name per line, for pasting a day's bookings straight out of the spreadsheet. */
export function parseNameList(text: string, visitDate: string, now = Date.now()): Visit[] {
  const seen = new Set<string>();
  const visits: Visit[] = [];
  for (const raw of text.split(/\r?\n/)) {
    // Tolerate "Jane Doe, 9/26" or "Jane Doe — 2pm": the name is what comes first.
    const name = raw.split(/[\t,;|]/)[0].trim();
    if (!name) continue;
    const key = compactForSearch(name);
    if (seen.has(key)) continue;
    seen.add(key);
    visits.push({
      id: `${newVisitId()}-${visits.length}`,
      name,
      visitDate,
      status: "new",
      createdAt: now,
    });
  }
  return visits;
}
