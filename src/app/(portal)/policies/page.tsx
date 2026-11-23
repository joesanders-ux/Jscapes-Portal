import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { KINDS, kindLabel } from "@/lib/policies-shared";
import { MAX_PDF_BYTES, storageConfigured } from "@/lib/storage";
import { addDocument, addVersion, archiveDocument, restoreDocument } from "./actions";

type Doc = {
  id: string;
  title: string;
  kind: string;
  archived_at: Date | null;
  version_number: number;
  size_bytes: number;
  note: string;
  uploaded_at: Date;
  uploaded_by_name: string | null;
  versions: number;
};

const ERRORS: Record<string, string> = {
  storage: "File storage is not set up yet, so nothing can be uploaded. Set FILES_DIR to a Railway Volume (see the README).",
  title: "Enter a title for the document.",
  kind: "Choose whether this is a policy or a handbook.",
  nofile: "Choose a PDF file to upload.",
  toobig: `That file is too large. The limit is ${MAX_PDF_BYTES / 1024 / 1024} MB.`,
  notpdf: "That file is not a PDF. Only PDF files can be uploaded.",
  missing: "That document no longer exists, or it was already changed.",
  archived: "That document is archived. Restore it before uploading a new version.",
};
const DONE: Record<string, string> = {
  added: "Document uploaded. Staff can read it now.",
  version: "New version uploaded. It is now the current version, and the old one is kept under all versions.",
  archived: "Document archived. Staff can no longer see it. Nothing was deleted, and you can restore it under Archived documents.",
  restored: "Document restored. Staff can see it again.",
};

const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(d);
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const input = "rounded border border-line bg-white px-3 py-2 font-normal";
const primary = "self-start rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark";
const small = "rounded border border-line px-3 py-1.5 text-sm hover:bg-brand-soft";

function DocCard({ d, canUpload, isAdmin }: { d: Doc; canUpload: boolean; isAdmin: boolean }) {
  const archived = d.archived_at !== null;
  return (
    <li className={`rounded-lg border border-line p-4 ${archived ? "bg-surface" : "bg-surface-raised"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">{d.title}</h3>
        <span className="rounded border border-line px-2 py-0.5 text-xs font-semibold text-ink-muted">{kindLabel(d.kind).toUpperCase()}</span>
        {archived && <span className="rounded border border-line px-2 py-0.5 text-xs font-semibold text-ink-muted">ARCHIVED {fmtDate(d.archived_at!)}</span>}
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Version {d.version_number}, uploaded {fmtDate(d.uploaded_at)}
        {d.uploaded_by_name ? ` by ${d.uploaded_by_name}` : ""} ({fmtSize(d.size_bytes)})
        {d.versions > 1 ? `. ${d.versions - 1} older ${d.versions === 2 ? "version" : "versions"} kept` : ""}
      </p>
      {d.note && <p className="mt-1 text-sm">{d.note}</p>}
      <Link href={`/policies/${d.id}`} className="mt-3 inline-block rounded bg-header px-4 py-2 text-sm font-medium text-header-ink hover:opacity-90">
        Read<span className="sr-only"> {d.title}</span>
      </Link>

      {canUpload && !archived && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">Upload a new version</summary>
          <form action={addVersion.bind(null, d.id)} className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-ink-muted">The new file becomes the current version. The existing one is kept, and staff can still open it as an older version.</p>
            <label className="flex flex-col gap-1 text-sm font-medium">PDF file
              <input name="file" type="file" accept="application/pdf,.pdf" required className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">What changed (optional)
              <input name="note" maxLength={500} className={input} />
            </label>
            <button className={primary}>Upload new version</button>
          </form>
        </details>
      )}

      {isAdmin && (
        <form action={(archived ? restoreDocument : archiveDocument).bind(null, d.id)} className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <button className={small}>{archived ? "Restore document" : "Archive document"}</button>
          <span className="text-sm text-ink-muted">
            {archived ? "Staff will be able to see it again." : "Hides it from staff. Nothing is deleted, and you can restore it later."}
          </span>
        </form>
      )}
    </li>
  );
}

export default async function PoliciesPage({ searchParams }: { searchParams: { error?: string; done?: string } }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const done = searchParams.done ? DONE[searchParams.done] : undefined;

  // One row per document, showing its current version. Staff never receive archived documents:
  // the filter is in the query, not just the page.
  const { rows } = await db().query<Doc>(
    `SELECT d.id, d.title, d.kind, d.archived_at, v.version_number, v.size_bytes, v.note, v.uploaded_at,
            u.name AS uploaded_by_name,
            (SELECT count(*)::int FROM policy_versions x WHERE x.document_id = d.id) AS versions
       FROM policy_documents d
       JOIN policy_versions v ON v.document_id = d.id AND v.is_current
       LEFT JOIN users u ON u.id = v.uploaded_by
      WHERE ($1::boolean OR d.archived_at IS NULL)
      ORDER BY lower(d.title)`,
    [isAdmin]
  );
  const active = rows.filter((d) => d.archived_at === null);
  const archived = rows.filter((d) => d.archived_at !== null);
  const canUpload = isAdmin && storageConfigured();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Policies and Handbooks</h1>
      <p className="text-ink-muted">Read the current version of each policy and handbook here in the portal. Older versions are kept for reference.</p>

      {error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{error}</p>}
      {done && <p role="status" className="rounded border border-brand bg-brand-soft p-3 text-sm">{done}</p>}
      {isAdmin && !storageConfigured() && !error && (
        <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{ERRORS.storage}</p>
      )}

      {canUpload && (
        <form action={addDocument} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
          <h2 className="font-semibold">Add a document</h2>
          <label className="flex flex-col gap-1 text-sm font-medium">Title
            <input name="title" required maxLength={150} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Type
            <select name="kind" defaultValue="policy" className={input}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">PDF file (up to {MAX_PDF_BYTES / 1024 / 1024} MB)
            <input name="file" type="file" accept="application/pdf,.pdf" required className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Note for staff (optional)
            <input name="note" maxLength={500} className={input} />
          </label>
          <button className={primary}>Upload document</button>
        </form>
      )}

      {active.length === 0 ? (
        <p className="text-ink-muted">No policies or handbooks have been added yet.{isAdmin ? " Add the first one above." : ""}</p>
      ) : (
        KINDS.map((k) => {
          const group = active.filter((d) => d.kind === k.value);
          if (group.length === 0) return null;
          return (
            <section key={k.value} aria-labelledby={`g-${k.value}`} className="flex flex-col gap-3">
              <h2 id={`g-${k.value}`} className="text-lg font-semibold">{k.plural}</h2>
              <ul className="flex flex-col gap-4">
                {group.map((d) => <DocCard key={d.id} d={d} canUpload={canUpload} isAdmin={isAdmin} />)}
              </ul>
            </section>
          );
        })
      )}

      {isAdmin && archived.length > 0 && (
        <details className="rounded-lg border border-line bg-surface-raised p-4">
          <summary className="cursor-pointer font-semibold">Archived documents ({archived.length})</summary>
          <p className="mt-2 text-sm text-ink-muted">Only admins can see these. Staff cannot open them, even with an old link.</p>
          <ul className="mt-3 flex flex-col gap-4">
            {archived.map((d) => <DocCard key={d.id} d={d} canUpload={canUpload} isAdmin={isAdmin} />)}
          </ul>
        </details>
      )}
    </div>
  );
}
