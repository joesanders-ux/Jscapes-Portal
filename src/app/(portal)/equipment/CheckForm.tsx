"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitEquipmentCheck, type CheckState } from "./actions";
import { CATEGORIES, ITEMS, isOptionalItem, RESULT_LABEL, type CategoryKey, type Result } from "@/lib/equipment-shared";

export type EquipmentOption = { id: string; label: string; category: CategoryKey };

const field = "rounded border border-line bg-white px-3 py-2 font-normal";
const pill =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded border border-line bg-white px-4 py-2 has-[:checked]:border-brand-text has-[:checked]:bg-brand-soft";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="self-start rounded bg-brand px-5 py-2.5 font-medium text-brand-ink hover:bg-brand-dark disabled:opacity-60">
      {pending ? "Submitting..." : "Submit equipment check"}
    </button>
  );
}

/**
 * The check form. Choosing the equipment shows that category's checklist, and a "why" box appears
 * for any item answered No. The server works out the checklist again from the equipment and checks
 * every rule, so this is convenience, not security.
 */
export function CheckForm({ equipment, defaultEquipment }: { equipment: EquipmentOption[]; defaultEquipment?: string }) {
  const [state, action] = useFormState<CheckState, FormData>(submitEquipmentCheck, {});
  const [selected, setSelected] = useState(defaultEquipment ?? "");
  const [answers, setAnswers] = useState<Record<string, Result>>({});
  const category = equipment.find((e) => e.id === selected)?.category;

  const groups = (Object.keys(CATEGORIES) as CategoryKey[])
    .map((key) => ({ key, label: CATEGORIES[key].label, items: equipment.filter((e) => e.category === key) }))
    .filter((g) => g.items.length > 0);

  return (
    <form action={action} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1 text-sm font-medium">Equipment
        <select
          name="equipment"
          required
          value={selected}
          onChange={(e) => { setSelected(e.target.value); setAnswers({}); }}
          className={field}
        >
          <option value="" disabled>Choose equipment</option>
          {groups.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {g.items.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      {!category && <p className="text-sm text-ink-muted">Choose the equipment to see its checklist.</p>}

      {category && (
        // Keyed on the equipment so switching item never carries answers over from another checklist.
        <div key={selected} className="flex flex-col gap-5">
          {CATEGORIES[category].items.map((key) => {
            const options: Result[] = isOptionalItem(key) ? ["yes", "no", "na"] : ["yes", "no"];
            return (
              <div key={key} className="rounded-lg border border-line bg-surface-raised p-4">
                <fieldset>
                  <legend className="mb-2 font-semibold">{ITEMS[key].label}</legend>
                  <div className="flex flex-wrap gap-3">
                    {options.map((v) => (
                      <label key={v} className={pill}>
                        <input
                          type="radio"
                          name={key}
                          value={v}
                          required
                          checked={answers[key] === v}
                          onChange={() => setAnswers((a) => ({ ...a, [key]: v }))}
                          className="h-5 w-5 accent-brand-text"
                        />
                        {RESULT_LABEL[v]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {answers[key] === "no" && (
                  <label className="mt-3 flex flex-col gap-1 text-sm font-medium">
                    Why? Explain what is wrong (required)
                    <textarea name={`${key}_note`} required rows={2} maxLength={500} className={field} />
                  </label>
                )}
              </div>
            );
          })}

          <label className="flex flex-col gap-1 text-sm font-medium">Notes (optional)
            <textarea name="notes" rows={3} maxLength={2000} className={field} />
          </label>
        </div>
      )}

      {state.error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{state.error}</p>}
      {category && <Submit />}
    </form>
  );
}
