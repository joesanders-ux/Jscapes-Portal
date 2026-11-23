import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { fmtDayNum, fmtShort, fmtWeekday, isYmd, todayLondon } from "@/lib/dates";
import { loadTimesheet, totals } from "@/lib/timesheets";
import { fmtHours, MAX_EDIT_DAYS, MAX_SPAN_DAYS, parsePeriod } from "@/lib/timesheets-shared";
import { saveHours } from "./actions";

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
  const sheet = await loadTimesheet(period.from, period.to);
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
        : undefined;

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
      {searchParams.done === "saved" && <p role="status" className="rounded border border-brand bg-brand-soft p-3 text-sm">Hours saved.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <a href={pdfHref} className={primary}>Export this period to PDF</a>
        <p className="text-sm text-ink-muted">Totals for {period.title}: <strong className="text-ink">{fmtHours(sum.grand)} hours</strong>.</p>
      </div>

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
                      {p.name}{!p.active && <span className="block text-xs font-normal text-ink-muted">Inactive</span>}
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
                    <th scope="row" className="px-3 py-2 text-left font-medium">{p.name}{!p.active && " (inactive)"}</th>
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
