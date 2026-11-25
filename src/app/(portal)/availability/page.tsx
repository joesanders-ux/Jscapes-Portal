import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { availabilityReminder, pendingChangeRequestCount } from "@/lib/availability";
import { MAX_DAYS_AHEAD, MAX_REQUEST_SPAN, REMINDER_DAY, STATUSES, STATUS_META, type Status } from "@/lib/availability-shared";
import {
  addDays, addMonths, fmtDayNum, fmtLong, fmtMonth, fmtShort, fmtWeekday,
  isYmd, monthGridDays, startOfMonth, startOfWeek, todayLondon,
} from "@/lib/dates";
import { SubmitForm, type FormDay } from "./SubmitForm";
import { cancelRequest, decideRequest, requestChange } from "./actions";

type Search = { tab?: string; view?: string; date?: string; month?: string; error?: string; done?: string };

const ERRORS: Record<string, string> = {
  dates: "Enter a valid start and end date.",
  status: "Choose what you want the days changed to.",
  range: `Dates must be from today up to a year ahead.`,
  order: "The end date cannot be before the start date.",
  span: `A request can cover up to ${MAX_REQUEST_SPAN + 1} days. Split longer changes into several requests.`,
  reason: "Say why you need the change.",
  missing: "That request no longer exists.",
  decided: "That request has already been decided.",
};
const DONE: Record<string, string> = {
  submitted: "Availability submitted and locked. Thank you.",
  requested: "Change requested. An administrator will see it on their Dashboard and in the Change requests tab.",
  cancelled: "Request withdrawn.",
  approved: "Request approved. The days have been updated.",
  declined: "Request declined. The days are unchanged.",
};

const field = "rounded border border-line bg-white px-3 py-2 font-normal";
const primary = "self-start rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark";
const small = "rounded border border-line px-3 py-1.5 text-sm hover:bg-brand-soft";
const btn = "rounded border border-line bg-surface-raised px-3 py-2 text-sm hover:bg-brand-soft";
const fmtStamp = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(d);

