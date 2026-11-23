import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { monthlyVanStatus } from "@/lib/vans";
import { CHECK_ITEMS, CONDITIONS, type ConditionKey } from "@/lib/vans-shared";
import { CheckForm } from "./CheckForm";
import { addVan, setVanActive } from "./actions";

type Search = { tab?: string; van?: string; month?: string; issues?: string; error?: string; done?: string };

const ERRORS: Record<string, string> = {
  reg: "Enter a valid registration (letters, numbers, spaces or hyphens, 2 to 12 characters).",
  dup: "That registration is already on the list.",
  missing: "That van no longer exists.",
};
const DONE: Record<string, string> = {
  checked: "Van check submitted. Thank you.",
  added: "Van added. It now appears in the check form and the monthly reminders.",
  deactivated: "Van deactivated. It is hidden from the check form and reminders, and its past checks are kept.",
  restored: "Van restored to the active list.",
};

const uuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const fmtDateTime = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(d);
const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(d);
const vanLabel = (v: { registration: string; description: string }) => (v.description ? `${v.registration} (${v.description})` : v.registration);
const field = "rounded border border-line bg-white px-3 py-2 font-normal";
const primary = "self-start rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark";
const small = "rounded border border-line px-3 py-1.5 text-sm hover:bg-brand-soft";

