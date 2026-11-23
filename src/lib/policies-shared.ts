// Labels shared by the Policies pages. No server-only code here.
export const KINDS = [
  { value: "policy", label: "Policy", plural: "Policies" },
  { value: "handbook", label: "Handbook", plural: "Handbooks" },
] as const;

export type Kind = (typeof KINDS)[number]["value"];

export const isKind = (s: string): s is Kind => KINDS.some((k) => k.value === s);
export const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? "Policy";
