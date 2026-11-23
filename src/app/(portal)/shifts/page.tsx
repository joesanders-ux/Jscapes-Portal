import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { STATUS_META, type Status } from "@/lib/availability-shared";
import {
  addDays, addMonths, fmtDayNum, fmtLong, fmtMonth, fmtShort, fmtWeekday,
  isYmd, monthGridDays, startOfMonth, startOfWeek, todayLondon,
} from "@/lib/dates";
import { APPROX, APPROX_NOTE, fmtRange, hhmm } from "@/lib/shifts-shared";
import { saveWeek } from "./actions";

type Search = { tab?: string; view?: string; date?: string; error?: string; done?: string; who?: string; day?: string; n?: string };

type Shift = { user_id: string; day: string; start_time: string; end_time: string; published: boolean };

const field = "rounded border border-line bg-white px-2 py-1.5 font-normal";
const primary = "rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark";
const secondary = "rounded border border-line bg-white px-4 py-2 font-medium hover:bg-brand-soft";
const btn = "rounded border border-line bg-surface-raised px-3 py-2 text-sm hover:bg-brand-soft";

export default async function ShiftsPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const tabs = [
    { id: "mine", label: "My shifts" },
    ...(isAdmin ? [{ id: "all", label: "All shifts" }, { id: "plan", label: "Planner" }] : []),
  ];
  // The admin tabs are guarded here on the server: a staff member who types ?tab=plan just gets their own shifts.
  const tab = tabs.some((t) => t.id === searchParams.tab) ? searchParams.tab! : "mine";

  const n = Math.max(0, Math.min(999, Number.parseInt(searchParams.n ?? "0", 10) || 0));
  const error =
    searchParams.error === "incomplete" && searchParams.who && isYmd(searchParams.day)
      ? `Enter both a start and an end time (or leave both empty) for ${searchParams.who.slice(0, 80)} on ${fmtShort(searchParams.day)}.`
      : searchParams.error === "order" && searchParams.who && isYmd(searchParams.day)
        ? `The end time must be after the start time for ${searchParams.who.slice(0, 80)} on ${fmtShort(searchParams.day)}. Nothing was saved.`
        : undefined;
  const done =
    searchParams.done === "saved"
      ? "Week saved. New or changed shifts are hidden from staff until you publish them."
      : searchParams.done === "published" && n === 0
        ? "Week saved. No hidden shifts were waiting, so nobody was notified."
        : searchParams.done === "published"
        ? `Week saved and published. ${n} ${n === 1 ? "shift is" : "shifts are"} now visible to staff, and each person has been notified.`
        : undefined;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Shifts</h1>

      {isAdmin && (
        <nav aria-label="Shifts sections" className="flex gap-2 overflow-x-auto border-b border-line">
          {tabs.map((t) => (
            <Link
              key={t.id}
              href={`/shifts?tab=${t.id}`}
              aria-current={tab === t.id ? "page" : undefined}
              className={`whitespace-nowrap border-b-4 px-4 py-2 text-sm font-medium ${tab === t.id ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}

      {error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{error}</p>}
      {done && <p role="status" className="rounded border border-brand bg-brand-soft p-3 text-sm">{done}</p>}

      {tab === "mine" && <MineTab userId={user.id} search={searchParams} />}
      {tab === "all" && isAdmin && <AllTab search={searchParams} />}
      {tab === "plan" && isAdmin && <PlanTab search={searchParams} />}
    </div>
  );
}

function viewState(search: Search) {
  const today = todayLondon();
  const view: "week" | "month" = search.view === "month" ? "month" : "week";
  const anchor = isYmd(search.date) ? search.date : today;
  return { today, view, anchor };
}

/** Previous / Today / Next and the Week | Month switch. */
function CalendarNav({ tab, view, anchor, today, title, weekOnly }: { tab: string; view: "week" | "month"; anchor: string; today: string; title: string; weekOnly?: boolean }) {
  const href = (v: string, d: string) => `/shifts?tab=${tab}&view=${v}&date=${d}`;
  const prev = view === "week" ? addDays(anchor, -7) : addMonths(anchor, -1);
  const next = view === "week" ? addDays(anchor, 7) : addMonths(anchor, 1);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link className={btn} href={href(view, prev)} aria-label="Previous period">Previous</Link>
      <Link className={btn} href={href(view, today)}>{weekOnly ? "This week" : "Today"}</Link>
      <Link className={btn} href={href(view, next)} aria-label="Next period">Next</Link>
      <span className="mx-2 font-medium" aria-live="polite">{title}</span>
      {!weekOnly && (
        <span className="ml-auto flex gap-2">
          <Link className={`${btn} ${view === "week" ? "border-brand font-semibold" : ""}`} href={href("week", anchor)} aria-current={view === "week" ? "page" : undefined}>Week</Link>
          <Link className={`${btn} ${view === "month" ? "border-brand font-semibold" : ""}`} href={href("month", anchor)} aria-current={view === "month" ? "page" : undefined}>Month</Link>
        </span>
      )}
    </div>
  );
}

const weekTitle = (first: string) => `${fmtShort(first)} to ${fmtShort(addDays(first, 6))}`;

/** Staff and admins: your own PUBLISHED shifts only. Hidden shifts are never selected here. */
async function MineTab({ userId, search }: { userId: string; search: Search }) {
  const { today, view, anchor } = viewState(search);
  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)) : monthGridDays(anchor);
  const title = view === "week" ? weekTitle(days[0]) : fmtMonth(anchor);
  const { rows } = await db().query<Shift>(
    `SELECT user_id, day, start_time, end_time, true AS published
       FROM shifts WHERE user_id = $1 AND published_at IS NOT NULL AND day BETWEEN $2 AND $3`,
    [userId, days[0], days[days.length - 1]]
  );
  const byDay = new Map(rows.map((s) => [s.day, s]));
  const inRange = (d: string) => view === "week" || d.slice(0, 7) === anchor.slice(0, 7);
  const count = days.filter((d) => inRange(d) && byDay.has(d)).length;

  return (
    <>
      <CalendarNav tab="mine" view={view} anchor={anchor} today={today} title={title} />
      <p className="rounded border border-line bg-surface-raised p-3 text-sm">{APPROX_NOTE}</p>

      {view === "month" && (
        <div role="group" aria-label={title} className="relative overflow-hidden rounded-lg border border-line bg-surface-raised">
          <div className="grid grid-cols-7 border-b border-line bg-brand-soft text-center text-xs font-semibold">
            {days.slice(0, 7).map((d) => <div key={d} className="py-2">{fmtWeekday(d)}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const s = inRange(d) ? byDay.get(d) : undefined;
              return (
                <div key={d} className={`min-h-16 border-b border-r border-line p-1 text-xs ${inRange(d) ? "" : "bg-surface text-ink-muted"} ${d === today ? "ring-2 ring-inset ring-brand" : ""}`}>
                  <div className="font-semibold">{fmtDayNum(d)}</div>
                  {s && (
                    <span className="mt-1 flex flex-col rounded border border-brand-text bg-brand-soft px-1 py-0.5 text-brand-text sm:block">
                      {/* Phones: start over end. Wider screens: "approx. 08:00 to 16:00". */}
                      <span className="hidden sm:inline">{APPROX} </span>
                      <span>{hhmm(s.start_time)}</span>
                      <span className="sr-only sm:not-sr-only"> to </span>
                      <span>{hhmm(s.end_time)}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "week" && (
        <ul className="flex flex-col gap-2">
          {days.map((d) => {
            const s = byDay.get(d);
            return (
              <li key={d} className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-surface-raised p-3 ${d === today ? "border-brand" : "border-line"}`}>
                <span className="w-44 shrink-0 font-medium">{fmtLong(d)}{d === today && " (today)"}</span>
                {s ? <span className="font-semibold">{APPROX} {fmtRange(s.start_time, s.end_time)}</span> : <span className="text-ink-muted">No shift</span>}
              </li>
            );
          })}
        </ul>
      )}
      {count === 0 && <p className="text-ink-muted">No shifts published for this {view === "week" ? "week" : "month"}.</p>}
    </>
  );
}

