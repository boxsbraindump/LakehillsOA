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
import { formatDateKey } from "./date";

/**
 * The spreadsheet's four colours plus the case it had no colour for. `new` is the blank cell —
 * the other clinic has booked someone and Bellevue has not touched it yet.
 */
export type VisitStatus = "new" | "entered" | "submitted" | "paid" | "denied";

export const VISIT_STATUSES: VisitStatus[] = ["new", "entered", "submitted", "paid", "denied"];

/** One status change, and when somebody made it. */
export interface StatusEvent {
  status: VisitStatus;
  /** Epoch ms — when the person clicked, not the date the thing happened out in the world. */
  at: number;
}

export interface Visit {
  id: string;
  name: string;
  /** yyyy-mm-dd — the day the patient was seen. */
  visitDate: string;
  /**
   * HH:MM, 24-hour — the appointment time, when the sheet states one.
   *
   * Optional because plenty of rows are only ever a date. Where it exists it also separates two
   * visits by the same person on the same day, which a date alone cannot.
   */
  visitTime?: string;
  status: VisitStatus;
  /**
   * The day each step actually happened — not the day somebody got round to recording it.
   *
   * "哪一天我们报了 OA，哪一天回的钱" is the question the clinic could never answer, and an
   * event timestamp cannot answer it either: a batch submitted on Monday and ticked off on
   * Wednesday would read as Wednesday. So each step keeps its own date, defaulted to today
   * when the status changes and editable afterwards. {@link history} still records when the
   * click happened; these record when the work happened.
   */
  enteredDate?: string;
  submittedDate?: string;
  /** yyyy-mm-dd — the day the money arrived. Only meaningful once paid. */
  paidDate?: string;
  note?: string;
  createdAt: number;
  /** A {@link ServiceTag} id — which part of the body this visit treated. */
  serviceTag?: string;
  /**
   * Every status this visit has been through, oldest first. `status` is the last entry's
   * status; this exists so a patient's page can answer "when did we do that" — which the old
   * spreadsheet could never answer, because a cell colour overwrites the colour before it.
   *
   * Optional, because records written before this existed have none. Read it through
   * {@link visitHistory}, never directly.
   */
  history?: StatusEvent[];
}

/**
 * The visit's trail, back-filled for records that predate it.
 *
 * A legacy record knows two things for certain: it was created at `createdAt`, and if it is
 * paid, the money arrived on `paidDate`. Everything between those was not recorded and is not
 * invented — the trail simply starts where the evidence does.
 */
export function visitHistory(visit: Visit): StatusEvent[] {
  if (visit.history && visit.history.length > 0) return visit.history;
  const trail: StatusEvent[] = [{ status: "new", at: visit.createdAt }];
  if (visit.status !== "new") {
    trail.push({
      status: visit.status,
      // A paid date is a date, not a time; noon keeps it on the right day in any timezone.
      at: visit.paidDate ? new Date(`${visit.paidDate}T12:00:00`).getTime() : visit.createdAt,
    });
  }
  return trail;
}

/** When the visit last moved. Used for the "最近操作" column, so it sorts. */
export function lastTouchedAt(visit: Visit): number {
  const trail = visitHistory(visit);
  return trail[trail.length - 1]?.at ?? visit.createdAt;
}

/**
 * Apply a status change and record it, in one place so nothing can move without a trail.
 *
 * `onDate` is the day the work happened, which is not always today — a batch reported to
 * Office Ally on Friday may only be ticked off on Monday. Steps after the new status have
 * their dates cleared: a visit pushed back from paid to submitted has no payment date any
 * more, and leaving one behind would keep it in the week's payout figure.
 */
export function withStatus(
  visit: Visit,
  status: VisitStatus,
  onDate?: string,
  at = Date.now(),
): Visit {
  const next: Visit = {
    ...visit,
    status,
    history: [...visitHistory(visit), { status, at }],
  };

  for (const field of ["enteredDate", "submittedDate", "paidDate"] as const) {
    if (FIELD_RANK[field] > STEP_RANK[status]) next[field] = undefined;
  }

  const field = DATE_FIELD[status];
  if (field) next[field] = onDate ?? formatDateKey(new Date(at));

  return next;
}

