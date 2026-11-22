import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createEvent, deleteEvent } from "@/app/actions";
import { EventBadge } from "@/components/EventBadge";
import { EVENT_META, EVENT_TYPES, fmtTime, type CalendarEvent } from "@/lib/events";
import {
  addDays, addMonths, fmtDayNum, fmtLong, fmtMonth, fmtShort, fmtWeekday,
  isYmd, monthGridDays, startOfWeek, todayLondon,
} from "@/lib/dates";

type Props = { searchParams: { view?: string; date?: string } };

export default async function CalendarPage({ searchParams }: Props) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const today = todayLondon();
  const view = searchParams.view === "month" ? "month" : "week";
  const anchor = isYmd(searchParams.date) ? searchParams.date : today;

  const days =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))
      : monthGridDays(anchor);

  const { rows } = await db().query<CalendarEvent>(
    `SELECT id, title, type, event_date, start_time, meeting_url, notes
       FROM events WHERE event_date BETWEEN $1 AND $2
      ORDER BY event_date, start_time NULLS FIRST, title`,
    [days[0], days[days.length - 1]]
  );
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of rows) byDay.set(e.event_date, [...(byDay.get(e.event_date) ?? []), e]);

  const prev = view === "week" ? addDays(anchor, -7) : addMonths(anchor, -1);
  const next = view === "week" ? addDays(anchor, 7) : addMonths(anchor, 1);
  const href = (v: string, d: string) => `/calendar?view=${v}&date=${d}`;
  const title = view === "week" ? `${fmtShort(days[0])} to ${fmtShort(days[6])}` : fmtMonth(anchor);
  const inRange = (d: string) => view === "week" || d.slice(0, 7) === anchor.slice(0, 7);
  const agendaDays = days.filter((d) => inRange(d) && byDay.has(d));
  const btn = "rounded border border-line bg-surface-raised px-3 py-2 text-sm hover:bg-brand-soft";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Team calendar</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Link className={btn} href={href(view, prev)} aria-label="Previous period">Previous</Link>
        <Link className={btn} href={href(view, today)}>Today</Link>
        <Link className={btn} href={href(view, next)} aria-label="Next period">Next</Link>
        <span className="mx-2 font-medium" aria-live="polite">{title}</span>
        <span className="ml-auto flex gap-2">
          <Link className={`${btn} ${view === "week" ? "border-brand font-semibold" : ""}`} href={href("week", anchor)} aria-current={view === "week" ? "page" : undefined}>Week</Link>
          <Link className={`${btn} ${view === "month" ? "border-brand font-semibold" : ""}`} href={href("month", anchor)} aria-current={view === "month" ? "page" : undefined}>Month</Link>
        </span>
      </div>

      <ul className="flex flex-wrap gap-3 text-sm" aria-label="Event types">
        {EVENT_TYPES.map((t) => (
          <li key={t}><EventBadge type={t} /></li>
        ))}
      </ul>

      {view === "month" && (
        <div role="group" aria-label={title} className="overflow-hidden rounded-lg border border-line bg-surface-raised">
          <div className="grid grid-cols-7 border-b border-line bg-brand-soft text-center text-xs font-semibold">
            {days.slice(0, 7).map((d) => <div key={d} className="py-2">{fmtWeekday(d)}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => (
              <div key={d} className={`min-h-16 border-b border-r border-line p-1 text-xs ${inRange(d) ? "" : "bg-surface text-ink-muted"} ${d === today ? "ring-2 ring-inset ring-brand" : ""}`}>
                <div className="font-semibold">{fmtDayNum(d)}</div>
                <div className="mt-1 flex flex-wrap gap-0.5 sm:flex-col">
                  {(byDay.get(d) ?? []).map((e) => (
                    <span key={e.id} className={`truncate rounded px-1 py-0.5 text-white ${EVENT_META[e.type].bg}`} title={`${EVENT_META[e.type].label}: ${e.title}`}>
                      <span aria-hidden="true">{EVENT_META[e.type].symbol}</span>
                      <span className="hidden sm:inline"> {e.title}</span>
                      <span className="sr-only">{EVENT_META[e.type].label}: {e.title}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <section aria-label="Event list" className="flex flex-col gap-4">
        {(view === "week" ? days : agendaDays).map((d) => (
          <div key={d} className={`rounded-lg border bg-surface-raised p-4 ${d === today ? "border-brand" : "border-line"}`}>
            <h2 className="font-semibold">{fmtLong(d)}{d === today && " (today)"}</h2>
            {(byDay.get(d) ?? []).length === 0 ? (
              <p className="mt-1 text-sm text-ink-muted">Nothing scheduled.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-3">
                {byDay.get(d)!.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1">
                    <span className="w-16 shrink-0 text-sm text-ink-muted">{fmtTime(e.start_time)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <EventBadge type={e.type} />
                        <span className="font-medium">{e.title}</span>
                      </div>
                      {e.meeting_url && (
                        <a className="text-sm text-brand-text underline" href={e.meeting_url} target="_blank" rel="noopener noreferrer">Join meeting</a>
                      )}
                      {e.notes && <p className="mt-1 whitespace-pre-line text-sm text-ink-muted">{e.notes}</p>}
                    </div>
                    {isAdmin && (
                      <form action={deleteEvent.bind(null, e.id)}>
                        <button className="rounded border border-line px-2 py-1 text-sm text-danger hover:bg-brand-soft">Delete</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {view === "month" && agendaDays.length === 0 && <p className="text-ink-muted">No events this month.</p>}
      </section>

      {isAdmin && (
        <details className="rounded-lg border border-line bg-surface-raised p-4">
          <summary className="cursor-pointer font-semibold">Add an event</summary>
          <form action={createEvent} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Event name
              <input name="title" required maxLength={120} className="rounded border border-line px-3 py-2 font-normal" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Type
              <select name="type" className="rounded border border-line bg-white px-3 py-2 font-normal">
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_META[t].label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Date
              <input type="date" name="date" required defaultValue={anchor} className="rounded border border-line px-3 py-2 font-normal" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Time (leave empty for all day)
              <input type="time" name="time" className="rounded border border-line px-3 py-2 font-normal" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Meeting link (optional)
              <input type="url" name="meeting_url" maxLength={500} placeholder="https://" className="rounded border border-line px-3 py-2 font-normal" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Notes
              <textarea name="notes" rows={3} maxLength={2000} className="rounded border border-line px-3 py-2 font-normal" />
            </label>
            <button className="self-start rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark sm:col-span-2">Save event</button>
          </form>
        </details>
      )}
    </div>
  );
}
