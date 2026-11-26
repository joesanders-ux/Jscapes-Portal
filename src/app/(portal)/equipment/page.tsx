import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { monthlyEquipmentStatus } from "@/lib/equipment";
import { CATEGORIES, CHECKLISTS, ITEMS, MAX_EQUIPMENT_IMAGES, MAX_EQUIPMENT_MANUALS, MAX_EQUIPMENT_UPLOAD_BYTES, RESULT_LABEL, isCategory, isItemKey, type CategoryKey, type Result } from "@/lib/equipment-shared";
import { MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } from "@/lib/job-images-shared";
import { MAX_PDF_BYTES, storageConfigured } from "@/lib/storage";
import { CheckForm } from "./CheckForm";
import { addEquipment, deleteEquipment, setEquipmentActive, updateEquipment, updateSpareParts } from "./actions";

type Search = { q?: string; open?: string; n?: string; tab?: string; equipment?: string; category?: string; month?: string; issues?: string; error?: string; done?: string };

const ERRORS: Record<string, string> = {
  name: "Enter a name for the equipment.",
  category: "Choose a category.",
  missing: "That equipment no longer exists.",
  confirmdelete: "Tick the box to confirm before deleting equipment. Nothing was deleted.",
  toobig: `That file is too big. Each manual must be ${MAX_PDF_BYTES / 1024 / 1024} MB or smaller.`,
  notpdf: "One of the files is not a PDF. Manuals must be PDF files. Nothing was saved.",
  storage: "File storage is not set up yet, so manuals and pictures cannot be uploaded. The equipment can still be added without them.",
  manualmany: `An item can have up to ${MAX_EQUIPMENT_MANUALS} manuals. Remove some first, or add fewer. Nothing was saved.`,
  manualtotal: `Those files are too large together (the limit is ${MAX_EQUIPMENT_UPLOAD_BYTES / 1024 / 1024} MB at a time for manuals and pictures). Nothing was saved.`,
  imgmany: `An item can have up to ${MAX_EQUIPMENT_IMAGES} pictures. Remove some first, or add fewer. Nothing was saved.`,
  imgtotal: `Those pictures are too large together (the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB at a time). Nothing was saved.`,
  imgbig: `One of the pictures is too large. The limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB per picture. Nothing was saved.`,
  imgbad: "One of the files is not a usable JPEG, PNG or WebP picture. Nothing was saved.",
};
const DONE: Record<string, string> = {
  checked: "Equipment check submitted. Thank you.",
  added: "Equipment added. It now appears in the check form and the monthly reminders.",
  updated: "Equipment details saved.",
  deactivated: "Equipment deactivated. It is hidden from the check form and reminders, and its past checks are kept.",
  restored: "Equipment restored to the active list.",
  spare: "Spare parts saved.",
  deleted: "Equipment deleted, together with its pictures, manuals and past checks.",
};

const uuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);
const fmtDateTime = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(d);
const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(d);
const field = "rounded border border-line bg-white px-3 py-2 font-normal";
const primary = "self-start rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark";
const small = "rounded border border-line px-3 py-1.5 text-sm hover:bg-brand-soft";
/** "Hedge cutter (Stihl, HS 45)": brand and model/serial in brackets when they have been recorded. */
const equipmentLabel = (e: { name: string; brand?: string; model_serial: string }) => {
  const extra = [e.brand, e.model_serial].filter(Boolean).join(", ");
  return extra ? `${e.name} (${extra})` : e.name;
};

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

      {tab === "check" && <CheckTab isAdmin={isAdmin} preselect={searchParams.equipment} nonce={searchParams.n ?? ""} />}
      {tab === "history" && <HistoryTab search={searchParams} />}
      {tab === "assets" && <AssetsTab isAdmin={isAdmin} q={(searchParams.q ?? "").trim().slice(0, 100)} openId={searchParams.open} nonce={searchParams.n ?? ""} formKey={searchParams.done === "added" ? `added-${searchParams.n ?? ""}` : "form"} />}
    </div>
  );
}

