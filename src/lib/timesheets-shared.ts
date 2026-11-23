// Period maths and number formatting for timesheets. No server-only code here.
import { addDays, addMonths, fmtMonth, isYmd, startOfMonth, startOfWeek, toDate } from "./dates";

/** "Mon 23 Nov 2026": titles include the year, because timesheet periods can cross New Year. */
const fmtFull = (ymd: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(toDate(ymd)).replace(",", "");

/** The hours grid can be edited for periods up to this many days; longer ones are summary-only. */
export const MAX_EDIT_DAYS = 42;
/** The longest period that can be shown or exported. */
export const MAX_SPAN_DAYS = 366;

export type View = "week" | "month" | "custom";

export type Period = {
  view: View;
  from: string;
  to: string;
  /** Used to rebuild week/month links. */
  anchor: string;
  title: string;
  days: string[];
  /** Query strings (without "?") for the Previous / Next / This-period links. */
  prev: string;
  next: string;
  current: string;
  /** True when the requested custom range was too long and had to be shortened. */
  clamped: boolean;
};

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function listDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function parsePeriod(input: { view?: string; date?: string; from?: string; to?: string }, today: string): Period {
  const view: View = input.view === "month" ? "month" : input.view === "custom" ? "custom" : "week";
  const anchor = isYmd(input.date) ? input.date : today;

  if (view === "week") {
    const from = startOfWeek(anchor);
    const to = addDays(from, 6);
    return {
      view, from, to, anchor, clamped: false, days: listDays(from, to),
      title: `${fmtFull(from)} to ${fmtFull(to)}`,
      prev: `view=week&date=${addDays(anchor, -7)}`, next: `view=week&date=${addDays(anchor, 7)}`, current: `view=week&date=${today}`,
    };
  }
  if (view === "month") {
    const from = startOfMonth(anchor);
    const to = addDays(addMonths(from, 1), -1);
    return {
      view, from, to, anchor, clamped: false, days: listDays(from, to),
      title: fmtMonth(anchor),
      prev: `view=month&date=${addMonths(from, -1)}`, next: `view=month&date=${addMonths(from, 1)}`, current: `view=month&date=${today}`,
    };
  }

  // Custom range: from/to as asked, repaired if missing, back to front or too long.
  let from = isYmd(input.from) ? input.from : startOfMonth(today);
  let to = isYmd(input.to) ? input.to : addDays(from, 13);
  if (to < from) [from, to] = [to, from];
  let clamped = false;
  if (daysBetween(from, to) + 1 > MAX_SPAN_DAYS) {
    to = addDays(from, MAX_SPAN_DAYS - 1);
    clamped = true;
  }
  const len = daysBetween(from, to) + 1;
  return {
    view, from, to, anchor, clamped, days: listDays(from, to),
    title: from === to ? fmtFull(from) : `${fmtFull(from)} to ${fmtFull(to)} (${len} days)`,
    prev: `view=custom&from=${addDays(from, -len)}&to=${addDays(from, -1)}`,
    next: `view=custom&from=${addDays(to, 1)}&to=${addDays(to, len)}`,
    current: `view=custom&from=${from}&to=${to}`,
  };
}

/** Hours as people write them: 8, 7.5, 7.25. */
export const fmtHours = (n: number) => (Math.round(n * 100) / 100).toString();

/** A number of hours typed into the grid: up to two decimal places, 0 to 24. Returns null when it is not valid. */
export function parseHours(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 24 ? n : null;
}
