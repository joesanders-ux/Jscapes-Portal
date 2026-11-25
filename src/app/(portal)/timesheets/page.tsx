import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { fmtDayNum, fmtShort, fmtWeekday, isYmd, todayLondon } from "@/lib/dates";
import { listTimesheetOnlyPeople, loadTimesheet, totals } from "@/lib/timesheets";
import { fmtHours, MAX_EDIT_DAYS, MAX_SPAN_DAYS, parsePeriod } from "@/lib/timesheets-shared";
import { addTimesheetPerson, saveHours, setTimesheetPersonActive } from "./actions";

type Search = { view?: string; date?: string; from?: string; to?: string; error?: string; done?: string; who?: string; day?: string };

const field = "rounded border border-line bg-white px-3 py-2 font-normal";
const primary = "rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark";
const btn = "rounded border border-line bg-surface-raised px-3 py-2 text-sm hover:bg-brand-soft";

export default async function TimesheetsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  // Administrators only. Anyone else gets "not found", so the section does not even appear to exist.
  if (user.role !== "admin") notFound();

  const today = todayLondon();
  const period = parsePeriod(searchParams, today);
  const [sheet, onlyPeople] = await Promise.all([loadTimesheet(period.from, period.to), listTimesheetOnlyPeople()]);
  const sum = totals(sheet, period.days);
  const editable = period.days.length <= MAX_EDIT_DAYS;
  const pdfHref = `/timesheets/pdf?from=${period.from}&to=${period.to}`;
  const link = (q: string) => `/timesheets?${q}`;
  const isWeekend = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());

  const error =
    searchParams.error === "hours" && searchParams.who && isYmd(searchParams.day)
      ? `"${searchParams.who.slice(0, 80)}" on ${fmtShort(searchParams.day)} is not a valid number of hours. Use 0 to 24, for example 7.5. Nothing was saved.`
      : searchParams.error === "toolong"
        ? `Hours can be edited for up to ${MAX_EDIT_DAYS} days at a time. Choose a shorter period.`
        : searchParams.error === "personname"
          ? "Enter the person's name."
          : searchParams.error === "persondup"
            ? `There is already someone called "${(searchParams.who ?? "that name").slice(0, 80)}" (a staff account or another timesheet person). Use a different name, for example add a surname or initial.`
            : searchParams.error === "personmissing"
              ? "That person no longer exists, or it was already changed."
              : undefined;
  const DONE: Record<string, string> = {
    saved: "Hours saved.",
    personadded: "Person added. They now have a row on the timesheet below.",
    personremoved: "Person removed from the timesheet. Their saved hours are kept and still show for the periods they were worked in.",
    personrestored: "Person added back to the timesheet.",
  };
  const done = searchParams.done ? DONE[searchParams.done] : undefined;
  // Sent with every small form so the admin comes back to the same period.
  const ctx = (
    <>
      <input type="hidden" name="from" value={period.from} />
      <input type="hidden" name="to" value={period.to} />
      <input type="hidden" name="view" value={period.view} />
      <input type="hidden" name="anchor" value={period.anchor} />
    </>
  );
  const noAccount = <span className="block text-xs font-normal text-ink-muted">No staff account</span>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Timesheets</h1>
        <span className="rounded border border-line bg-surface-raised px-2 py-0.5 text-xs font-semibold text-ink-muted">Administrators only</span>
      </div>

      {/* Period controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Link className={btn} href={link(period.prev)} aria-label="Previous period">Previous</Link>
        <Link className={btn} href={link(period.current)}>{period.view === "custom" ? "Reset" : "This " + period.view}</Link>
        <Link className={btn} href={link(period.next)} aria-label="Next period">Next</Link>
        <span className="mx-2 font-medium" aria-live="polite">{period.title}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          <Link className={`${btn} ${period.view === "week" ? "border-brand font-semibold" : ""}`} href={link(`view=week&date=${period.view === "custom" ? period.from : period.anchor}`)} aria-current={period.view === "week" ? "page" : undefined}>Week</Link>
          <Link className={`${btn} ${period.view === "month" ? "border-brand font-semibold" : ""}`} href={link(`view=month&date=${period.view === "custom" ? period.from : period.anchor}`)} aria-current={period.view === "month" ? "page" : undefined}>Month</Link>
          <Link className={`${btn} ${period.view === "custom" ? "border-brand font-semibold" : ""}`} href={link(`view=custom&from=${period.from}&to=${period.to}`)} aria-current={period.view === "custom" ? "page" : undefined}>Custom range</Link>
        </span>
      </div>

      {period.view === "custom" && (
        <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface-raised p-4">
          <input type="hidden" name="view" value="custom" />
          <label className="flex flex-col gap-1 text-sm font-medium">From
            <input type="date" name="from" required defaultValue={period.from} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">To
            <input type="date" name="to" required defaultValue={period.to} className={field} />
          </label>
          <button className={primary}>Show range</button>
          <p className="text-sm text-ink-muted">Up to {MAX_SPAN_DAYS} days. Hours can be edited for up to {MAX_EDIT_DAYS} days at a time.</p>
        </form>
      )}
      {period.clamped && <p role="status" className="rounded border border-warn bg-white p-3 text-sm text-warn">That range was longer than {MAX_SPAN_DAYS} days, so it has been shortened.</p>}

      {error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{error}</p>}
      {done && <p role="status" className="rounded border border-brand bg-brand-soft p-3 text-sm">{done}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <a href={pdfHref} className={primary}>Export this period to PDF</a>
        <p className="text-sm text-ink-muted">Totals for {period.title}: <strong className="text-ink">{fmtHours(sum.grand)} hours</strong>.</p>
      </div>

      <details className="rounded-lg border border-line bg-surface-raised p-4">
        <summary className="cursor-pointer font-semibold">People without a staff account ({onlyPeople.filter((o) => o.active).length})</summary>
        <p className="mt-2 text-sm text-ink-muted">
          Add someone who needs hours recording but has no portal login. They cannot sign in and do not appear anywhere else in the portal. Only administrators see them, here and in the PDF.
        </p>
        <form action={addTimesheetPerson} className="mt-3 flex flex-wrap items-end gap-3">
          {ctx}
          <label className="flex flex-col gap-1 text-sm font-medium">Name
            <input name="name" required maxLength={100} autoComplete="off" className={`${field} w-64`} />
          </label>
          <button className={primary}>Add to timesheet</button>
        </form>
        {onlyPeople.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {onlyPeople.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 border-t border-line pt-2 text-sm">
                <span className="font-medium">{o.name}</span>
                {!o.active && <span className="rounded border border-line px-2 py-0.5 text-xs font-semibold text-ink-muted">Removed</span>}
                <form action={setTimesheetPersonActive.bind(null, o.id, !o.active)} className="ml-auto">
                  {ctx}
                  <button className="rounded border border-line px-3 py-1.5 text-sm hover:bg-brand-soft">
                    {o.active ? "Remove from timesheet" : "Add back"}<span className="sr-only">: {o.name}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </details>

      {sheet.people.length === 0 ? (
        <p className="text-ink-muted">There are no people to list.</p>
      ) : editable ? (
        <form action={saveHours} className="flex flex-col gap-4">
          <input type="hidden" name="from" value={period.from} />
          <input type="hidden" name="to" value={period.to} />
          <input type="hidden" name="view" value={period.view} />
          <input type="hidden" name="anchor" value={period.anchor} />
          {/* `relative` keeps the screen-reader-only text inside this scroll area instead of widening the page */}
          <div className="relative overflow-x-auto rounded-lg border border-line bg-surface-raised">
            <table className="w-full border-collapse text-center text-xs">
              <caption className="sr-only">Hours worked, {period.title}</caption>
              <thead>
                <tr className="bg-brand-soft">
                  <th scope="col" className="sticky left-0 z-10 min-w-[9rem] border-b border-r border-line bg-brand-soft px-2 py-2 text-left text-sm">Person</th>
                  {period.days.map((d) => (
                    <th key={d} scope="col" className={`min-w-[4.5rem] border-b border-line px-1 py-2 font-semibold ${isWeekend(d) ? "bg-surface" : ""}`}>
                      <div>{fmtWeekday(d)}</div><div>{fmtDayNum(d)}</div>
                    </th>
                  ))}
                  <th scope="col" className="min-w-[4.5rem] border-b border-l border-line px-2 py-2 text-sm">Total</th>
                </tr>
              </thead>
              <tbody>
                {sheet.people.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-surface-raised px-2 py-2 text-left text-sm font-medium">
                      {p.name}{!p.account && noAccount}{!p.active && <span className="block text-xs font-normal text-ink-muted">{p.account ? "Inactive" : "Removed"}</span>}
                    </th>
                    {period.days.map((d) => {
                      const v = sheet.hours.get(`${p.id}|${d}`);
                      return (
                        <td key={d} className={`border-b border-line p-1 ${isWeekend(d) ? "bg-surface" : ""}`}>
                          <input
                            type="number"
                            inputMode="decimal"
                            name={`h_${p.id}_${d}`}
                            min={0}
                            max={24}
                            step="0.25"
                            defaultValue={v === undefined ? "" : fmtHours(v)}
                            aria-label={`Hours, ${p.name}, ${fmtShort(d)}`}
                            className="w-full rounded border border-line bg-white px-1 py-1.5 text-center text-sm"
                          />
                        </td>
                      );
                    })}
                    <td className="border-b border-l border-line px-2 py-2 text-sm font-semibold">{fmtHours(sum.perPerson.get(p.id)!.hours)}</td>
                  </tr>
                ))}
                <tr className="bg-surface">
                  <th scope="row" className="sticky left-0 z-10 border-r border-line bg-surface px-2 py-2 text-left text-sm font-medium">Day total</th>
                  {period.days.map((d) => <td key={d} className="px-1 py-2 text-sm font-semibold">{sum.perDay.has(d) ? fmtHours(sum.perDay.get(d)!) : ""}</td>)}
                  <td className="border-l border-line px-2 py-2 text-sm font-bold">{fmtHours(sum.grand)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button className={primary}>Save hours</button>
            <p className="text-sm text-ink-muted">Leave a box empty for no entry. Use numbers such as 8 or 7.5. Totals and the PDF use saved hours, so save first.</p>
          </div>
        </form>
      ) : (
        <>
          <p className="rounded border border-line bg-surface-raised p-3 text-sm">
            This period is longer than {MAX_EDIT_DAYS} days, so only the totals are shown. Choose a shorter period to edit hours. The PDF includes every day.
          </p>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface-raised">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Totals by person, {period.title}</caption>
              <thead><tr className="bg-brand-soft text-left"><th scope="col" className="px-3 py-2">Person</th><th scope="col" className="px-3 py-2 text-right">Days worked</th><th scope="col" className="px-3 py-2 text-right">Total hours</th></tr></thead>
              <tbody>
                {sheet.people.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <th scope="row" className="px-3 py-2 text-left font-medium">{p.name}{!p.account && " (no staff account)"}{!p.active && (p.account ? " (inactive)" : " (removed)")}</th>
                    <td className="px-3 py-2 text-right">{sum.perPerson.get(p.id)!.daysWorked}</td>
                    <td className="px-3 py-2 text-right">{fmtHours(sum.perPerson.get(p.id)!.hours)}</td>
                  </tr>
                ))}
                <tr className="border-t border-line bg-surface font-bold"><th scope="row" className="px-3 py-2 text-left">Total</th><td /><td className="px-3 py-2 text-right">{fmtHours(sum.grand)}</td></tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