function ConditionBadge({ condition }: { condition: ConditionKey }) {
  const c = CONDITIONS[condition];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${c.classes}`}>
      <span aria-hidden="true">{c.symbol}</span>
      {c.label} ({c.detail})
    </span>
  );
}

export default async function VansPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  // Staff only ever see the check form. The other tabs are admin-only, and each is guarded here on the server.
  const tab = isAdmin && (searchParams.tab === "records" || searchParams.tab === "vehicles") ? searchParams.tab : "check";
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const done = searchParams.done ? DONE[searchParams.done] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Van Compliance</h1>

      {isAdmin && (
        <nav aria-label="Van compliance sections" className="flex gap-2 overflow-x-auto border-b border-line">
          {[
            { id: "check", label: "Submit a check" },
            { id: "records", label: "Records" },
            { id: "vehicles", label: "Vehicles" },
          ].map((t) => (
            <Link
              key={t.id}
              href={`/vans?tab=${t.id}`}
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

      {tab === "check" && <CheckTab isAdmin={isAdmin} preselect={searchParams.van} />}
      {tab === "records" && <RecordsTab search={searchParams} />}
      {tab === "vehicles" && <VehiclesTab />}
    </div>
  );
}

async function CheckTab({ isAdmin, preselect }: { isAdmin: boolean; preselect?: string }) {
  const { vans, due, monthLabel } = await monthlyVanStatus();
  const defaultVan = uuid(preselect) && vans.some((v) => v.id === preselect) ? preselect : undefined;

  return (
    <>
      {vans.length === 0 ? (
        <p className="rounded border border-line bg-surface-raised p-4">
          No vans have been added yet.{isAdmin ? " Add them under the Vehicles tab." : " Ask an administrator to add them."}
        </p>
      ) : due.length > 0 ? (
        <section aria-labelledby="due" className="rounded-lg border border-warn bg-white p-4">
          <h2 id="due" className="font-semibold text-warn">Monthly van checks due for {monthLabel}</h2>
          <p className="mt-1 text-sm">These vans have not had a check recorded this month:</p>
          <ul className="mt-2 flex flex-col gap-1">
            {due.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-3 text-sm">
                <span className="font-medium">{vanLabel(v)}</span>
                <Link href={`/vans?van=${v.id}`} className="text-brand-text underline">Check this van<span className="sr-only">: {v.registration}</span></Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p role="status" className="rounded border border-brand bg-brand-soft p-3 text-sm">
          All {vans.length} {vans.length === 1 ? "van has" : "vans have"} had a check recorded for {monthLabel}.
        </p>
      )}

      {vans.length > 0 && (
        <section aria-labelledby="new-check" className="flex flex-col gap-3">
          <h2 id="new-check" className="text-xl font-semibold">New van check</h2>
          <CheckForm vans={vans.map((v) => ({ id: v.id, label: vanLabel(v) }))} defaultVan={defaultVan} />
        </section>
      )}
    </>
  );
}

type CheckRow = {
  id: string; checked_at: Date; registration: string; description: string; checked_by: string | null; condition: ConditionKey; notes: string; flagged: boolean;
  [k: string]: unknown;
};

async function RecordsTab({ search }: { search: Search }) {
  const vanFilter = uuid(search.van) ? search.van : null;
  const monthFilter = /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month ?? "") ? `${search.month}-01` : null;
  const issuesOnly = search.issues === "1";

  const [vansRes, checksRes] = await Promise.all([
    db().query<{ id: string; registration: string; description: string }>("SELECT id, registration, description FROM vans ORDER BY registration"),
    db().query<CheckRow>(
      `SELECT * FROM (
         SELECT c.id, c.checked_at, v.registration, v.description, u.name AS checked_by, c.condition, c.notes,
                c.oil_ok, c.oil_note, c.tyres_ok, c.tyres_note, c.lights_ok, c.lights_note,
                c.dashboard_ok, c.dashboard_note, c.clean_ok, c.clean_note,
                (c.condition <> 'compliant' OR NOT (c.oil_ok AND c.tyres_ok AND c.lights_ok AND c.dashboard_ok AND c.clean_ok)) AS flagged
           FROM van_checks c
           JOIN vans v ON v.id = c.van_id
           LEFT JOIN users u ON u.id = c.checked_by
          WHERE ($1::uuid IS NULL OR c.van_id = $1)
            AND ($2::date IS NULL OR ((c.checked_at AT TIME ZONE 'Europe/London') >= $2::date
                                  AND (c.checked_at AT TIME ZONE 'Europe/London') <  $2::date + interval '1 month'))
       ) t
       WHERE (NOT $3::boolean OR t.flagged)
       ORDER BY t.checked_at DESC
       LIMIT 100`,
      [vanFilter, monthFilter, issuesOnly]
    ),
  ]);
  const checks = checksRes.rows;

  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface-raised p-4">
        <input type="hidden" name="tab" value="records" />
        <label className="flex flex-col gap-1 text-sm font-medium">Van
          <select name="van" defaultValue={vanFilter ?? ""} className={field}>
            <option value="">All vans</option>
            {vansRes.rows.map((v) => <option key={v.id} value={v.id}>{vanLabel(v)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Month
          <input type="month" name="month" defaultValue={search.month ?? ""} className={field} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="issues" value="1" defaultChecked={issuesOnly} className="h-5 w-5 accent-brand-text" />
          Needs attention only
        </label>
        <button className={primary}>Filter</button>
        <Link href="/vans?tab=records" className={`${small} self-center`}>Clear</Link>
      </form>

      <p className="text-sm text-ink-muted" role="status">
        {checks.length === 0 ? "No checks match." : `Showing ${checks.length} check${checks.length === 1 ? "" : "s"}, newest first${checks.length === 100 ? " (the latest 100; narrow the filter to see others)" : ""}.`}
      </p>

      <ul className="flex flex-col gap-3">
        {checks.map((c) => (
          <li key={c.id} className={`rounded-lg border bg-surface-raised ${c.flagged ? "border-warn" : "border-line"}`}>
            {/* Checks that need attention start open; clean ones are collapsed so the list is quick to scan. */}
            <details open={c.flagged}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-4">
                <span className="font-semibold">{vanLabel(c)}</span>
                <span className="text-sm text-ink-muted">{fmtDateTime(c.checked_at)}{c.checked_by ? ` by ${c.checked_by}` : ""}</span>
                <ConditionBadge condition={c.condition} />
                {c.flagged && <span className="rounded bg-warn px-2 py-0.5 text-xs font-bold text-white">NEEDS ATTENTION</span>}
              </summary>
              <div className="border-t border-line p-4">
                <ul className="flex flex-col gap-2">
                  {CHECK_ITEMS.map((item) => {
                    const ok = c[`${item.key}_ok`] as boolean;
                    const note = c[`${item.key}_note`] as string;
                    return (
                      <li key={item.key} className="flex gap-2 text-sm">
                        <span aria-hidden="true" className={ok ? "text-brand-text" : "font-bold text-danger"}>{ok ? "✓" : "✗"}</span>
                        <span>
                          <span className={ok ? "" : "font-semibold text-danger"}>{item.label}: {ok ? "Yes" : "No"}</span>
                          {!ok && note && <span>. {note}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {c.notes && <p className="mt-3 whitespace-pre-line text-sm"><span className="font-semibold">Notes:</span> {c.notes}</p>}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}

async function VehiclesTab() {
  const { rows } = await db().query<{ id: string; registration: string; description: string; active: boolean; last_checked: Date | null }>(
    `SELECT v.id, v.registration, v.description, v.active, (SELECT max(c.checked_at) FROM van_checks c WHERE c.van_id = v.id) AS last_checked
       FROM vans v ORDER BY v.active DESC, v.registration`
  );

  return (
    <>
      <form action={addVan} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
        <h2 className="font-semibold">Add a van</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">Registration
            <input name="registration" required maxLength={12} autoCapitalize="characters" className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Description (optional, for example make and model)
            <input name="description" maxLength={80} className={field} />
          </label>
        </div>
        <button className={primary}>Add van</button>
      </form>

      {rows.length === 0 ? (
        <p className="text-ink-muted">No vans yet. Add the first one above.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((v) => (
            <li key={v.id} className="rounded-lg border border-line bg-surface-raised p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="font-semibold">{v.registration}</h2>
                {v.description && <span className="text-sm text-ink-muted">{v.description}</span>}
                <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${v.active ? "border-brand-text text-brand-text" : "border-line text-ink-muted"}`}>
                  {v.active ? "Active" : "Deactivated"}
                </span>
              </div>
              <p className="mt-1 text-sm text-ink-muted">{v.last_checked ? `Last check: ${fmtDate(v.last_checked)}` : "No checks recorded yet."}</p>
              <form action={setVanActive.bind(null, v.id, !v.active)} className="mt-3">
                <button className={small}>{v.active ? "Deactivate" : "Reactivate"}</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-ink-muted">Deactivating a van hides it from the check form and monthly reminders. Its past checks are kept.</p>
    </>
  );
}