/**
 * When each step happened, for a visit that may predate the dates being stored.
 *
 * A record written before this existed has only its trail, so the day of its last event with
 * that status is the best that is actually known. Nothing is invented for a step that never
 * happened.
 */
export function operationDates(visit: Visit): {
  entered?: string;
  submitted?: string;
  paid?: string;
} {
  const fromHistory = (status: VisitStatus): string | undefined => {
    const events = visitHistory(visit).filter((event) => event.status === status);
    const last = events[events.length - 1];
    return last ? formatDateKey(new Date(last.at)) : undefined;
  };

  return {
    entered: visit.enteredDate ?? (STEP_RANK[visit.status] >= 1 ? fromHistory("entered") : undefined),
    submitted:
      visit.submittedDate ?? (STEP_RANK[visit.status] >= 2 ? fromHistory("submitted") : undefined),
    paid: visit.paidDate,
  };
}

/**
 * How far through the clinic's own work a status is. `denied` sits level with `submitted`:
 * it has been reported to Office Ally, it just has to go again.
 */
const STEP_RANK: Record<VisitStatus, number> = {
  new: 0,
  entered: 1,
  submitted: 2,
  denied: 2,
  paid: 3,
};

/** Which date field a status owns, if any. `new` owns none — that is the other clinic's doing. */
const DATE_FIELD: Partial<Record<VisitStatus, "enteredDate" | "submittedDate" | "paidDate">> = {
  entered: "enteredDate",
  submitted: "submittedDate",
  paid: "paidDate",
};

const FIELD_RANK: Record<"enteredDate" | "submittedDate" | "paidDate", number> = {
  enteredDate: 1,
  submittedDate: 2,
  paidDate: 3,
};

/**
 * Which stored date a status owns, for callers that need to set it without moving the visit.
 * Re-stating a status a visit already has is a date correction, not a new step.
 */
