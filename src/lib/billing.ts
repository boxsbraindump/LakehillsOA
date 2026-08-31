/**
 * Chasing patient balances used to be a from-scratch job: pull the balance-due list out of
 * UP, retype it into Notion, decide person by person who gets a bill, then open Square once
 * per patient. Nothing remembered last round, so every run re-triaged the same thirty people
 * already judged "coming back next week" — which is why the task kept getting postponed.
 *
 * These functions exist to make round two cheap: parse whatever UP hands over, match it
 * against what was decided last time, and surface only what actually changed.
 */

export type ColumnRole =
  | "ignore"
  | "account"
  | "name"
  | "balance"
  | "serviceDate"
  | "description"
  | "charge"
  | "insurancePaid"
  | "adjustment";

export const COLUMN_ROLES: ColumnRole[] = [
  "ignore",
  "account",
  "name",
  "balance",
  "serviceDate",
  "description",
  "charge",
  "insurancePaid",
  "adjustment",
];

/**
 * A table dragged off a web page and copied arrives space-aligned, not tab-separated, so
 * this stands in for "the columns are just gaps". Two spaces rather than one, because names
 * legitimately contain single spaces.
 */
export const MULTI_SPACE_DELIMITER = "  ";

/** Splits one delimited line, honouring "quoted, fields" so an address does not become two columns. */
function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === MULTI_SPACE_DELIMITER) {
    return line.trim().split(/\s{2,}/).map((cell) => cell.trim());
  }
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      out.push(field.trim());
      field = "";
    } else {
      field += char;
    }
  }
  out.push(field.trim());
  return out;
}

/**
 * Tab from a spreadsheet, comma from a CSV export, and column gaps from a table selected on
 * screen with the mouse — which is the only way out of some practice software.
 *
 * Commas and gaps can both be present at once, because "Alvarez, Marisol" is a comma inside a
 * field, not between two. Whichever split yields more columns is the real delimiter: on a
 * gap-aligned row the comma only finds the one inside the name, and on a true CSV there are no
 * double-space gaps to find.
 */
export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return ",";
  if (lines.some((line) => line.includes("\t"))) return "\t";

  const widestUsing = (delimiter: string) =>
    Math.max(...lines.map((line) => splitLine(line, delimiter).length));
  const byComma = lines.some((line) => line.includes(",")) ? widestUsing(",") : 1;
  const byGap = lines.some((line) => /\S {2,}\S/.test(line))
    ? widestUsing(MULTI_SPACE_DELIMITER)
    : 1;

  // Gaps win ties. "Alvarez, Marisol   43.00" splits two ways into two fields, but only the
  // gap split keeps the name whole, and a genuine CSV does not pad its columns with spaces.
  return byGap > 1 && byGap >= byComma ? MULTI_SPACE_DELIMITER : ",";
}

export interface ParsedTable {
  headers: string[] | null;
  rows: string[][];
}

/**
 * Copying out of a print-to-PDF drags the browser's own header and footer along: the page
 * URL, a "8/31/26, 11:22 AM" timestamp, and a "1/2" page counter. None of it is a patient,
 * and left in place the timestamp gets mistaken for the header row.
 */
function isPrintChrome(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^\d{1,2}\/\d{1,2}$/.test(trimmed)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?\b/i.test(trimmed)) return true;
  if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(trimmed)) return true;
  return false;
}

export function parseTable(text: string): ParsedTable {
  const body = text
    .split(/\r?\n/)
    .filter((line) => !isPrintChrome(line))
    .join("\n");
  const delimiter = detectDelimiter(body);
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: null, rows: [] };

  const grid = lines.map((line) => splitLine(line, delimiter));

  // A report title sitting on its own line ("Balance Due") is not a table row, and left in
  // place it gets read as the header. Anything with a single cell is dropped once the table
  // itself clearly has more than one column — which also catches section labels and totals
  // captions. When every line has one cell there is no table structure to protect, so the
  // rule stays out of the way.
  const filled = grid.map((row) => row.filter((cell) => cell.trim().length > 0).length);
  const widest = Math.max(...filled);
  const rows = widest > 1 ? grid.filter((_, index) => filled[index] > 1) : grid;
  if (rows.length === 0) return { headers: null, rows: [] };

  const width = Math.max(...rows.map((row) => row.length));
  const padded = rows.map((row) => [...row, ...Array(width - row.length).fill("")]);

  // A header row is text-only. If the first row already holds a dollar figure or a date it is
  // data, and treating it as a header would silently drop a patient from the import.
  const first = padded[0];
  const looksLikeHeader =
    // Never eat the only line there is: a lone row is the data, however text-like it looks.
    padded.length > 1 &&
    first.some((cell) => cell.length > 0) &&
    !first.some((cell) => parseMoney(cell) !== undefined) &&
    !first.some((cell) => parseDate(cell) !== undefined);

  return looksLikeHeader
    ? { headers: first, rows: padded.slice(1) }
    : { headers: null, rows: padded };
}