/** Admins: everyone's shifts, hidden ones clearly marked. */
async function AllTab({ search }: { search: Search }) {
  const { today, view, anchor } = viewState(search);
  const days = view === "week"
    ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))
    : Array.from({ length: Number(addDays(addMonths(startOfMonth(anchor), 1), -1).slice(8)) }, (_, i) => addDays(startOfMonth(anchor), i));
  const title = view === "week" ? weekTitle(days[0]) : fmtMonth(anchor);
  const [people, shifts] = await Promise.all([
    db().query<{ id: string; name: string }>("SELECT id, name FROM users WHERE active ORDER BY lower(name)"),
    db().query<Shift>("SELECT user_id, day, start_time, end_time, (published_at IS NOT NULL) AS published FROM shifts WHERE day BETWEEN $1 AND $2", [days[0], days[days.length - 1]]),
  ]);
  const byKey = new Map(shifts.rows.map((s) => [`${s.user_id}|${s.day}`, s]));
  const hidden = shifts.rows.filter((s) => !s.published).length;

  return (
    <>
      <CalendarNav tab="all" view={view} anchor={anchor} today={today} title={title} />
      <ul className="flex flex-wrap gap-3 text-sm" aria-label="Key">
        <li className="rounded-full border border-brand-text bg-brand-soft px-2.5 py-0.5 font-semibold text-brand-text"><span aria-hidden="true">●</span> Published (staff can see it)</li>
        <li className="rounded-full border border-warn bg-white px-2.5 py-0.5 font-semibold text-warn"><span aria-hidden="true">◌</span> Hidden (admins only)</li>
      </ul>
      {hidden > 0 && <p className="text-sm text-warn">{hidden} hidden {hidden === 1 ? "shift" : "shifts"} in this {view}. Publish them from the Planner.</p>}

      <div className="relative overflow-x-auto rounded-lg border border-line bg-surface-raised">
        <table className="w-full border-collapse text-center text-xs">
          <caption className="sr-only">Shifts for {title}</caption>
          <thead>
            <tr className="bg-brand-soft">
              <th scope="col" className="sticky left-0 z-10 min-w-[9rem] border-b border-r border-line bg-brand-soft px-2 py-2 text-left text-sm">Person</th>
              {days.map((d) => (
                <th key={d} scope="col" className={`${view === "week" ? "min-w-[6.5rem]" : "min-w-[2.5rem]"} border-b border-line px-1 py-2 font-semibold ${d === today ? "ring-2 ring-inset ring-brand" : ""}`}>
                  <div>{fmtWeekday(d)}</div><div>{fmtDayNum(d)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.rows.map((p) => (
              <tr key={p.id}>
                <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-surface-raised px-2 py-2 text-left text-sm font-medium">{p.name}</th>
                {days.map((d) => {
                  const s = byKey.get(`${p.id}|${d}`);
                  const label = s ? `${fmtRange(s.start_time, s.end_time)}, ${s.published ? "published" : "hidden"}` : "No shift";
                  return (
                    <td key={d} className={`border-b border-line p-1 ${s ? (s.published ? "bg-brand-soft text-brand-text" : "bg-white text-warn") : "text-ink-muted"}`} title={`${p.name}, ${fmtShort(d)}: ${label}`}>
                      {s ? (
                        <>
                          <span aria-hidden="true">{s.published ? "●" : "◌"}</span>
                          {view === "week" ? <span> {hhmm(s.start_time)}-{hhmm(s.end_time)}</span> : null}
                          <span className="sr-only"> {label}</span>
                          {view === "week" && <div className="font-semibold">{s.published ? "Published" : "Hidden"}</div>}
                        </>
                      ) : (
                        <span aria-hidden="true">–</span>
                      )}
                      {!s && <span className="sr-only">No shift</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view === "month" && <p className="text-sm text-ink-muted">Move over a cell to see its times. Use the week view to see them all.</p>}
    </>
  );
}

/** Admins: the weekly planner. Saving keeps shifts hidden; "Save and publish" shows them to staff and notifies each person. */
async function PlanTab({ search }: { search: Search }) {
  const today = todayLondon();
  const week = startOfWeek(isYmd(search.date) ? search.date : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const href = (d: string) => `/shifts?tab=plan&date=${d}`;

  const [people, shifts, avail] = await Promise.all([
    db().query<{ id: string; name: string }>("SELECT id, name FROM users WHERE active ORDER BY lower(name)"),
    db().query<Shift>("SELECT user_id, day, start_time, end_time, (published_at IS NOT NULL) AS published FROM shifts WHERE day BETWEEN $1 AND $2", [days[0], days[6]]),
    db().query<{ user_id: string; day: string; status: Status }>("SELECT user_id, day, status FROM availability_days WHERE day BETWEEN $1 AND $2", [days[0], days[6]]),
  ]);
  const byKey = new Map(shifts.rows.map((s) => [`${s.user_id}|${s.day}`, s]));
  const availBy = new Map(avail.rows.map((a) => [`${a.user_id}|${a.day}`, a.status]));
  const hidden = shifts.rows.filter((s) => !s.published).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link className={btn} href={href(addDays(week, -7))} aria-label="Previous week">Previous</Link>
        <Link className={btn} href={href(today)}>This week</Link>
        <Link className={btn} href={href(addDays(week, 7))} aria-label="Next week">Next</Link>
        <span className="mx-2 font-medium" aria-live="polite">{weekTitle(week)}</span>
      </div>

      <section className="rounded-lg border border-line bg-surface-raised p-4 text-sm">
        <p>Enter a start and end time for each person and day, or leave both empty for no shift. Each person's availability is shown under their times.</p>
        <p className="mt-1">
          <span className="font-semibold">Saving keeps shifts hidden from staff.</span> Changing a published shift hides it again until you publish.
          {" "}Staff see their own shifts only after you press <em>Save and publish</em>, and each person gets a notification.
        </p>
        <p className={`mt-2 font-semibold ${hidden > 0 ? "text-warn" : "text-brand-text"}`} role="status">
          {hidden > 0 ? `${hidden} hidden ${hidden === 1 ? "shift" : "shifts"} in this week.` : "No hidden shifts in this week."}
        </p>
      </section>

      {people.rows.length === 0 ? (
        <p className="text-ink-muted">There are no active people to plan.</p>
      ) : (
        <form action={saveWeek} className="flex flex-col gap-4">
          <input type="hidden" name="week" value={week} />
          <div className="relative overflow-x-auto rounded-lg border border-line bg-surface-raised">
            <table className="w-full border-collapse text-xs">
              <caption className="sr-only">Shift planner for {weekTitle(week)}</caption>
              <thead>
                <tr className="bg-brand-soft">
                  <th scope="col" className="sticky left-0 z-10 min-w-[9rem] border-b border-r border-line bg-brand-soft px-2 py-2 text-left text-sm">Person</th>
                  {days.map((d) => (
                    <th key={d} scope="col" className={`min-w-[7.5rem] border-b border-line px-1 py-2 text-center font-semibold ${d === today ? "ring-2 ring-inset ring-brand" : ""}`}>
                      <div>{fmtWeekday(d)}</div><div>{fmtDayNum(d)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.rows.map((p) => (
                  <tr key={p.id}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-surface-raised px-2 py-2 text-left text-sm font-medium">{p.name}</th>
                    {days.map((d) => {
                      const s = byKey.get(`${p.id}|${d}`);
                      const a = STATUS_META[availBy.get(`${p.id}|${d}`) ?? "not_provided"];
                      return (
                        <td key={d} className="border-b border-line p-1.5 align-top">
                          <div className="flex flex-col gap-1">
                            <input type="time" name={`s_${p.id}_${d}`} defaultValue={s ? hhmm(s.start_time) : ""} aria-label={`Start time, ${p.name}, ${fmtShort(d)}`} className={field} />
                            <input type="time" name={`e_${p.id}_${d}`} defaultValue={s ? hhmm(s.end_time) : ""} aria-label={`End time, ${p.name}, ${fmtShort(d)}`} className={field} />
                          </div>
                          <p className={`mt-1 rounded border px-1 py-0.5 text-center ${a.classes}`}>
                            <span aria-hidden="true">{a.symbol}</span> {a.label}
                          </p>
                          {s && (
                            <p className={`mt-1 text-center font-semibold ${s.published ? "text-brand-text" : "text-warn"}`}>
                              <span aria-hidden="true">{s.published ? "●" : "◌"}</span> {s.published ? "Published" : "Hidden"}
                            </p>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3">
            <button name="intent" value="save" className={secondary}>Save (keep hidden)</button>
            <button name="intent" value="publish" className={primary}>Save and publish this week</button>
          </div>
        </form>
      )}
    </>
  );
}
