// Shared by the server and the browser form. No server-only code here.

export const STATUSES = ["available", "not_provided", "not_available"] as const;
export type Status = (typeof STATUSES)[number];
export const isStatus = (v: unknown): v is Status => typeof v === "string" && (STATUSES as readonly string[]).includes(v);

// Every status has a text label AND a symbol, so colour is never the only cue.
export const STATUS_META: Record<Status, { label: string; symbol: string; classes: string }> = {
  available: { label: "Available", symbol: "✓", classes: "border-brand-text bg-brand-soft text-brand-text" },
  not_provided: { label: "Not provided", symbol: "–", classes: "border-line bg-surface text-ink-muted" },
  not_available: { label: "Not available", symbol: "✗", classes: "border-danger bg-white text-danger" },
};

/** How far ahead availability can be entered (days from today). */
export const MAX_DAYS_AHEAD = 365;
/** Longest span a single change request can cover (days). Matches the database constraint. */
export const MAX_REQUEST_SPAN = 92;
/** Staff are reminded to enter next month's availability by this day of the month. */
export const REMINDER_DAY = 15;
