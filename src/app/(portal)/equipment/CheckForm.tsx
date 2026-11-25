"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitEquipmentCheck, type CheckState } from "./actions";
import { CATEGORIES, ITEMS, MAX_CHECK_PHOTOS, isOptionalItem, type ChecklistKey } from "@/lib/equipment-shared";

export type EquipmentOption = { id: string; label: string };

const field = "rounded border border-line bg-white px-3 py-2 font-normal";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="self-start rounded bg-brand px-5 py-2.5 font-medium text-brand-ink hover:bg-brand-dark disabled:opacity-60">
      {pending ? "Submitting..." : "Submit equipment check"}
    </button>
  );
}

/**
 * One checklist (Hand tools, Lawn mowers or Petrol equipment): choose the equipment, tick what was done,
 * add notes. The server works out the checklist again and checks every rule, so this is convenience,
 * not security.
 */
export function CheckForm({ checklist, equipment, defaultEquipment }: { checklist: ChecklistKey; equipment: EquipmentOption[]; defaultEquipment?: string }) {
  const [state, action] = useFormState<CheckState, FormData>(submitEquipmentCheck, {});
  const items = CATEGORIES[checklist].items;
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  // Anything that is not ticked (other than "if required" items) needs a reason in Notes.
  const needsNotes = items.some((key) => !ticked[key] && !isOptionalItem(key));

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="checklist" value={checklist} />

      <label className="flex flex-col gap-1 text-sm font-medium">Equipment
        <select name="equipment" required defaultValue={defaultEquipment ?? ""} className={field}>
          <option value="" disabled>Choose equipment</option>
          {equipment.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Tick each check you have done</legend>
        {items.map((key) => (
          <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded border border-line bg-white px-4 py-2 has-[:checked]:border-brand-text has-[:checked]:bg-brand-soft">
            <input
              type="checkbox"
              name={key}
              checked={ticked[key] === true}
              onChange={(e) => setTicked((t) => ({ ...t, [key]: e.target.checked }))}
              className="h-6 w-6 shrink-0 accent-brand-text"
            />
            <span>{ITEMS[key].label}</span>
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Notes{needsNotes ? " (required: explain anything not ticked)" : " (optional)"}
        <textarea name="notes" rows={3} maxLength={2000} required={needsNotes} className={field} />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">Add photos to the notes (optional, up to {MAX_CHECK_PHOTOS}; JPEG, PNG or WebP)
        <input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple className={field} />
      </label>

      {state.error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{state.error}</p>}
      <Submit />
    </form>
  );
}
