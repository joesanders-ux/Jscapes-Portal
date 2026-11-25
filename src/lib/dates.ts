// Date helpers working on "YYYY-MM-DD" strings (UTC arithmetic, no time-zone drift).
// Weeks start on Monday (UK).

export const toDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
export const toYmd = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (ymd: string, n: number) => {
  const d = toDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return toYmd(d);
};
export const isYmd = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDate(s).getTime());

export function todayLondon(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

export function startOfWeek(ymd: string): string {
  const dow = (toDate(ymd).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(ymd, -dow);
}

export function startOfMonth(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function addMonths(ymd: string, n: number): string {
  const d = toDate(startOfMonth(ymd));
  d.setUTCMonth(d.getUTCMonth() + n);
  return toYmd(d);
}

/** All days shown in a month grid: whole Monday-to-Sunday weeks covering the month. */
export function monthGridDays(ymd: string): string[] {
  const first = startOfMonth(ymd);
  const last = addDays(addMonths(first, 1), -1);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => (ymd: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(toDate(ymd));

export const fmtLong = fmt({ weekday: "long", day: "numeric", month: "long" });
export const fmtShort = fmt({ weekday: "short", day: "numeric", month: "short" });
export const fmtMonth = fmt({ month: "long", year: "numeric" });
export const fmtDayNum = fmt({ day: "numeric" });
export const fmtWeekday = fmt({ weekday: "short" });

/** 25/11/2026 style, for printed documents (the PDF exports). */
export const fmtDmy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