async function CheckTab({ isAdmin, preselect, nonce }: { isAdmin: boolean; preselect?: string; nonce: string }) {
  const { items, due, monthLabel } = await monthlyEquipmentStatus();
  const defaultEquipment = uuid(preselect) && items.some((e) => e.id === preselect) ? preselect : undefined;
  const preselectedItem = items.find((e) => e.id === defaultEquipment);

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
                {e.category !== "general" && <span className="text-ink-muted">{CATEGORIES[e.category].label}</span>}
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

      {/* Always shown: pick a checklist, then choose the equipment, tick what was done and add notes. */}
      <section aria-labelledby="new-check" className="flex flex-col gap-3">
        <h2 id="new-check" className="text-xl font-semibold">Submit a check</h2>
        {items.length === 0 && <p className="text-sm text-ink-muted">There is no equipment to check yet.</p>}
        {CHECKLISTS.map((key) => (
          // Opened automatically when someone arrives from a "Check this item" link for equipment of this type.
          <details key={`${key}-${nonce}`} open={preselectedItem?.category === key} className="rounded-lg border border-line bg-surface-raised">
            <summary className="cursor-pointer p-4 text-lg font-semibold">{CATEGORIES[key].label}</summary>
            <div className="border-t border-line p-4">
              <CheckForm
                checklist={key}
                equipment={items.map((e) => ({ id: e.id, label: equipmentLabel(e) }))}
                defaultEquipment={preselectedItem?.category === key ? defaultEquipment : undefined}
              />
            </div>
          </details>
        ))}
      </section>
    </>
  );
}

type CheckRow = {
  id: string; checked_at: Date; name: string; brand: string; model_serial: string; category: CategoryKey; checked_by: string | null; notes: string; flagged: boolean;
  images: { id: string; name: string }[];
  items: { key: string; result: Result; note: string }[];
};

