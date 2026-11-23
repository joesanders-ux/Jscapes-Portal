// Shared helpers for shifts. No server-only code here.

/** "08:00:00" -> "08:00" */
export const hhmm = (t: string) => t.slice(0, 5);

/** A shift as people read it: "08:00 to 16:30". */
export const fmtRange = (start: string, end: string) => `${hhmm(start)} to ${hhmm(end)}`;

/** Staff are always shown shift times as approximate. */
export const APPROX = "approx.";
export const APPROX_NOTE = "Shift times are approximate and may change. The office will tell you if they do.";

export const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