const ROLE_HINTS: { role: ColumnRole; patterns: RegExp[] }[] = [
  {
    role: "account",
    patterns: [/\baccount\b/i, /\bacct\b/i, /\bchart\b/i, /\bmrn\b/i, /\bpatient\s*(id|#|no)\b/i],
  },
  { role: "name", patterns: [/\bname\b/i, /\bpatient\b/i] },
  {
    role: "balance",
    patterns: [/\bbalance\b/i, /\bdue\b/i, /\bowed?\b/i, /\boutstanding\b/i, /\bpatient\s*resp/i],
  },
  {
    role: "serviceDate",
    patterns: [/\bdos\b/i, /date\s*of\s*service/i, /\bservice\s*date\b/i, /\bvisit\b/i],
  },
  {
    role: "description",
    patterns: [/\bdescription\b/i, /\bprocedure\b/i, /\bcpt\b/i, /\bservice\b/i, /\bcode\b/i],
  },
  { role: "charge", patterns: [/\bcharge/i, /\bbilled\b/i, /\bfee\b/i, /\bamount\b/i] },
  {
    role: "insurancePaid",
    patterns: [/insurance\s*(paid|pmt|payment)/i, /\bins\s*paid\b/i, /\bpayer\s*paid\b/i],
  },
  { role: "adjustment", patterns: [/\badjust/i, /\bwrite\s*off\b/i, /\bdiscount\b/i] },
];

/**
 * Pre-fills the column mapping from the header text. It is a starting point, not a promise —
 * the import screen shows every guess so a wrong one gets corrected before anything is stored.
 */
export function guessRoles(headers: string[] | null, columnCount: number): ColumnRole[] {
  const roles: ColumnRole[] = Array(columnCount).fill("ignore");
  if (!headers) return roles;

  const taken = new Set<ColumnRole>();
  headers.forEach((header, index) => {
    for (const { role, patterns } of ROLE_HINTS) {
      if (taken.has(role)) continue;
      if (patterns.some((pattern) => pattern.test(header))) {
        roles[index] = role;
        taken.add(role);
        return;
      }
    }
  });
  return roles;
}

/** Handles "$1,234.56", "1234.56", and the accounting "(45.00)" that means negative. */
export function parseMoney(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const negative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/[()$,\s]/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return undefined;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return undefined;
  return negative ? -value : value;
}

/** Accepts the M/D/YYYY that US practice software emits, plus ISO. Returns yyyy-mm-dd. */
export function parseDate(raw: string): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(text);
  if (!us) return undefined;
  const month = Number(us[1]);
  const day = Number(us[2]);
  let year = Number(us[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  if (us[3].length === 2) year += year < 70 ? 2000 : 1900;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatUSD(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** Two spellings of the same person should not become two rows to triage. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
}

export function patientKey(account: string, name: string): string {
  const acct = account.trim();
  if (acct) return `acct:${acct.toLowerCase()}`;
  return `name:${normalizeName(name)}`;
}

export interface BillingLine {
  serviceDate?: string;
  description?: string;
  charge?: number;
  insurancePaid?: number;
  adjustment?: number;
  balance: number;
}

export interface ImportedPatient {
  key: string;
  account: string;
  name: string;
  balance: number;
  lines: BillingLine[];
}

/**
 * Collapses the raw grid into one entry per patient. An export with a row per claim and an
 * export with a row per patient both land here — the per-claim rows just become the statement
 * lines, which is the detail a patient needs to understand what they are paying for.
 */
export function buildImportedPatients(rows: string[][], roles: ColumnRole[]): ImportedPatient[] {
  const indexOf = (role: ColumnRole) => roles.indexOf(role);
  const accountIdx = indexOf("account");
  const nameIdx = indexOf("name");
  const balanceIdx = indexOf("balance");
  const dateIdx = indexOf("serviceDate");
  const descIdx = indexOf("description");
  const chargeIdx = indexOf("charge");
  const insIdx = indexOf("insurancePaid");
  const adjIdx = indexOf("adjustment");

  const cell = (row: string[], index: number) => (index >= 0 ? (row[index] ?? "") : "");
  const byKey = new Map<string, ImportedPatient>();

  for (const row of rows) {
    const account = cell(row, accountIdx);
    const name = cell(row, nameIdx);
    if (!account.trim() && !name.trim()) continue;

    const parsedBalance = parseMoney(cell(row, balanceIdx));
    // Once a balance column is mapped, a row without a readable amount is not a patient
    // balance — it is a stray header, a section label, or leftover page furniture.
    if (balanceIdx >= 0 && parsedBalance === undefined) continue;
    const balance = parsedBalance ?? 0;
    const key = patientKey(account, name);
    const line: BillingLine = {
      serviceDate: parseDate(cell(row, dateIdx)),
      description: cell(row, descIdx) || undefined,
      charge: parseMoney(cell(row, chargeIdx)),
      insurancePaid: parseMoney(cell(row, insIdx)),
      adjustment: parseMoney(cell(row, adjIdx)),
      balance,
    };

    const existing = byKey.get(key);
    if (existing) {
      existing.balance += balance;
      existing.lines.push(line);
      if (!existing.account && account.trim()) existing.account = account.trim();
      if (!existing.name && name.trim()) existing.name = name.trim();
    } else {
      byKey.set(key, { key, account: account.trim(), name: name.trim(), balance, lines: [line] });
    }
  }

  return [...byKey.values()];
}

export type BillingDecision = "returning" | "waiting-insurance" | "send-bill" | "sent";

export interface BillingPatient {
  key: string;
  account: string;
  name: string;
  balance: number;
  lines: BillingLine[];
  decision: BillingDecision | null;
  /** For "returning" it is when they are expected back; for "waiting-insurance", when the claim went out. */
  decisionDate?: string;
  decidedAt?: number;
  /** Balance when the decision was made, so a changed amount can pull the row back for review. */
  balanceAtDecision?: number;
  sentAt?: number;
  note?: string;
  /** The patient's own Square link, pasted in — every balance differs, so there is one per person. */
  payLink?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  /** Dropped out of the latest import, so the balance is gone — they paid or it was written off. */
  clearedAt?: number;
}

export interface MergeResult {
  merged: BillingPatient[];
  addedKeys: string[];
  changedKeys: string[];
  clearedKeys: string[];
}

/**
 * The whole point of the feature. Decisions survive the next import, so a run costs only what
 * actually moved: new balances, amounts that shifted, and people who dropped off the report
 * entirely — which is how you find out someone paid.
 */
export function mergeImport(
  existing: BillingPatient[],
  imported: ImportedPatient[],
  now: number,
): MergeResult {
  const existingByKey = new Map(existing.map((patient) => [patient.key, patient]));
  const importedKeys = new Set(imported.map((patient) => patient.key));
  const addedKeys: string[] = [];
  const changedKeys: string[] = [];
  const clearedKeys: string[] = [];
  const merged: BillingPatient[] = [];

  for (const incoming of imported) {
    const prior = existingByKey.get(incoming.key);
    if (!prior) {
      addedKeys.push(incoming.key);
      merged.push({
        key: incoming.key,
        account: incoming.account,
        name: incoming.name,
        balance: incoming.balance,
        lines: incoming.lines,
        decision: null,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      continue;
    }

    // A balance that moved after you decided means the situation changed — insurance paid part
    // of it, or another visit was added. Either way the old call may no longer hold.
    const amountMoved =
      prior.decision !== null &&
      prior.balanceAtDecision !== undefined &&
      Math.abs(prior.balanceAtDecision - incoming.balance) > 0.004;
    if (amountMoved) changedKeys.push(incoming.key);

    merged.push({
      ...prior,
      account: incoming.account || prior.account,
      name: incoming.name || prior.name,
      balance: incoming.balance,
      lines: incoming.lines,
      lastSeenAt: now,
      clearedAt: undefined,
    });
  }

  for (const prior of existing) {
    if (importedKeys.has(prior.key)) continue;
    if (prior.clearedAt) {
      merged.push(prior);
      continue;
    }
    clearedKeys.push(prior.key);
    merged.push({ ...prior, clearedAt: now });
  }

  return { merged, addedKeys, changedKeys, clearedKeys };
}

export function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00`);
  const to = Date.parse(`${toISO}T00:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/** How long a claim can sit before it deserves a phone call rather than more patience. */
export const INSURANCE_FOLLOWUP_DAYS = 30;

export type BillingBucket = "todo" | "returning" | "waiting" | "sendBill" | "sent" | "cleared";

/**
 * Buckets are states with a clock, not folders. Someone expected back last month who still
 * owes money falls out of "returning" on its own — otherwise that bucket quietly becomes the
 * place decisions go to die, which is what happened in Notion.
 */
export function bucketOf(patient: BillingPatient, todayISO: string): BillingBucket {
  if (patient.clearedAt) return "cleared";
  if (patient.decision === null) return "todo";

  if (
    patient.balanceAtDecision !== undefined &&
    Math.abs(patient.balanceAtDecision - patient.balance) > 0.004
  ) {
    return "todo";
  }

  if (patient.decision === "returning") {
    if (patient.decisionDate && daysBetween(patient.decisionDate, todayISO) > 0) return "todo";
    return "returning";
  }
  if (patient.decision === "waiting-insurance") return "waiting";
  if (patient.decision === "send-bill") return "sendBill";
  return "sent";
}

/** Days a claim has been pending, or undefined when no submission date was recorded. */
export function waitingDays(patient: BillingPatient, todayISO: string): number | undefined {
  if (patient.decision !== "waiting-insurance" || !patient.decisionDate) return undefined;
  return daysBetween(patient.decisionDate, todayISO);
}

export function totalBalance(patients: BillingPatient[]): number {
  return patients.reduce((sum, patient) => sum + patient.balance, 0);
}

export interface ClinicProfile {
  name: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  payInstructions: string;
}

export const EMPTY_CLINIC_PROFILE: ClinicProfile = {
  name: "",
  addressLine1: "",
  addressLine2: "",
  phone: "",
  payInstructions: "",
};