async function HistoryTab({ search }: { search: Search }) {
  const equipmentFilter = uuid(search.equipment) ? search.equipment : null;
  const categoryFilter = isCategory(search.category) ? search.category : null;
  const monthFilter = /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month ?? "") ? `${search.month}-01` : null;
  const issuesOnly = search.issues === "1";

  const [listRes, checksRes] = await Promise.all([
    db().query<{ id: string; name: string; brand: string; model_serial: string }>("SELECT id, name, brand, model_serial FROM equipment ORDER BY lower(name)"),
    db().query<CheckRow>(
      `SELECT c.id, c.checked_at, c.notes, e.name, e.brand, e.model_serial, COALESCE(c.checklist, e.category) AS category, u.name AS checked_by,
              COALESCE(bool_or(i.result = 'no'), false) AS flagged,
              COALESCE(json_agg(json_build_object('key', i.item_key, 'result', i.result, 'note', i.note)) FILTER (WHERE i.item_key IS NOT NULL), '[]') AS items,
              (SELECT COALESCE(json_agg(json_build_object('id', im.id, 'name', im.original_filename) ORDER BY im.created_at), '[]')
                 FROM equipment_check_images im WHERE im.check_id = c.id) AS images
         FROM equipment_checks c
         JOIN equipment e ON e.id = c.equipment_id
         LEFT JOIN users u ON u.id = c.checked_by
         LEFT JOIN equipment_check_items i ON i.check_id = c.id
        WHERE ($1::uuid IS NULL OR c.equipment_id = $1)
          AND ($2::text IS NULL OR COALESCE(c.checklist, e.category) = $2)
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
        <label className="flex flex-col gap-1 text-sm font-medium">Checklist
          <select name="category" defaultValue={categoryFilter ?? ""} className={field}>
            <option value="">All checklists</option>
            {CHECKLISTS.map((k) => <option key={k} value={k}>{CATEGORIES[k].label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Month
          <input type="month" name="month" defaultValue={search.month ?? ""} className={field} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="issues" value="1" defaultChecked={issuesOnly} className="h-5 w-5 accent-brand-text" />
          Needs attention only
        </label>
        {/* Same size, same height as the fields, and lined up with them along the bottom. */}
        <div className="flex gap-2 self-end">
          <button className="inline-flex min-w-24 items-center justify-center rounded border border-brand bg-brand px-5 py-2 font-medium text-brand-ink hover:bg-brand-dark">Filter</button>
          <Link href="/equipment?tab=history" className="inline-flex min-w-24 items-center justify-center rounded border border-line bg-white px-5 py-2 font-medium hover:bg-brand-soft">Clear</Link>
        </div>
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
                  {c.images.length > 0 && <span className="text-sm text-ink-muted">{c.images.length} {c.images.length === 1 ? "photo" : "photos"}</span>}
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
                            {a.result === "no" && a.note && a.note !== c.notes.slice(0, 500) && <span>. {a.note}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {c.notes && <p className="mt-3 whitespace-pre-line text-sm"><span className="font-semibold">Notes:</span> {c.notes}</p>}
                  {c.images.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-3" aria-label="Photos added with the notes">
                      {c.images.map((im, n) => (
                        <li key={im.id}>
                          <a href={`/equipment/image/${im.id}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded border border-line bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/equipment/image/${im.id}?size=thumb`} alt={`Photo ${n + 1} of ${c.images.length} added with the notes for ${c.name}`} loading="lazy" decoding="async" className="h-28 w-36 object-cover" />
                            <span className="sr-only"> (opens full size in a new tab)</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
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
  id: string; name: string; category: CategoryKey; brand: string; model_serial: string; spare_parts: string; notes: string;
  manuals: { id: string; name: string; size: number }[]; active: boolean; last_checked: Date | null; check_count: number;
  spare_parts_updated_at: Date | null; spare_parts_updated_by_name: string | null; images: { id: string; name: string }[];
};

async function AssetsTab({ isAdmin, formKey, openId, q, nonce }: { isAdmin: boolean; formKey: string; openId?: string; q: string; nonce: string }) {
  // Staff see the active equipment. Admins also see deactivated items so they can restore them.
  const { rows } = await db().query<Asset>(
    `SELECT e.id, e.name, e.category, e.brand, e.model_serial, e.spare_parts, e.notes, e.active,
            (SELECT COALESCE(json_agg(json_build_object('id', m.id, 'name', m.original_filename, 'size', m.size_bytes) ORDER BY m.created_at), '[]')
               FROM equipment_manuals m WHERE m.equipment_id = e.id) AS manuals,
            e.spare_parts_updated_at, su.name AS spare_parts_updated_by_name,
            (SELECT COALESCE(json_agg(json_build_object('id', im.id, 'name', im.original_filename) ORDER BY im.created_at), '[]')
               FROM equipment_images im WHERE im.equipment_id = e.id) AS images,
            (SELECT max(c.checked_at) FROM equipment_checks c WHERE c.equipment_id = e.id) AS last_checked,
            (SELECT count(*)::int FROM equipment_checks c WHERE c.equipment_id = e.id) AS check_count
       FROM equipment e
       LEFT JOIN users su ON su.id = e.spare_parts_updated_by
      WHERE (e.active OR $1::boolean)
        AND ($2 = '' OR e.name ILIKE $2 OR e.brand ILIKE $2 OR e.model_serial ILIKE $2 OR e.spare_parts ILIKE $2 OR e.notes ILIKE $2)
      ORDER BY e.active DESC, lower(e.name)`,
    // The search text is escaped so that % and _ typed by a person match themselves, not "anything".
    [isAdmin, q ? `%${q.replace(/[\\%_]/g, "\\$&")}%` : ""]
  );
  const total = (await db().query<{ n: number }>("SELECT count(*)::int AS n FROM equipment WHERE active OR $1::boolean", [isAdmin])).rows[0].n;
  const storage = storageConfigured();

  return (
    <>
      {isAdmin && (
        // Collapsed to keep the list in view. It stays open after an item is added, empty, ready for the next one.
        <details key={formKey} open={formKey !== "form"} className="group rounded-lg border border-line bg-surface-raised">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">▸</span> Add equipment
        </summary>
        <form action={addEquipment} className="flex flex-col gap-3 border-t border-line p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">Equipment name
              <input name="name" required maxLength={120} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Brand (optional)
              <input name="brand" maxLength={100} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Model / serial number
              <input name="model_serial" maxLength={200} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Manuals (PDF, optional, up to {MAX_EQUIPMENT_MANUALS})
              <input type="file" name="manual" accept="application/pdf,.pdf" multiple className={field} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">Pictures (optional, up to {MAX_EQUIPMENT_IMAGES}, JPEG, PNG or WebP)
            <input type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Spare parts (optional)
            <textarea name="spare_parts" rows={2} maxLength={2000} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Notes (optional)
            <textarea name="notes" rows={2} maxLength={2000} className={field} />
          </label>
          {!storage && <p className="text-sm text-warn">File storage is not set up yet, so manuals and pictures cannot be uploaded. Set <code>FILES_DIR</code> to a mounted volume first.</p>}
          <button className={primary}>Add equipment</button>
        </form>
        </details>
      )}

      {total > 0 && (
        <form method="get" role="search" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value="assets" />
          <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1 text-sm font-medium">Search equipment
            <input type="search" name="q" defaultValue={q} maxLength={100} placeholder="Name, brand, model, spare parts or notes" autoComplete="off" className={field} />
          </label>
          <button className="inline-flex min-w-24 items-center justify-center rounded bg-brand px-5 py-2 font-medium text-brand-ink hover:bg-brand-dark">Search</button>
          {q && <Link href="/equipment?tab=assets" className="inline-flex min-w-24 items-center justify-center rounded border border-line bg-white px-5 py-2 font-medium hover:bg-brand-soft">Clear</Link>}
        </form>
      )}
      {q && total > 0 && (
        <p role="status" className="text-sm text-ink-muted">
          {rows.length === 0 ? `No equipment matches "${q}".` : `Showing ${rows.length} of ${total} ${total === 1 ? "item" : "items"} matching "${q}".`}
        </p>
      )}

      {rows.length === 0 ? (
        total > 0 ? null : <p className="text-ink-muted">No equipment yet.{isAdmin ? " Add the first item above." : " An administrator will add it."}</p>
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
                  // The key changes after every save, so the item is rebuilt from the saved data: file boxes come back empty and new files appear in the list.
                  <li key={`${e.id}-${nonce}`} className="rounded-lg border border-line bg-surface-raised">
                    {/* One line per item; the full details open underneath. Native details/summary, so it also works from the keyboard. */}
                    <details open={openId === e.id || (q !== "" && rows.length === 1)} className="group">
                    <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">▸</span>
                      <h3 className="font-semibold">{e.name}</h3>
                      {e.brand && <span className="text-sm text-ink-muted">{e.brand}</span>}
                      {!e.active && <span className="rounded border border-line px-2 py-0.5 text-xs font-semibold text-ink-muted">Deactivated</span>}
                      <span className="ml-auto flex flex-wrap gap-x-3 text-xs text-ink-muted">
                        {e.manuals.length > 0 && <span>{e.manuals.length} {e.manuals.length === 1 ? "manual" : "manuals"}</span>}
                        {e.images.length > 0 && <span>{e.images.length} {e.images.length === 1 ? "picture" : "pictures"}</span>}
                        <span>{e.last_checked ? `Checked ${fmtDate(e.last_checked)}` : "Not checked yet"}</span>
                      </span>
                    </summary>
                    <div className="border-t border-line p-4">
                    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
                      <dt className="text-ink-muted">Brand</dt>
                      <dd>{e.brand || "Not recorded"}</dd>
                      <dt className="text-ink-muted">Model / serial number</dt>
                      <dd>{e.model_serial || "Not recorded"}</dd>
                      <dt className="text-ink-muted">Spare parts</dt>
                      <dd>
                        <span className="whitespace-pre-line">{e.spare_parts || "Not recorded"}</span>
                        {e.spare_parts_updated_at && (
                          <span className="block text-xs text-ink-muted">
                            Updated {fmtDate(e.spare_parts_updated_at)}{e.spare_parts_updated_by_name ? ` by ${e.spare_parts_updated_by_name}` : ""}
                          </span>
                        )}
                        {/* Anyone signed in can keep the spare parts up to date; it changes nothing else. */}
                        {(e.active || isAdmin) && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-brand-text underline">Edit spare parts<span className="sr-only"> for {e.name}</span></summary>
                            <form action={updateSpareParts.bind(null, e.id)} className="mt-2 flex flex-col gap-2">
                              <label className="flex flex-col gap-1 font-medium">Spare parts for {e.name}
                                <textarea name="spare_parts" rows={3} maxLength={2000} defaultValue={e.spare_parts} className={field} />
                              </label>
                              <button className={`${primary} text-sm`}>Save spare parts</button>
                            </form>
                          </details>
                        )}
                      </dd>
                      <dt className="text-ink-muted">{e.manuals.length > 1 ? "Manuals" : "Manual"}</dt>
                      <dd>
                        {e.manuals.length === 0 ? "No manual uploaded" : (
                          <ul className="flex flex-col gap-1">
                            {e.manuals.map((m) => (
                              <li key={m.id}>
                                <a href={`/equipment/manual/${m.id}`} target="_blank" rel="noopener" className="text-brand-text underline">
                                  {m.name}<span className="sr-only"> (PDF, opens in a new tab), manual for {e.name}</span>
                                </a>
                                <span className="text-ink-muted"> ({Math.max(1, Math.round(m.size / 1024))} KB)</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </dd>
                      <dt className="text-ink-muted">Notes</dt>
                      <dd className="whitespace-pre-line">{e.notes || "None"}</dd>
                      <dt className="text-ink-muted">Last check</dt>
                      <dd>{e.last_checked ? fmtDate(e.last_checked) : "No checks recorded yet"}</dd>
                    </dl>

                    {e.images.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-3" aria-label={`Pictures of ${e.name}`}>
                        {e.images.map((im, n) => (
                          <li key={im.id}>
                            <a href={`/equipment/photo/${im.id}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded border border-line bg-white">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`/equipment/photo/${im.id}?size=thumb`} alt={`Picture ${n + 1} of ${e.images.length}: ${e.name}`} loading="lazy" decoding="async" className="h-28 w-36 object-cover" />
                              <span className="sr-only">Open full size (opens in a new tab)</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}

                    {isAdmin && (
                      <div className="mt-3 flex flex-col gap-3">
                        <details className="rounded border border-line">
                          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Edit details<span className="sr-only"> for {e.name}</span></summary>
                          <form action={updateEquipment.bind(null, e.id)} className="flex flex-col gap-3 border-t border-line p-3">
                            <label className="flex flex-col gap-1 text-sm font-medium">Equipment name
                              <input name="name" required maxLength={120} defaultValue={e.name} className={field} />
                            </label>
                            <label className="flex flex-col gap-1 text-sm font-medium">Brand
                              <input name="brand" maxLength={100} defaultValue={e.brand} className={field} />
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
                            <label className="flex flex-col gap-1 text-sm font-medium">Add manuals (PDF, {e.manuals.length} of {MAX_EQUIPMENT_MANUALS} used)
                              <input type="file" name="manual" accept="application/pdf,.pdf" multiple className={field} />
                            </label>
                            {e.manuals.length > 0 && (
                              <fieldset className="flex flex-col">
                                <legend className="text-sm font-medium">Tick any manual to remove it when you save</legend>
                                {e.manuals.map((m) => (
                                  <label key={m.id} className="flex min-h-11 items-center gap-2 text-sm">
                                    <input type="checkbox" name="remove_manual" value={m.id} className="h-5 w-5 accent-brand-text" /> Remove {m.name}
                                  </label>
                                ))}
                              </fieldset>
                            )}
                            <label className="flex flex-col gap-1 text-sm font-medium">Add pictures ({e.images.length} of {MAX_EQUIPMENT_IMAGES} used, JPEG, PNG or WebP)
                              <input type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple className={field} />
                            </label>
                            {e.images.length > 0 && (
                              <fieldset className="flex flex-col gap-2">
                                <legend className="text-sm font-medium">Tick any picture to remove it when you save</legend>
                                <ul className="flex flex-wrap gap-3">
                                  {e.images.map((im, n) => (
                                    <li key={im.id} className="flex flex-col gap-1">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={`/equipment/photo/${im.id}?size=thumb`} alt="" loading="lazy" decoding="async" className="h-20 w-28 rounded border border-line object-cover" />
                                      <label className="flex min-h-11 items-center gap-2 text-sm">
                                        <input type="checkbox" name="remove_image" value={im.id} className="h-5 w-5 accent-brand-text" /> Remove picture {n + 1}
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                              </fieldset>
                            )}
                            <button className={primary}>Save changes</button>
                          </form>
                        </details>
                        <form action={setEquipmentActive.bind(null, e.id, !e.active)}>
                          <button className={small}>{e.active ? "Deactivate" : "Reactivate"}<span className="sr-only"> {e.name}</span></button>
                        </form>
                        <details className="rounded border border-danger">
                          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-danger">Delete equipment<span className="sr-only"> {e.name}</span></summary>
                          <form action={deleteEquipment.bind(null, e.id)} className="flex flex-col gap-3 border-t border-line p-3">
                            <p className="text-sm">
                              This permanently deletes <strong>{e.name}</strong>, its pictures and its manuals
                              {e.check_count > 0 ? <>, and its <strong>{e.check_count} past {e.check_count === 1 ? "check" : "checks"}</strong> with their photos</> : ""}. It cannot be undone.
                              {e.active && " To hide it but keep its history, use Deactivate instead."}
                            </p>
                            <label className="flex min-h-11 items-center gap-2 text-sm">
                              <input type="checkbox" name="confirm_delete" required className="h-5 w-5 accent-brand-text" /> Yes, permanently delete {e.name}
                            </label>
                            <button className="self-start rounded border border-danger bg-white px-4 py-2 text-sm font-medium text-danger hover:bg-surface">Delete permanently</button>
                          </form>
                        </details>
                      </div>
                    )}
                    </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      {isAdmin && <p className="text-sm text-ink-muted">Deactivating equipment hides it from the check form and monthly reminders. Its past checks are kept. Deleting removes it for good, with its checks.</p>}
    </>
  );
}