function StatusBadge({ status, locked }: { status: Status; locked?: boolean }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-semibold ${m.classes}`}>
      <span aria-hidden="true">{m.symbol}</span>
      {m.label}
      {locked && <span className="font-normal text-ink-muted"> (locked)</span>}
    </span>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-3 text-sm" aria-label="Availability key">
      {STATUSES.map((s) => <li key={s}><StatusBadge status={s} /></li>)}
    </ul>
  );
}

const rangeLabel = (from: string, to: string) => (from === to ? fmtShort(from) : `${fmtShort(from)} to ${fmtShort(to)}`);

export default async function AvailabilityPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const tabs = [
    { id: "mine", label: "My availability" },
    { id: "submit", label: "Submit availability" },
    { id: "requests", label: "Change requests" },
    ...(isAdmin ? [{ id: "team", label: "Team availability" }] : []),
  ];
  const tab = tabs.some((t) => t.id === searchParams.tab) ? searchParams.tab! : "mine";
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const done = searchParams.done ? DONE[searchParams.done] : undefined;
  const pending = isAdmin ? await pendingChangeRequestCount() : 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Availability</h1>

      <nav aria-label="Availability sections" className="relative flex gap-2 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={`/availability?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`whitespace-nowrap border-b-4 px-4 py-2 text-sm font-medium ${tab === t.id ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {t.label}
            {t.id === "requests" && pending > 0 && <span className="ml-2 rounded-full bg-warn px-2 py-0.5 text-xs font-bold text-white">{pending}<span className="sr-only"> waiting</span></span>}
          </Link>
        ))}
      </nav>

      {error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{error}</p>}
      {done && <p role="status" className="rounded border border-brand bg-brand-soft p-3 text-sm">{done}</p>}

      {tab === "mine" && <MineTab userId={user.id} search={searchParams} />}
      {tab === "submit" && <SubmitTab userId={user.id} search={searchParams} />}
      {tab === "requests" && <RequestsTab userId={user.id} isAdmin={isAdmin} />}
      {tab === "team" && isAdmin && <TeamTab search={searchParams} />}
    </div>
  );
}

/** Previous / Today / Next and the Week | Month switch, shared by the two calendar tabs. */
function CalendarNav({ tab, view, anchor, today, title }: { tab: string; view: "week" | "month"; anchor: string; today: string; title: string }) {
  const href = (v: string, d: string) => `/availability?tab=${tab}&view=${v}&date=${d}`;
  const prev = view === "week" ? addDays(anchor, -7) : addMonths(anchor, -1);
  const next = view === "week" ? addDays(anchor, 7) : addMonths(anchor, 1);
  return (
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
  );
}

function viewState(search: Search) {
  const today = todayLondon();
  const view: "week" | "month" = search.view === "month" ? "month" : "week";
  const anchor = isYmd(search.date) ? search.date : today;
  const days = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)) : monthGridDays(anchor);
  const title = view === "week" ? `${fmtShort(days[0])} to ${fmtShort(days[6])}` : fmtMonth(anchor);
  return { today, view, anchor, days, title };
}

async function MineTab({ userId, search }: { userId: string; search: Search }) {
  const { today, view, anchor, days, title } = viewState(search);
  const [rows, reminder] = await Promise.all([
    db().query<{ day: string; status: Status }>("SELECT day, status FROM availability_days WHERE user_id = $1 AND day BETWEEN $2 AND $3", [userId, days[0], days[days.length - 1]]),
    availabilityReminder(userId),
  ]);
  const byDay = new Map(rows.rows.map((r) => [r.day, r.status]));
  const statusOf = (d: string): Status => byDay.get(d) ?? "not_provided";
  const inRange = (d: string) => view === "week" || d.slice(0, 7) === anchor.slice(0, 7);

  return (
    <>
      {reminder && <ReminderBanner reminder={reminder} />}
      <CalendarNav tab="mine" view={view} anchor={anchor} today={today} title={title} />
      <Legend />
      <p className="text-sm text-ink-muted">Days you have submitted are locked. To change them, use the Change requests tab.</p>

      {view === "month" && (
        <div role="group" aria-label={title} className="overflow-hidden rounded-lg border border-line bg-surface-raised">
          <div className="grid grid-cols-7 border-b border-line bg-brand-soft text-center text-xs font-semibold">
            {days.slice(0, 7).map((d) => <div key={d} className="py-2">{fmtWeekday(d)}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const s = statusOf(d);
              const m = STATUS_META[s];
              return (
                <div key={d} className={`min-h-16 border-b border-r border-line p-1 text-xs ${inRange(d) ? "" : "bg-surface text-ink-muted"} ${d === today ? "ring-2 ring-inset ring-brand" : ""}`}>
                  <div className="font-semibold">{fmtDayNum(d)}</div>
                  {/* Past days nobody submitted are left blank rather than shown as Not provided. */}
                  {inRange(d) && (d >= today || byDay.has(d)) && (
                    <span className={`mt-1 inline-flex max-w-full items-center gap-0.5 rounded border px-1 py-0.5 ${m.classes}`} title={`${fmtShort(d)}: ${m.label}`}>
                      <span aria-hidden="true">{m.symbol}</span>
                      <span className="hidden truncate sm:inline">{m.label}</span>
                      <span className="sr-only">{fmtShort(d)}: {m.label}{byDay.has(d) ? ", locked" : ""}</span>
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
          {days.map((d) => (
            <li key={d} className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-surface-raised p-3 ${d === today ? "border-brand" : "border-line"}`}>
              <span className="w-44 shrink-0 font-medium">{fmtLong(d)}{d === today && " (today)"}</span>
              <StatusBadge status={statusOf(d)} locked={byDay.has(d)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ReminderBanner({ reminder }: { reminder: NonNullable<Awaited<ReturnType<typeof availabilityReminder>>> }) {
  return (
    <section aria-labelledby="remind" className="rounded-lg border border-warn bg-white p-4">
      <h2 id="remind" className="font-semibold text-warn">
        {reminder.overdue ? `Availability for ${reminder.monthLabel} is overdue` : `Enter your availability for ${reminder.monthLabel}`}
      </h2>
      <p className="mt-1 text-sm">
        {reminder.submittedDays} of {reminder.totalDays} days submitted. Please enter it by the {REMINDER_DAY}th of this month.
      </p>
      <Link href={`/availability?tab=submit&month=${reminder.monthStart.slice(0, 7)}`} className="mt-2 inline-block text-sm text-brand-text underline">Enter availability for {reminder.monthLabel}</Link>
    </section>
  );
}

async function SubmitTab({ userId, search }: { userId: string; search: Search }) {
  const today = todayLondon();
  const lastAllowed = addDays(today, MAX_DAYS_AHEAD);
  // Months you can enter: this month up to a year ahead.
  const months: string[] = [];
  for (let m = startOfMonth(today); m <= lastAllowed; m = addMonths(m, 1)) months.push(m.slice(0, 7));
  const reminder = await availabilityReminder(userId);
  const month = months.includes(search.month ?? "") ? search.month! : reminder?.monthStart.slice(0, 7) ?? months[Math.min(1, months.length - 1)];

  const first = `${month}-01`;
  const start = first > today ? first : today;
  const monthEnd = addDays(addMonths(first, 1), -1);
  const end = monthEnd < lastAllowed ? monthEnd : lastAllowed;
  const { rows } = await db().query<{ day: string; status: Status }>("SELECT day, status FROM availability_days WHERE user_id = $1 AND day BETWEEN $2 AND $3", [userId, start, end]);
  const locked = new Map(rows.map((r) => [r.day, r.status]));

  const days: FormDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
    days.push({ ymd: d, label: fmtShort(d), weekend: dow >= 5, locked: locked.get(d) ?? null });
  }

  return (
    <>
      {reminder && <ReminderBanner reminder={reminder} />}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface-raised p-4">
        <input type="hidden" name="tab" value="submit" />
        <label className="flex flex-col gap-1 text-sm font-medium">Month
          <select name="month" defaultValue={month} className={field}>
            {months.map((m) => <option key={m} value={m}>{fmtMonth(`${m}-01`)}</option>)}
          </select>
        </label>
        <button className={primary}>Show month</button>
      </form>
      <Legend />
      <h2 className="text-xl font-semibold">{fmtMonth(first)}</h2>
      {/* Keyed on the month so changing month starts a fresh form instead of reusing the old answers. */}
      <SubmitForm key={month} month={month} days={days} />
    </>
  );
}

