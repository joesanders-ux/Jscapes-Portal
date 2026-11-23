"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitVanCheck, type CheckState } from "./actions";
import { CHECK_ITEMS, CONDITIONS, type ConditionKey } from "@/lib/vans-shared";

type VanOption = { id: string; label: string };

const field = "rounded border border-line bg-white px-3 py-2 font-normal";
const pill =
  "flex min-h-11 cursor-pointer items-center gap-2 rounded border border-line bg-white px-4 py-2 has-[:checked]:border-brand-text has-[:checked]:bg-brand-soft";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="self-start rounded bg-brand px-5 py-2.5 font-medium text-brand-ink hover:bg-brand-dark disabled:opacity-60">
      {pending ? "Submitting..." : "Submit van check"}
    </button>
  );
}

/**
 * The check form. A text box for "why" appears when an item is answered No, and the browser
 * then requires it. The server checks every rule again, so this is convenience, not security.
 */
export function CheckForm({ vans, defaultVan }: { vans: VanOption[]; defaultVan?: string }) {
  const [state, action] = useFormState<CheckState, FormData>(submitVanCheck, {});
  const [answers, setAnswers] = useState<Record<string, "yes" | "no">>({});
  const [condition, setCondition] = useState<ConditionKey | "">("");
  const notesRequired = condition === "poor" || condition === "moderate";

  return (
    <form action={action} className="flex flex-col gap-5">
      <label className="flex flex-col gap-1 text-sm font-medium">Van (registration)
        <select name="van" required defaultValue={defaultVan ?? ""} className={field}>
          <option value="" disabled>Choose a van</option>
          {vans.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </label>

      {CHECK_ITEMS.map((item) => (
        <div key={item.key} className="rounded-lg border border-line bg-surface-raised p-4">
          <fieldset>
            <legend className="mb-2 font-semibold">{item.label}</legend>
            <div className="flex flex-wrap gap-3">
              {(["yes", "no"] as const).map((v) => (
                <label key={v} className={pill}>
                  <input
                    type="radio"
                    name={item.key}
                    value={v}
                    required
                    checked={answers[item.key] === v}
                    onChange={() => setAnswers((a) => ({ ...a, [item.key]: v }))}
                    className="h-5 w-5 accent-brand-text"
                  />
                  {v === "yes" ? "Yes" : "No"}
                </label>
              ))}
            </div>
          </fieldset>
          {answers[item.key] === "no" && (
            <label className="mt-3 flex flex-col gap-1 text-sm font-medium">
              Why? Explain what is wrong (required)
              <textarea name={`${item.key}_note`} required rows={2} maxLength={500} className={field} />
            </label>
          )}
        </div>
      ))}

      <div className="rounded-lg border border-line bg-surface-raised p-4">
        <fieldset>
          <legend className="mb-2 font-semibold">Overall condition of the van</legend>
          <div className="flex flex-col gap-3">
            {(Object.keys(CONDITIONS) as ConditionKey[]).map((key) => {
              const c = CONDITIONS[key];
              return (
                <label key={key} className={pill}>
                  <input
                    type="radio"
                    name="condition"
                    value={key}
                    required
                    checked={condition === key}
                    onChange={() => setCondition(key)}
                    className="h-5 w-5 accent-brand-text"
                  />
                  {/* One text flow, so a long label wraps naturally on narrow screens */}
                  <span>
                    <span className={`font-semibold ${c.classes}`}>
                      <span aria-hidden="true">{c.symbol}</span> {c.label}
                    </span>{" "}
                    <span className="text-ink-muted">({c.detail})</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Notes {notesRequired ? "(required: say what needs attention)" : "(optional)"}
        <textarea name="notes" required={notesRequired} rows={3} maxLength={2000} className={field} />
      </label>

      {state.error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{state.error}</p>}
      <Submit />
    </form>
  );
}
