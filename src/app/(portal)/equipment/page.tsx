import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { monthlyEquipmentStatus } from "@/lib/equipment";
import { CATEGORIES, ITEMS, RESULT_LABEL, isCategory, isItemKey, type CategoryKey, type Result } from "@/lib/equipment-shared";
import { MAX_PDF_BYTES, storageConfigured } from "@/lib/storage";
import { CheckForm } from "./CheckForm";
import { addEquipment, setEquipmentActive, updateEquipment } from "./actions";

type Search = { tab?: string; equipment?: string; category?: string; month?: string; issues?: string; error?: string; done?: string };

const ERRORS: Record<string, string> = {
  name: "Enter a name for the equipment.",
  category: "Choose a category.",
  missing: "That equipment no longer exists.",
  toobig: `That file is too big. Manuals must be ${MAX_PDF_BYTES / 1024 / 1024} MB or smaller.`,
  notpdf: "That file is not a PDF. Upload the manual as a PDF.",
  storage: "File storage is not set up yet, so manuals cannot be uploaded. The equipment can still be added without one.",
};
const DONE: Record<string, string> = {
  checked: "Equipment check submitted. Thank you.",
  added: "Equipment added. It now appears in the check form and the monthly reminders.",
  updated: "Equipment details saved.",
  deactivated: "Equipment deactivated. It is hidden from the check form and reminders, and its past checks are kept.",
  restored: "Equipment restored to the active list.",
};

const uuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const fmtDateTime = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(d);
const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(d);
const field = "rounded border border-line bg-white px-3 py-2 font-normal";
const primary = "self-start rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark";
const small = "rounded border border-line px-3 py-1.5 text-sm hover:bg-brand-soft";
const equipmentLabel = (e: { name: string; model_serial: string }) => (e.model_serial ? `${e.name} (${e.model_serial})` : e.name);

const TABS = [
  { id: "check", label: "Submit a check" },
  { id: "history", label: "History" },
  { id: "assets", label: "Equipment list" },
];

export default async function EquipmentPage({ searchParams }: { searchParams: Search }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const tab = TABS.some((t) => t.id === searchParams.tab) ? searchParams.tab! : "check";
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const done = searchParams.done ? DONE[searchParams.done] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Equipment Maintenance</h1>

      <nav aria-label="Equipment maintenance sections" className="flex gap-2 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/equipment?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`whitespace-nowrap border-b-4 px-4 py-2 text-sm font-medium ${tab === t.id ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{error}</p>}
      {done && <p role="status" className="rounded border border-brand bg-brand-soft p-3 text-sm">{done}</p>}

      {tab === "check" && <CheckTab isAdmin={isAdmin} preselect={searchParams.equipment} />}
      {tab === "history" && <HistoryTab search={searchParams} />}
      {tab === "assets" && <AssetsTab isAdmin={isAdmin} />}
    </div>
  );
}