type RequestRow = {
  id: string; user_name: string; from_day: string; to_day: string; requested_status: Status; reason: string; state: "pending" | "approved" | "declined";
  created_at: Date; decided_at: Date | null; decided_by_name: string | null; decision_note: string;
};

const requestSelect = `SELECT r.id, u.name AS user_name, r.from_day, r.to_day, r.requested_status, r.reason, r.state, r.created_at, r.decided_at,
                              d.name AS decided_by_name, r.decision_note
                         FROM availability_change_requests r
                         JOIN users u ON u.id = r.user_id
                         LEFT JOIN users d ON d.id = r.decided_by`;

function StateBadge({ state }: { state: RequestRow["state"] }) {
  const m = { pending: ["◔", "Waiting", "border-warn text-warn"], approved: ["✓", "Approved", "border-brand-text text-brand-text"], declined: ["✗", "Declined", "border-danger text-danger"] }[state];
  return <span className={`inline-flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-xs font-semibold ${m[2]}`}><span aria-hidden="true">{m[0]}</span>{m[1]}</span>;
}

async function RequestsTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const today = todayLondon();
  const [mine, queue, recent] = await Promise.all([
    db().query<RequestRow>(`${requestSelect} WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 20`, [userId]),
    isAdmin ? db().query<RequestRow>(`${requestSelect} WHERE r.state = 'pending' ORDER BY r.created_at`) : Promise.resolve({ rows: [] as RequestRow[] }),
    isAdmin ? db().query<RequestRow>(`${requestSelect} WHERE r.state <> 'pending' ORDER BY r.decided_at DESC LIMIT 15`) : Promise.resolve({ rows: [] as RequestRow[] }),
  ]);

  return (
    <>
      {isAdmin && (
        <section aria-labelledby="queue" className="flex flex-col gap-3">
          <h2 id="queue" className="text-xl font-semibold">Waiting for a decision</h2>
          {queue.rows.length === 0 ? (
            <p className="text-ink-muted">No requests are waiting.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {queue.rows.map((r) => (
                <li key={r.id} className="rounded-lg border border-warn bg-surface-raised p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">{r.user_name}</span>
                    <span className="text-sm text-ink-muted">asked {fmtStamp(r.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm">Change <strong>{rangeLabel(r.from_day, r.to_day)}</strong> to <StatusBadge status={r.requested_status} /></p>
                  <p className="mt-1 whitespace-pre-line text-sm"><span className="font-semibold">Reason:</span> {r.reason}</p>
                  <form action={decideRequest.bind(null, r.id)} className="mt-3 flex flex-col gap-2">
                    <label className="flex flex-col gap-1 text-sm font-medium">Note to the person (optional)
                      <input name="note" maxLength={500} className={field} />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button name="decision" value="approve" className={primary}>Approve<span className="sr-only"> request from {r.user_name}</span></button>
                      <button name="decision" value="decline" className={small}>Decline<span className="sr-only"> request from {r.user_name}</span></button>
                    </div>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="new-request" className="flex flex-col gap-3">
        <h2 id="new-request" className="text-xl font-semibold">Ask for a change</h2>
        <p className="text-sm text-ink-muted">Use this to change days you have already submitted. An administrator is told on their Dashboard and decides. Up to {MAX_REQUEST_SPAN + 1} days per request.</p>
        <form action={requestChange} className="grid gap-3 rounded-lg border border-line bg-surface-raised p-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">From
            <input type="date" name="from" required min={today} max={addDays(today, MAX_DAYS_AHEAD)} defaultValue={today} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">To (same day for one day)
            <input type="date" name="to" required min={today} max={addDays(today, MAX_DAYS_AHEAD)} defaultValue={today} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Change to
            <select name="status" required defaultValue="" className={field}>
              <option value="" disabled>Choose</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-3">Why do you need the change?
            <textarea name="reason" required rows={2} maxLength={500} className={field} />
          </label>
          <button className={`${primary} sm:col-span-3`}>Send request</button>
        </form>
      </section>

      <section aria-labelledby="my-requests" className="flex flex-col gap-3">
        <h2 id="my-requests" className="text-xl font-semibold">Your requests</h2>
        {mine.rows.length === 0 ? (
          <p className="text-ink-muted">You have not made any requests.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {mine.rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-line bg-surface-raised p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StateBadge state={r.state} />
                  <span className="font-medium">{rangeLabel(r.from_day, r.to_day)}</span>
                  <span className="text-sm">to</span>
                  <StatusBadge status={r.requested_status} />
                </div>
                <p className="mt-1 whitespace-pre-line text-sm"><span className="font-semibold">Reason:</span> {r.reason}</p>
                {r.decided_at && (
                  <p className="mt-1 text-sm text-ink-muted">
                    {r.state === "approved" ? "Approved" : "Declined"} {fmtStamp(r.decided_at)}{r.decided_by_name ? ` by ${r.decided_by_name}` : ""}.{r.decision_note ? ` ${r.decision_note}` : ""}
                  </p>
                )}
                {r.state === "pending" && (
                  <form action={cancelRequest.bind(null, r.id)} className="mt-3"><button className={small}>Withdraw request</button></form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && recent.rows.length > 0 && (
        <section aria-labelledby="decided" className="flex flex-col gap-3">
          <h2 id="decided" className="text-xl font-semibold">Recently decided</h2>
          <ul className="flex flex-col gap-2">
            {recent.rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface-raised p-3 text-sm">
                <StateBadge state={r.state} />
                <span className="font-medium">{r.user_name}</span>
                <span>{rangeLabel(r.from_day, r.to_day)}</span>
                <StatusBadge status={r.requested_status} />
                {r.decided_at && <span className="text-ink-muted">{fmtStamp(r.decided_at)}{r.decided_by_name ? ` by ${r.decided_by_name}` : ""}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

async function TeamTab({ search }: { search: Search }) {
  const { today, view, anchor, title } = viewState(search);
  // The grid shows the days of the week, or of the month itself (not the padded weeks around it).
  const days = view === "week"
    ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))
    : Array.from({ length: Number(addDays(addMonths(startOfMonth(anchor), 1), -1).slice(8)) }, (_, i) => addDays(startOfMonth(anchor), i));
  // The status box covers the month being viewed (so a notification can open the right month);
  // in week view, or for a month that has already passed, it covers next month.
  const viewedMonth = startOfMonth(anchor);
  const nextMonth = view === "month" && viewedMonth >= startOfMonth(today) ? viewedMonth : addMonths(startOfMonth(today), 1);

  const [people, cells, missing] = await Promise.all([
    db().query<{ id: string; name: string }>("SELECT id, name FROM users WHERE active ORDER BY lower(name)"),
    db().query<{ user_id: string; day: string; status: Status; submitted_at: Date }>("SELECT user_id, day, status, submitted_at FROM availability_days WHERE day BETWEEN $1 AND $2", [days[0], days[days.length - 1]]),
    db().query<{ name: string; n: number }>(
      `SELECT u.name, (SELECT count(*)::int FROM availability_days a WHERE a.user_id = u.id AND a.day >= $1::date AND a.day < $2::date) AS n
         FROM users u WHERE u.active ORDER BY lower(u.name)`,
      [nextMonth, addMonths(nextMonth, 1)]
    ),
  ]);
  // The scroll area below is `relative` so its screen-reader-only text stays inside it instead of widening the page.
  const byKey = new Map(cells.rows.map((c) => [`${c.user_id}|${c.day}`, c.status]));
  // When each person last submitted days in the period on screen, shown under their name.
  const lastSubmitted = new Map<string, Date>();
  for (const c of cells.rows) {
    const prev = lastSubmitted.get(c.user_id);
    if (!prev || c.submitted_at > prev) lastSubmitted.set(c.user_id, c.submitted_at);
  }
  const fmtSubmitted = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }).format(d);
  const nextMonthDays = Number(addDays(addMonths(nextMonth, 1), -1).slice(8));
  const notDone = missing.rows.filter((m) => m.n < nextMonthDays);

  // Counts per day, so you can see at a glance how many people are available.
  const availableOn = (d: string) => people.rows.filter((p) => byKey.get(`${p.id}|${d}`) === "available").length;

  return (
    <>
      <section aria-labelledby="next" className={`rounded-lg border bg-white p-4 ${notDone.length ? "border-warn" : "border-brand"}`}>
        <h2 id="next" className={`font-semibold ${notDone.length ? "text-warn" : "text-brand-text"}`}>Availability for {fmtMonth(nextMonth)}</h2>
        {notDone.length === 0 ? (
          <p className="mt-1 text-sm">Everyone has entered every day.</p>
        ) : (
          <>
            <p className="mt-1 text-sm"><span className="font-semibold">{missing.rows.length - notDone.length} of {missing.rows.length}</span> people have entered every day.</p>
            <p className="mt-1 text-sm">Not fully entered yet ({notDone.length}): {notDone.map((m) => `${m.name} (${m.n}/${nextMonthDays} days)`).join(", ")}.</p>
          </>
        )}
      </section>

      <CalendarNav tab="team" view={view} anchor={anchor} today={today} title={title} />
      <Legend />

      {people.rows.length === 0 ? (
        <p className="text-ink-muted">There are no active people.</p>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border border-line bg-surface-raised">
          <table className="w-full border-collapse text-center text-xs">
            <caption className="sr-only">Availability for {title}</caption>
            <thead>
              <tr className="bg-brand-soft">
                <th scope="col" className="sticky left-0 z-10 min-w-[9rem] border-b border-r border-line bg-brand-soft px-2 py-2 text-left text-sm">Person</th>
                {days.map((d) => (
                  <th key={d} scope="col" className={`min-w-[2.5rem] border-b border-line px-1 py-2 font-semibold ${d === today ? "ring-2 ring-inset ring-brand" : ""}`}>
                    <div>{fmtWeekday(d)}</div><div>{fmtDayNum(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.rows.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="sticky left-0 z-10 border-b border-r border-line bg-surface-raised px-2 py-2 text-left text-sm font-medium">
                    {p.name}
                    <span className="block text-xs font-normal text-ink-muted">
                      {lastSubmitted.has(p.id) ? `Submitted ${fmtSubmitted(lastSubmitted.get(p.id)!)}` : "Nothing submitted"}
                    </span>
                  </th>
                  {days.map((d) => {
                    const s = byKey.get(`${p.id}|${d}`) ?? "not_provided";
                    const m = STATUS_META[s];
                    return (
                      <td key={d} className={`border-b border-line p-1 ${m.classes.split(" ").filter((c) => !c.startsWith("border-")).join(" ")}`} title={`${p.name}, ${fmtShort(d)}: ${m.label}`}>
                        <span aria-hidden="true" className="font-bold">{m.symbol}</span>
                        <span className="sr-only">{m.label}</span>
                        {view === "week" && <span className="ml-1 hidden sm:inline">{m.label}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="bg-surface">
                <th scope="row" className="sticky left-0 z-10 border-r border-line bg-surface px-2 py-2 text-left text-sm font-medium">Available</th>
                {days.map((d) => <td key={d} className="px-1 py-2 font-semibold">{availableOn(d)}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-ink-muted">The bottom row counts how many people are Available each day.</p>
    </>
  );
}
