// Shared by the server and the browser form. No server-only code here.

// Phrased so that "Yes" is always the good answer.
export const CHECK_ITEMS = [
  { key: "oil", label: "Oil level OK" },
  { key: "tyres", label: "Tyres OK" },
  { key: "lights", label: "Lights OK" },
  { key: "dashboard", label: "No dashboard warnings" },
  { key: "clean", label: "Cleanliness OK" },
] as const;
export type ItemKey = (typeof CHECK_ITEMS)[number]["key"];

// Each condition has a text label and a symbol, so colour is never the only cue.
export const CONDITIONS = {
  poor: { label: "Poor", detail: "unsafe to drive", symbol: "▲", classes: "border-danger text-danger" },
  moderate: { label: "Moderate", detail: "needs improvement", symbol: "◆", classes: "border-warn text-warn" },
  compliant: { label: "Compliant", detail: "safe to drive", symbol: "✓", classes: "border-brand-text text-brand-text" },
} as const;
export type ConditionKey = keyof typeof CONDITIONS;
export const isCondition = (v: unknown): v is ConditionKey => typeof v === "string" && v in CONDITIONS;