export function dateFieldFor(status: VisitStatus) {
  return DATE_FIELD[status];
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

  // Year first is unambiguous, whatever the separator. A Chinese-locale Excel writes
  // "2026/10/2", which is what a pasted spreadsheet actually contains — reading that as
  // month 2026 and giving up was why a real paste imported nothing.
  for (const [, y, m, d] of line.matchAll(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) {
    keep(Number(y), Number(m), Number(d));
  }
  // Year last: the US order a remittance prints, with any of the three separators.
  for (const [, m, d, y] of line.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/g)) {
    const year = Number(y) < 100 ? Number(y) + 2000 : Number(y);
    keep(year, Number(m), Number(d));
  }
  for (const [, y, m, d] of line.matchAll(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g)) {
    keep(Number(y), Number(m), Number(d));
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

/** What one patient's whole record adds up to. */
export interface PatientRecord {
  name: string;
  visits: Visit[];
  total: number;
  paid: number;
  /** Claimed and still waiting — submitted or denied. */
  open: number;
  denied: number;
  /** Not claimed yet: still to go into UP, or in UP and not yet sent to Office Ally. */
  notClaimed: number;
  firstVisit: string;
  lastVisit: string;
}

/**
 * Everyone, folded by name.
 *
 * Names are matched case- and spacing-insensitively so "Wen Li" and "wen  li" are one person,
 * but the spelling shown is the one first entered — correcting a patient's name is the user's
 * call, not something to do silently behind their back.
 */
export function groupByPatient(visits: Visit[]): PatientRecord[] {
  const byKey = new Map<string, Visit[]>();
  for (const visit of visits) {
    const key = compactForSearch(visit.name);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(visit);
    else byKey.set(key, [visit]);
  }

  return [...byKey.values()]
    .map((group) => {
      const sorted = [...group].sort((a, b) => a.visitDate.localeCompare(b.visitDate));
      return {
        name: sorted[0].name,
        visits: [...sorted].reverse(),
        total: sorted.length,
        paid: sorted.filter((v) => v.status === "paid").length,
        open: sorted.filter(isOpen).length,
        denied: sorted.filter((v) => v.status === "denied").length,
        notClaimed: sorted.filter((v) => v.status === "new" || v.status === "entered").length,
        firstVisit: sorted[0].visitDate,
        lastVisit: sorted[sorted.length - 1].visitDate,
      };
    })
    .sort((a, b) => b.lastVisit.localeCompare(a.lastVisit) || compareNames(a.name, b.name));
}

/**
 * Free-text filter over the flat list: matches a name, or any part of a date.
 *
 * Typing "09-15" should find that day and typing "li" should find Wen Li, without the user
 * having to say which kind of thing they are typing.
 */
export function matchesQuery(visit: Visit, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const needle = compactForSearch(q);
  if (!needle) return true;
  return (
    compactForSearch(visit.name).includes(needle) ||
    visit.visitDate.includes(q.trim()) ||
    (visit.paidDate ?? "").includes(q.trim())
  );
}

/**
 * Visits keyed by the day a calendar cell stands for.
 *
 * Which day that is depends on the question: "when was this person seen" and "when did the
 * money for it arrive" are different calendars, and the clinic needs both — a payment lands on
 * one day for visits scattered across months, which is the whole reason the sheet stopped
 * working. Unpaid visits simply have no cell in the paid calendar.
 */
export type DateLens = "visit" | "submitted" | "paid";

export function bucketByDate(visits: Visit[], mode: DateLens): Map<string, Visit[]> {
  const byDay = new Map<string, Visit[]>();
  for (const visit of visits) {
    const key =
      mode === "paid"
        ? operationDates(visit).paid
        : mode === "submitted"
          ? operationDates(visit).submitted
          : visit.visitDate;
    if (!key) continue;
    const bucket = byDay.get(key);
    if (bucket) bucket.push(visit);
    else byDay.set(key, [visit]);
  }
  for (const bucket of byDay.values()) bucket.sort((a, b) => compareNames(a.name, b.name));
  return byDay;
}

/** Anything shaped like a date, so it can be lifted out of a cell and off a name. */
const DATE_TOKEN =
  /(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日?)|\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{8})\b/g;

/** Money, row numbers and codes — never a name, always in the way of finding one. */
const NOISE_TOKEN = /\$\s?[\d,]+(?:\.\d{2})?|\b\d+(?:\.\d{2})?\b/g;

export interface ParsedVisitRow {
  name: string;
  visitDate: string;
  /** True when the row stated no date of its own and fell back to the one the user chose. */
  usedFallbackDate: boolean;
  /** HH:MM, when the sheet gave one. */
  visitTime?: string;
  /**
   * Whatever text the row carried besides the name — their sheet already has a column saying
   * which part of the body was treated, and re-entering that by hand would be absurd.
   */
  service?: string;
}

/**
 * Rows pasted straight out of a spreadsheet.
 *
 * The other clinic keeps its bookings in Excel, and retyping them is the data-entry step this
 * tool exists to remove. A pasted selection arrives tab-separated, but which column is which is
 * not knowable — so nothing is assumed about column order: each row's date is whatever in it
 * looks like a date, and the name is the first thing left once dates, money and bare numbers
 * are taken out. A row with no date of its own falls back to the date the user picked, and says
 * so, rather than being silently dated today.
 *
 * One name per line either way, so a plain list of names still works.
 */
/**
 * Split one pasted line into cells.
 *
 * Tabs are what a spreadsheet actually sends, so they win outright. Falling back to whitespace
 * alone was wrong for a .csv: the whole line stayed one cell, and a header of "Name,Date" then
 * looked like a patient with a visit under it.
 */
function splitCells(line: string): string[] {
  const by = line.includes("\t") ? /\t/ : /\s{2,}/.test(line) ? /\s{2,}/ : /,/;
  return line.split(by).map((cell) => cell.trim());
}

/**
 * A date written without a year, which is how people write dates in a working sheet.
 *
 * The year is taken from the date the user is importing against. A sheet opened in January can
 * still hold December's visits, so a date landing far in the future is read as last year's
 * rather than next year's — being three months early is possible, being nine months late is not.
 */
function withInferredYear(month: number, day: number, reference: string): string {
  const iso = (year: number) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const year = Number(reference.slice(0, 4));
  const guess = iso(year);
  const ahead = (Date.parse(guess) - Date.parse(reference)) / 86400000;
  return ahead > 92 ? iso(year - 1) : guess;
}

/**
 * Read one cell as "a date, and whatever else was written next to it".
 *
 * Their sheet writes a visit as "09/18 肩颈" — the date and the body area share a cell, with a
 * single space between, so neither can be found by splitting on whitespace.
 */
/**
 * A clock time written in a cell: "2:30", "14:30", "2:30 PM".
 *
 * Read before anything else strips the cell, because a bare "2.30" would otherwise be taken for
 * a date. A colon is required for exactly that reason — it is the one separator a date never
 * uses here.
 */
export function readCellTime(cell: string): { time: string; rest: string } | null {
  const match = /(?:^|[^\d:])(\d{1,2}):([0-5]\d)\s*([ap])\.?m?\.?/i.exec(cell)
    ?? /(?:^|[^\d:])(\d{1,2}):([0-5]\d)(?![\d:])/.exec(cell);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2];
  const half = match[3]?.toLowerCase();

  if (half === "p" && hour < 12) hour += 12;
  else if (half === "a" && hour === 12) hour = 0;
  else if (!half && hour >= 1 && hour <= 6) {
    // A bare "2:30" in a clinic sheet is the afternoon. Nobody is seen at half past two in the
    // morning, so reading it literally would be right by the clock and wrong in every record.
    // Hours 7-12 are left alone: a 7:30 or 9:00 appointment really can be morning.
    hour += 12;
  }
  if (hour > 23) return null;

  const at = cell.indexOf(match[0]);
  const rest = (cell.slice(0, at) + " " + cell.slice(at + match[0].length))
    .replace(/\s+/g, " ")
    .trim();
  return { time: `${String(hour).padStart(2, "0")}:${minute}`, rest };
}

