// Shared by the server and the browser form. No server-only code here.

export type ItemDef = { label: string; /** can be answered "Not required" */ optional?: boolean };

// Every checklist item, worded as it appears on the check form. A ticked box is the good answer.
// An item that appears in more than one category has one label everywhere.
export const ITEMS = {
  grease: { label: "Grease and Lubrication" },
  sharpening: { label: "Sharpening (if required)", optional: true },
  defects: { label: "Defect check" },
  cleaning: { label: "Cleaning" },
  deck: { label: "Cleaning of cutting deck, wheels and grass collection bag" },
  air_filter: { label: "Air Filter" },
  oil: { label: "Oil" },
  fuel: { label: "Fuel" },
  pull_cord: { label: "Pull Cord and general condition" },
  fuel_mix: { label: "Fuel Mixes prepared" },
  oil_attachments: { label: "Oil check - Chainsaws and attachments" },
} as const satisfies Record<string, ItemDef>;
export type ItemKey = keyof typeof ITEMS;

// Categories and the checks each one gets, in the order they are asked.
export const CATEGORIES = {
  hand_tools: { label: "Hand tools", items: ["grease", "sharpening", "defects", "cleaning"] },
  lawn_mower: { label: "Lawn mowers", items: ["deck", "air_filter", "oil", "fuel", "pull_cord"] },
  petrol: { label: "Petrol equipment", items: ["grease", "sharpening", "defects", "cleaning", "fuel_mix", "oil_attachments"] },
  // What equipment added without a category is filed under. It is not a checklist: the checklist for a
  // check is chosen on the check form. The other three are kept as checklists and as older equipment's category.
  general: { label: "General equipment", items: ["grease", "defects", "cleaning"] },
} as const satisfies Record<string, { label: string; items: readonly ItemKey[] }>;
export type CategoryKey = keyof typeof CATEGORIES;

export const isCategory = (v: unknown): v is CategoryKey => typeof v === "string" && Object.prototype.hasOwnProperty.call(CATEGORIES, v);
export const isItemKey = (v: string): v is ItemKey => Object.prototype.hasOwnProperty.call(ITEMS, v);
export const isOptionalItem = (key: ItemKey) => "optional" in ITEMS[key] && ITEMS[key].optional === true;

export type Result = "yes" | "no" | "na";
export const RESULT_LABEL: Record<Result, string> = { yes: "Ticked", no: "Not ticked", na: "Not required" };

/** The three checklists offered on the check form. "General" exists only for equipment, not as a checklist. */
export const CHECKLISTS = ["hand_tools", "lawn_mower", "petrol"] as const;
export type ChecklistKey = (typeof CHECKLISTS)[number];
export const isChecklist = (v: unknown): v is ChecklistKey => typeof v === "string" && (CHECKLISTS as readonly string[]).includes(v);
