// Shared by the server and the browser form. No server-only code here.

export type ItemDef = { label: string; /** can be answered "Not required" */ optional?: boolean };

// Every checklist item, phrased so that "Yes" is always the good answer.
// An item that appears in more than one category has one label everywhere.
export const ITEMS = {
  grease: { label: "Greased / lubricated" },
  sharpening: { label: "Sharpened (if required)", optional: true },
  defects: { label: "No defects found" },
  cleaning: { label: "Cleaned" },
  deck: { label: "Cutting deck, wheels and grass collection bag OK" },
  air_filter: { label: "Air filter OK" },
  oil: { label: "Oil level OK" },
  fuel: { label: "Fuel OK" },
  pull_cord: { label: "Pull cord and general condition OK" },
  fuel_mix: { label: "Fuel mix correct" },
  oil_attachments: { label: "Oil / chainsaw attachments OK" },
} as const satisfies Record<string, ItemDef>;
export type ItemKey = keyof typeof ITEMS;

// Categories and the checks each one gets, in the order they are asked.
export const CATEGORIES = {
  hand_tools: { label: "Hand tools", items: ["grease", "sharpening", "defects", "cleaning"] },
  lawn_mower: { label: "Lawn mowers", items: ["deck", "air_filter", "oil", "fuel", "pull_cord"] },
  petrol: { label: "Petrol equipment", items: ["grease", "sharpening", "defects", "cleaning", "fuel_mix", "oil_attachments"] },
  // What new equipment gets: the admin does not choose a category when adding it. The other three
  // are kept so equipment added earlier keeps its checklist and its check history stays comparable.
  general: { label: "General equipment", items: ["grease", "defects", "cleaning"] },
} as const satisfies Record<string, { label: string; items: readonly ItemKey[] }>;
export type CategoryKey = keyof typeof CATEGORIES;

export const isCategory = (v: unknown): v is CategoryKey => typeof v === "string" && Object.prototype.hasOwnProperty.call(CATEGORIES, v);
export const isItemKey = (v: string): v is ItemKey => Object.prototype.hasOwnProperty.call(ITEMS, v);
export const isOptionalItem = (key: ItemKey) => "optional" in ITEMS[key] && ITEMS[key].optional === true;

export type Result = "yes" | "no" | "na";
export const RESULT_LABEL: Record<Result, string> = { yes: "Yes", no: "No", na: "Not required" };
