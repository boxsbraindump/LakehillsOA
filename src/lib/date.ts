/** Local-time YYYY-MM-DD key — deliberately not UTC, so "today" matches the user's clock. */
export function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayKey() {
  return formatDateKey(new Date());
}

export function shiftDateKey(dateKey: string, days: number) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatDateKey(date);
}

export function formatDisplayDate(dateKey: string, lang: "zh" | "en" = "zh") {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/** "2026-09-28" -> "2026-09". */
export function monthKeyOf(dateKey: string) {
  return dateKey.slice(0, 7);
}

export function shiftMonthKey(monthKey: string, months: number) {
  const [y, m] = monthKey.split("-").map(Number);
  const date = new Date(y, m - 1 + months, 1);
  return monthKeyOf(formatDateKey(date));
}

/**
 * The 42 days a month grid shows: the month itself, padded with the tail of the previous month
 * and the head of the next so every row is a full week. Six rows always, so the grid does not
 * change height as you page through months.
 */
export function monthGridDays(monthKey: string, weekStartsOn = 0): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const start = new Date(y, m - 1, 1 - lead);
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return formatDateKey(day);
  });
}
