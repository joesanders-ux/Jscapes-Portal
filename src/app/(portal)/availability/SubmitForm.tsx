"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitAvailability, type SubmitState } from "./actions";
import { STATUS_META, STATUSES, type Status } from "@/lib/availability-shared";

export type FormDay = {
  ymd: string;
  label: string; // for example "Mon 3 Dec"
  weekend: boolean;
  /** Set when the day has already been submitted. It is shown but cannot be changed here. */
  locked: Status | null;
};

// A segmented control: the radio button itself is visually hidden (still focusable and read out by screen
// readers) and the whole pill is the target. The chosen pill gets a heavier outline and bold text as well as
// a tint, so it is not shown by colour alone.
const pill =
  "flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded border border-line bg-white px-2 py-1.5 text-center text-xs " +
  "has-[:checked]:border-brand-text has-[:checked]:bg-brand-soft has-[:checked]:font-semibold has-[:checked]:ring-2 has-[:checked]:ring-brand-text " +
  "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink sm:px-3 sm:text-sm";
const quick = "rounded border border-line bg-white px-3 py-2 text-sm hover:bg-brand-soft";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="self-start rounded bg-brand px-5 py-2.5 font-medium text-brand-ink hover:bg-brand-dark disabled:opacity-60">
      {pending ? "Submitting..." : "Submit and lock these days"}
    </button>
  );
}

/**
 * One month of availability. Every day you can still change has three choices. Days already submitted
 * are shown as locked. Submitting locks everything on the page, which the text above the button says.
 * The server re-checks all of it, so this form is convenience, not security.
 */
export function SubmitForm({ month, days }: { month: string; days: FormDay[] }) {
  const [state, action] = useFormState<SubmitState, FormData>(submitAvailability, {});
  const open = days.filter((d) => d.locked === null);
  const [values, setValues] = useState<Record<string, Status>>(() => Object.fromEntries(open.map((d) => [d.ymd, "not_provided" as Status])));
  const setAll = (pick: (d: FormDay) => Status) => setValues(Object.fromEntries(open.map((d) => [d.ymd, pick(d)])));
  const marked = open.filter((d) => values[d.ymd] !== "not_provided").length;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="month" value={month} />

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick fill">
        <span className="text-sm font-medium">Quick fill:</span>
        <button type="button" className={quick} onClick={() => setAll((d) => (d.weekend ? "not_available" : "available"))}>Weekdays available, weekends not</button>
        <button type="button" className={quick} onClick={() => setAll(() => "available")}>All available</button>
        <button type="button" className={quick} onClick={() => setAll(() => "not_available")}>All not available</button>
        <button type="button" className={quick} onClick={() => setAll(() => "not_provided")}>Clear</button>
      </div>

      <ul className="flex flex-col gap-2">
        {days.map((d) => (
          <li key={d.ymd} className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-4 ${d.weekend ? "bg-surface" : "bg-surface-raised"} border-line`}>
            <span className="w-28 shrink-0 font-medium">{d.label}</span>
            {d.locked ? (
              <span className={`inline-flex items-center gap-1 self-start rounded-full border px-2.5 py-1 text-sm font-semibold ${STATUS_META[d.locked].classes}`}>
                <span aria-hidden="true">{STATUS_META[d.locked].symbol}</span> {STATUS_META[d.locked].label}
                <span className="font-normal text-ink-muted"> (submitted, locked)</span>
              </span>
            ) : (
              <fieldset className="min-w-0 flex-1 sm:flex-none">
                <legend className="sr-only">Availability for {d.label}</legend>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                  {STATUSES.map((s) => (
                    <label key={s} className={pill}>
                      <input
                        type="radio"
                        name={`d_${d.ymd}`}
                        value={s}
                        checked={values[d.ymd] === s}
                        onChange={() => setValues((v) => ({ ...v, [d.ymd]: s }))}
                        className="sr-only"
                      />
                      <span aria-hidden="true">{STATUS_META[s].symbol}</span> {STATUS_META[s].label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </li>
        ))}
      </ul>

      {open.length > 0 ? (
        <>
          <p className="rounded border border-warn bg-white p-3 text-sm">
            <span className="font-semibold text-warn">Once you submit, these days are locked.</span> To change them later you ask an administrator
            using the Change requests tab. Days left as Not provided are locked as Not provided.
          </p>
          <p className="text-sm text-ink-muted" role="status">{marked} of {open.length} days marked Available or Not available.</p>
          {state.error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{state.error}</p>}
          <Submit />
        </>
      ) : (
        <p role="status" className="rounded border border-brand bg-brand-soft p-3 text-sm">Every day you can enter this month has been submitted.</p>
      )}
    </form>
  );
}