async function CheckTab({ isAdmin, preselect }: { isAdmin: boolean; preselect?: string }) {
  const { items, due, monthLabel } = await monthlyEquipmentStatus();
  const defaultEquipment = uuid(preselect) && items.some((e) => e.id === preselect) ? preselect : undefined;

  return (
    <>
      {items.length === 0 ? (
        <p className="rounded border border-line bg-surface-raised p-4">
          No equipment has been added yet.{isAdmin ? " Add it under the Equipment list tab." : " Ask an administrator to add it."}
        </p>
      ) : due.length > 0 ? (
        <section aria-labelledby="due" className="rounded-lg border border-warn bg-white p-4">
          <h2 id="due" className="font-semibold text-warn">Monthly equipment checks due for {monthLabel}</h2>
          <p className="mt-1 text-sm">{due.length} of {items.length} {items.length === 1 ? "item has" : "items have"} not had a check recorded this month:</p>
          <ul className="mt-2 flex flex-col gap-1">
            {due.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 text-sm">
                <span className="font-medium">{equipmentLabel(e)}</span>
                <span className="text-ink-muted">{CATEGORIES[e.category].label}</span>
                <Link href={`/equipment?equipment=${e.id}`} className="text-brand-text underline">Check this item<span className="sr-only">: {e.name}</span></Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p role="status" className="rounded border border-brand bg-brand-soft p-3 text-sm">
          All {items.length} {items.length === 1 ? "item has" : "items have"} had a check recorded for {monthLabel}.
        </p>
      )}

      {items.length > 0 && (
        <section aria-labelledby="new-check" className="flex flex-col gap-3">
          <h2 id="new-check" className="text-xl font-semibold">New equipment check</h2>
          <CheckForm equipment={items.map((e) => ({ id: e.id, label: equipmentLabel(e), category: e.category }))} defaultEquipment={defaultEquipment} />
        </section>
      )}
    </>
  );
}

type CheckRow = {
  id: string; checked_at: Date; name: string; model_serial: string; category: CategoryKey; checked_by: string | null; notes: string; flagged: boolean;
  items: { key: string; result: Result; note: string }[];
};

async function HistoryTab({ search }: { search: Search }) {
  const equipmentFilter = uuid(search.equipment) ? search.equipment : null;
  const categoryFilter = isCategory(search.category) ? search.category : null;
  const monthFilter = /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month ?? "") ? `${search.month}-01` : null;
  const issuesOnly = search.issues === "1";

  const [listRes, checksRes] = await Promise.all([
    db().query<{ id: string; name: string; model_serial: string }>("SELECT id, name, model_serial FROM equipment ORDER BY lower(name)"),
    db().query<CheckRow>(
      `SELECT c.id, c.checked_at, c.notes, e.name, e.model_serial, e.category, u.name AS checked_by,
              COALESCE(bool_or(i.result = 'no'), false) AS flagged,
              COALESCE(json_agg(json_build_object('key', i.item_key, 'result', i.result, 'note', i.note)) FILTER (WHERE i.item_key IS NOT NULL), '[]') AS items
         FROM equipment_checks c
         JOIN equipment e ON e.id = c.equipment_id
         LEFT JOIN users u ON u.id = c.checked_by
         LEFT JOIN equipment_check_items i ON i.check_id = c.id
        WHERE ($1::uuid IS NULL OR c.equipment_id = $1)
          AND ($2::text IS NULL OR e.category = $2)
          AND ($3::date IS NULL OR ((c.checked_at AT TIME ZONE 'Europe/London') >= $3::date
                                AND (c.checked_at AT TIME ZONE 'Europe/London') <  $3::date + interval '1 month'))
        GROUP BY c.id, e.id, u.id
       HAVING (NOT $4::boolean OR COALESCE(bool_or(i.result = 'no'), false))
        ORDER BY c.checked_at DESC
        LIMIT 100`,
      [equipmentFilter, categoryFilter, monthFilter, issuesOnly]
    ),
  ]);
  const checks = checksRes.rows;

  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface-raised p-4">
        <input type="hidden" name="tab" value="history" />
        <label className="flex flex-col gap-1 text-sm font-medium">Equipment
          <select name="equipment" defaultValue={equipmentFilter ?? ""} className={field}>
            <option value="">All equipment</option>
            {listRes.rows.map((e) => <option key={e.id} value={e.id}>{equipmentLabel(e)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Category
          <select name="category" defaultValue={categoryFilter ?? ""} className={field}>
            <option value="">All categories</option>
            {(Object.keys(CATEGORIES) as CategoryKey[]).map((k) => <option key={k} value={k}>{CATEGORIES[k].label}</option>)}
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
        <Link href="/equipment?tab=history" className={`${small} self-center`}>Clear</Link>
      </form>

      <p className="text-sm text-ink-muted" role="status">
        {checks.length === 0 ? "No checks match." : `Showing ${checks.length} check${checks.length === 1 ? "" : "s"}, newest first${checks.length === 100 ? " (the latest 100; narrow the filter to see others)" : ""}.`}
      </p>

      <ul className="flex flex-col gap-3">
        {checks.map((c) => {
          // Show the answers in the category's checklist order.
          const order: readonly string[] = CATEGORIES[c.category].items;
          const answers = [...c.items].filter((i) => isItemKey(i.key)).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
          return (
            <li key={c.id} className={`rounded-lg border bg-surface-raised ${c.flagged ? "border-warn" : "border-line"}`}>
              {/* Checks that need attention start open; clean ones are collapsed so the list is quick to scan. */}
              <details open={c.flagged}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-4">
                  <span className="font-semibold">{equipmentLabel(c)}</span>
                  <span className="text-sm text-ink-muted">{CATEGORIES[c.category].label}</span>
                  <span className="text-sm text-ink-muted">{fmtDateTime(c.checked_at)}{c.checked_by ? ` by ${c.checked_by}` : ""}</span>
                  {c.flagged
                    ? <span className="rounded bg-warn px-2 py-0.5 text-xs font-bold text-white">NEEDS ATTENTION</span>
                    : <span className="rounded border border-brand-text px-2 py-0.5 text-xs font-semibold text-brand-text"><span aria-hidden="true">✓</span> All OK</span>}
                </summary>
                <div className="border-t border-line p-4">
                  <ul className="flex flex-col gap-2">
                    {answers.map((a) => {
                      const key = a.key as keyof typeof ITEMS;
                      const mark = a.result === "yes" ? "✓" : a.result === "no" ? "✗" : "–";
                      return (
                        <li key={a.key} className="flex gap-2 text-sm">
                          <span aria-hidden="true" className={a.result === "yes" ? "text-brand-text" : a.result === "no" ? "font-bold text-danger" : "text-ink-muted"}>{mark}</span>
                          <span>
                            <span className={a.result === "no" ? "font-semibold text-danger" : ""}>{ITEMS[key].label}: {RESULT_LABEL[a.result]}</span>
                            {a.result === "no" && a.note && <span>. {a.note}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {c.notes && <p className="mt-3 whitespace-pre-line text-sm"><span className="font-semibold">Notes:</span> {c.notes}</p>}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </>
  );
}

type Asset = {
  id: string; name: string; category: CategoryKey; model_serial: string; spare_parts: string; notes: string;
  manual_filename: string | null; manual_size: number | null; active: boolean; last_checked: Date | null;
};

async function AssetsTab({ isAdmin }: { isAdmin: boolean }) {
  // Staff see the active equipment. Admins also see deactivated items so they can restore them.
  const { rows } = await db().query<Asset>(
    `SELECT e.id, e.name, e.category, e.model_serial, e.spare_parts, e.notes, e.manual_filename, e.manual_size, e.active,
            (SELECT max(c.checked_at) FROM equipment_checks c WHERE c.equipment_id = e.id) AS last_checked
       FROM equipment e
      WHERE e.active OR $1::boolean
      ORDER BY e.active DESC, lower(e.name)`,
    [isAdmin]
  );
  const storage = storageConfigured();

  return (
    <>
      {isAdmin && (
        <form action={addEquipment} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
          <h2 className="font-semibold">Add equipment</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">Equipment name
              <input name="name" required maxLength={120} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Model / serial number
              <input name="model_serial" maxLength={200} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Manual (PDF, optional)
              <input type="file" name="manual" accept="application/pdf,.pdf" className={field} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">Spare parts (optional)
            <textarea name="spare_parts" rows={2} maxLength={2000} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Notes (optional)
            <textarea name="notes" rows={2} maxLength={2000} className={field} />
          </label>
          {!storage && <p className="text-sm text-warn">File storage is not set up yet, so manuals cannot be uploaded. Set <code>FILES_DIR</code> to a mounted volume first.</p>}
          <button className={primary}>Add equipment</button>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-ink-muted">No equipment yet.{isAdmin ? " Add the first item above." : " An administrator will add it."}</p>
      ) : (
        (Object.keys(CATEGORIES) as CategoryKey[]).map((cat, _i, all) => {
          const group = rows.filter((r) => r.category === cat);
          if (group.length === 0) return null;
          // Only show the group headings when equipment falls into more than one group.
          const grouped = all.filter((c) => rows.some((r) => r.category === c)).length > 1;
          return (
            <section key={cat} aria-labelledby={`cat-${cat}`} className="flex flex-col gap-3">
              <h2 id={`cat-${cat}`} className={grouped ? "text-xl font-semibold" : "sr-only"}>{CATEGORIES[cat].label}</h2>
              <ul className="flex flex-col gap-3">
                {group.map((e) => (
                  <li key={e.id} className="rounded-lg border border-line bg-surface-raised p-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h3 className="font-semibold">{e.name}</h3>
                      {!e.active && <span className="rounded border border-line px-2 py-0.5 text-xs font-semibold text-ink-muted">Deactivated</span>}
                    </div>
                    <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
                      <dt className="text-ink-muted">Model / serial number</dt>
                      <dd>{e.model_serial || "Not recorded"}</dd>
                      <dt className="text-ink-muted">Spare parts</dt>
                      <dd className="whitespace-pre-line">{e.spare_parts || "Not recorded"}</dd>
                      <dt className="text-ink-muted">Manual</dt>
                      <dd>
                        {e.manual_filename
                          ? <a href={`/equipment/manual/${e.id}`} target="_blank" rel="noopener" className="text-brand-text underline">Open manual (PDF){e.manual_size ? `, ${Math.max(1, Math.round(e.manual_size / 1024))} KB` : ""}<span className="sr-only"> for {e.name}</span></a>
                          : "No manual uploaded"}
                      </dd>
                      <dt className="text-ink-muted">Notes</dt>
                      <dd className="whitespace-pre-line">{e.notes || "None"}</dd>
                      <dt className="text-ink-muted">Last check</dt>
                      <dd>{e.last_checked ? fmtDate(e.last_checked) : "No checks recorded yet"}</dd>
                    </dl>

                    {isAdmin && (
                      <div className="mt-3 flex flex-col gap-3">
                        <details className="rounded border border-line">
                          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Edit details<span className="sr-only"> for {e.name}</span></summary>
                          <form action={updateEquipment.bind(null, e.id)} className="flex flex-col gap-3 border-t border-line p-3">
                            <label className="flex flex-col gap-1 text-sm font-medium">Equipment name
                              <input name="name" required maxLength={120} defaultValue={e.name} className={field} />
                            </label>
                            <label className="flex flex-col gap-1 text-sm font-medium">Model / serial number
                              <input name="model_serial" maxLength={200} defaultValue={e.model_serial} className={field} />
                            </label>
                            <label className="flex flex-col gap-1 text-sm font-medium">Spare parts
                              <textarea name="spare_parts" rows={2} maxLength={2000} defaultValue={e.spare_parts} className={field} />
                            </label>
                            <label className="flex flex-col gap-1 text-sm font-medium">Notes
                              <textarea name="notes" rows={2} maxLength={2000} defaultValue={e.notes} className={field} />
                            </label>
                            <label className="flex flex-col gap-1 text-sm font-medium">{e.manual_filename ? "Replace manual (PDF)" : "Upload manual (PDF)"}
                              <input type="file" name="manual" accept="application/pdf,.pdf" className={field} />
                            </label>
                            {e.manual_filename && (
                              <label className="flex min-h-11 items-center gap-2 text-sm">
                                <input type="checkbox" name="remove_manual" className="h-5 w-5 accent-brand-text" /> Remove the current manual (ignored if you upload a new one)
                              </label>
                            )}
                            <button className={primary}>Save changes</button>
                          </form>
                        </details>
                        <form action={setEquipmentActive.bind(null, e.id, !e.active)}>
                          <button className={small}>{e.active ? "Deactivate" : "Reactivate"}<span className="sr-only"> {e.name}</span></button>
                        </form>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      {isAdmin && <p className="text-sm text-ink-muted">Deactivating equipment hides it from the check form and monthly reminders. Its past checks are kept.</p>}
    </>
  );
}