export function readCellDate(
  cell: string,
  reference: string,
): { date: string; time?: string; rest: string } | null {
  const strip = (text: string, from: number, length: number) =>
    (text.slice(0, from) + " " + text.slice(from + length)).replace(/\s+/g, " ").trim();

  // Lift the time out first so nothing downstream mistakes it for part of a date.
  const clock = readCellTime(cell);
  const body = clock ? clock.rest : cell;
  const withTime = (result: { date: string; rest: string }) =>
    clock ? { ...result, time: clock.time } : result;

  const full = datesInLine(body);
  if (full.length > 0) {
    return withTime({
      date: full[0],
      rest: body.replace(DATE_TOKEN, " ").replace(/\s+/g, " ").trim(),
    });
  }

  const partial = /(?:^|[^\d])(\d{1,2})[-/.](\d{1,2})(?![\d/.-])/.exec(body);
  if (!partial) return null;
  const month = Number(partial[1]);
  const day = Number(partial[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const at = partial.index + partial[0].length - (partial[1].length + partial[2].length + 1);
  return withTime({
    date: withInferredYear(month, day, reference),
    rest: strip(body, at, partial[1].length + partial[2].length + 1),
  });
}

/**
 * Is this grid one patient per *column*?
 *
 * Their sheet puts each patient's name in the header row and that patient's visits down the
 * column beneath it, which is the opposite of one-row-per-record and was being read as garbage.
 * The two shapes are told apart by a single question: in a columnar sheet every filled cell
 * below the header carries a date, because every one of them *is* a visit. A row-per-record
 * sheet always has a name cell with no date in it.
 */
function looksColumnar(grid: string[][], reference: string): boolean {
  if (grid.length < 2) return false;
  const header = grid[0].filter(Boolean);
  if (header.length === 0) return false;
  // A header naming a patient never states a date; a row of data always does.
  if (header.some((cell) => readCellDate(cell, reference))) return false;

  const body = grid.slice(1).flatMap((row) => row.filter(Boolean));
  if (body.length === 0) return false;
  return body.every((cell) => readCellDate(cell, reference) !== null);
}

const COLUMN_LABEL = /^(name|patient|patient name|date|service|area|姓名|患者|病人|日期|部位)$/i;

/**
 * Rows pasted or read out of a spreadsheet, in either shape the clinic writes.
 *
 * Which column is which is never assumed: a row's date is whatever in it looks like a date, and
 * the name is what is left once dates, money and bare numbers are taken out. A row with no date
 * of its own falls back to the date the user picked, and says so, rather than being silently
 * dated today.
 */
export function parseVisitRows(text: string, fallbackDate: string): ParsedVisitRow[] {
  const grid = text
    .split(/\r?\n/)
    .map(splitCells)
    .filter((row) => row.some((cell) => cell.length > 0));

  if (grid.length === 0) return [];

  if (looksColumnar(grid, fallbackDate)) {
    const rows: ParsedVisitRow[] = [];
    grid[0].forEach((name, column) => {
      const patient = name.trim();
      if (!patient || COLUMN_LABEL.test(patient)) return;
      for (const row of grid.slice(1)) {
        const cell = row[column]?.trim();
        if (!cell) continue;
        const read = readCellDate(cell, fallbackDate);
        if (!read) continue;
        rows.push({
          name: patient,
          visitDate: read.date,
          usedFallbackDate: false,
          ...(read.time ? { visitTime: read.time } : {}),
          ...(read.rest ? { service: read.rest } : {}),
        });
      }
    });
    return rows;
  }

  const rows: ParsedVisitRow[] = [];
  for (const cells of grid) {
    const clock = readCellTime(cells.join(" "));
    const line = (clock ? cells.map((c) => readCellTime(c)?.rest ?? c) : cells).join("\t");
    const dates = datesInLine(line);
    const cleaned = line
      .replace(DATE_TOKEN, "\t")
      .replace(NOISE_TOKEN, " ")
      .replace(/[|;]/g, "\t");

    const words = cleaned
      .split(/\t|\s{2,}|,/)
      .map((cell) => cell.trim().replace(/\s+/g, " "))
      // Two characters minimum for Latin, so a stray initial is not read as a name — but a
      // single Chinese character is a whole word, and "头" is exactly the kind of thing this
      // column holds.
      .filter(
        (cell) => /[\u4e00-\u9fff]/.test(cell) || (cell.length > 1 && /[A-Za-z]/.test(cell)),
      );

    const [name, ...rest] = words;
    if (!name) continue;
    // A spreadsheet's header row names its columns; it is not a patient.
    if (COLUMN_LABEL.test(name)) continue;

    rows.push({
      name,
      visitDate: dates[0] ?? fallbackDate,
      usedFallbackDate: dates.length === 0,
      ...(clock ? { visitTime: clock.time } : {}),
      ...(rest[0] ? { service: rest[0] } : {}),
    });
  }

  return rows;
}

/** One thing that was done, and to whom. */
export interface ActivityEntry {
  visit: Visit;
  status: VisitStatus;
  at: number;
}

export interface DayActivity {
  date: string;
  entries: ActivityEntry[];
  /** How many of each kind of change happened that day. */
  counts: Record<VisitStatus, number>;
  /** Work this clinic did — everything except a visit first appearing. */
  total: number;
  /** Visits that arrived that day, counted apart from the work. */
  added: number;
}

/**
 * What was actually done on a given day.
 *
 * `new` is left out of the total on purpose: a visit appearing is the other clinic booking
 * someone, not work this clinic did. It is counted separately so an import is still visible.
 *
 * This is the question the clinic asked the page to answer — "让我知道我今天弄了多少事情" — and
 * it is only answerable because every status change is timestamped. A spreadsheet of coloured
 * cells cannot answer it at all: recolouring a cell leaves no trace of when, so a day's work
 * disappears the moment it is done.
 *
 * Days are compared in local time, because "today" means the user's today, not UTC's.
 */
export function activityOn(visits: Visit[], dateKey: string): DayActivity {
  const entries: ActivityEntry[] = [];
  const counts: Record<VisitStatus, number> = {
    new: 0,
    entered: 0,
    submitted: 0,
    paid: 0,
    denied: 0,
  };

  for (const visit of visits) {
    for (const event of visitHistory(visit)) {
      if (formatDateKey(new Date(event.at)) !== dateKey) continue;
      entries.push({ visit, status: event.status, at: event.at });
      counts[event.status] += 1;
    }
  }

  entries.sort((a, b) => b.at - a.at);
  // The work is UP, Office Ally and chasing the money. A booking arriving is not this clinic
  // doing something, so it is reported beside the figure rather than inside it.
  return { date: dateKey, entries, counts, total: entries.length - counts.new, added: counts.new };
}

/**
 * Every day that had activity, newest first.
 *
 * The clinic does one kind of work per day — Monday the week's visits go into Unified Practice,
 * Friday the claims go to Office Ally, some later day the money lands — so the useful shape is
 * not "today" but a run of days, each saying what was done on it. That is the page's whole job:
 * 主页面显示那一天我干了什么.
 */
export function activityLog(visits: Visit[]): DayActivity[] {
  const days = new Set<string>();
  for (const visit of visits) {
    for (const event of visitHistory(visit)) days.add(formatDateKey(new Date(event.at)));
  }
  return [...days]
    .sort((a, b) => b.localeCompare(a))
    .map((day) => activityOn(visits, day))
    .filter((day) => day.total > 0 || day.added > 0);
}

/**
 * The step this visit is currently at, and the day that step was done.
 *
 * Three date columns beside a status column said the same thing twice: a visit reading
 * "已报 OA" with a date of 09/22 *is* "we reported it on the 22nd". So the ledger shows the
 * status and one date, and which field that date belongs to follows from the status.
 *
 * `new` has no date of its own on purpose — a visit appearing is the other clinic booking
 * someone, not a step this clinic performed.
 */
export function currentStep(visit: Visit): {
  field?: "enteredDate" | "submittedDate" | "paidDate";
  date?: string;
} {
  const dates = operationDates(visit);
  if (visit.status === "paid") return { field: "paidDate", date: dates.paid };
  if (visit.status === "submitted" || visit.status === "denied") {
    return { field: "submittedDate", date: dates.submitted };
  }
  if (visit.status === "entered") return { field: "enteredDate", date: dates.entered };
  return {};
}

/**
 * What makes two rows the same visit: the same person, on the same day.
 *
 * The clinic re-imports its spreadsheet as the week fills up rather than trimming it down to
 * only the new names, so an import has to be able to say "I already have this one". The name is
 * folded the same way search folds it, so "Wen Li" and "wen  li" are one person here too.
 *
 * The body area is deliberately not part of the key: treating the same person on the same day
 * as two visits because someone typed 肩颈 one week and 肩颈/斜方肌 the next would defeat the
 * point.
 */
/**
 * Compare two names for ordering, ignoring case.
 *
 * The clinic types patients in capitals, and a plain localeCompare returns non-zero between
 * "CICI HE" and "cici he" — which meant the date tiebreak after it never ran, and one
 * patient’s visits came out 09-02, 09-03, 09-01. "base" sensitivity treats case and accent
 * differences as equal so the next key decides.
 */
export function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function visitKey(name: string, visitDate: string, visitTime?: string): string {
  // A time, where the sheet gives one, is what separates two visits on the same day — the one
  // case a date alone cannot settle.
  return `${compactForSearch(name)}|${visitDate}${visitTime ? `|${visitTime}` : ""}`;
}

export function visitKeys(visits: Visit[]): Set<string> {
  return new Set(visits.map((visit) => visitKey(visit.name, visit.visitDate, visit.visitTime)));
}
