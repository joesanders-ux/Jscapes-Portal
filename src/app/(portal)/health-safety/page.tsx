import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { MAX_PDF_BYTES, storageConfigured } from "@/lib/storage";
import { addDocument, addVersion } from "./actions";

type Version = {
  id: string;
  document_id: string;
  title: string;
  version_number: number;
  is_current: boolean;
  original_filename: string;
  size_bytes: number;
  note: string;
  uploaded_at: Date;
  uploaded_by_name: string | null;
};

const ERRORS: Record<string, string> = {
  storage: "File storage is not set up yet, so nothing can be uploaded. Set FILES_DIR to a Railway Volume (see the README).",
  title: "Enter a title for the document.",
  nofile: "Choose a PDF file to upload.",
  toobig: `That file is too large. The limit is ${MAX_PDF_BYTES / 1024 / 1024} MB.`,
  notpdf: "That file is not a PDF. Only PDF files can be uploaded.",
  missing: "That document no longer exists.",
};
const DONE: Record<string, string> = {
  added: "Document uploaded. Staff can see it now.",
  version: "New version uploaded. It is now the current version, and the old one is kept under previous versions.",
};

const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(d);
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default async function HealthSafetyPage({ searchParams }: { searchParams: { error?: string; done?: string } }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const done = searchParams.done ? DONE[searchParams.done] : undefined;

  const { rows } = await db().query<Version>(
    `SELECT v.id, v.document_id, d.title, v.version_number, v.is_current, v.original_filename, v.size_bytes, v.note, v.uploaded_at,
            u.name AS uploaded_by_name
       FROM health_safety_versions v
       JOIN health_safety_documents d ON d.id = v.document_id
       LEFT JOIN users u ON u.id = v.uploaded_by
      ORDER BY d.title, v.version_number DESC`
  );

  // Group versions by document: the current one first, the rest as previous versions.
  const docs = new Map<string, { id: string; title: string; current?: Version; previous: Version[] }>();
  for (const v of rows) {
    const d = docs.get(v.document_id) ?? { id: v.document_id, title: v.title, previous: [] };
    if (v.is_current) d.current = v;
    else d.previous.push(v);
    docs.set(v.document_id, d);
  }
  const list = [...docs.values()];
  const canUpload = isAdmin && storageConfigured();
  const input = "rounded border border-line bg-white px-3 py-2 font-normal";
  const primary = "self-start rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Health and Safety</h1>
      <p className="text-ink-muted">
        Read the current version of each document. Older versions are kept for reference.
      </p>

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
          <label className="flex flex-col gap-1 text-sm font-medium">PDF file (up to {MAX_PDF_BYTES / 1024 / 1024} MB)
            <input name="file" type="file" accept="application/pdf,.pdf" required className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Note for staff (optional)
            <input name="note" maxLength={500} className={input} />
          </label>
          <button className={primary}>Upload document</button>
        </form>
      )}

      {list.length === 0 ? (
        <p className="text-ink-muted">No documents have been added yet.{isAdmin ? " Add the first one above." : ""}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {list.map((d) => (
            <li key={d.id} className="rounded-lg border border-line bg-surface-raised p-4">
              <h2 className="text-lg font-semibold">{d.title}</h2>

              {d.current && (
                <div className="mt-2 rounded border border-brand bg-brand-soft p-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-brand px-2 py-0.5 text-xs font-bold text-brand-ink">CURRENT VERSION</span>
                    <span className="text-sm">Version {d.current.version_number}, uploaded {fmtDate(d.current.uploaded_at)}{d.current.uploaded_by_name ? ` by ${d.current.uploaded_by_name}` : ""} ({fmtSize(d.current.size_bytes)})</span>
                  </p>
                  {d.current.note && <p className="mt-1 text-sm">{d.current.note}</p>}
                  <a
                    href={`/health-safety/file/${d.current.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block rounded bg-header px-4 py-2 text-sm font-medium text-header-ink hover:opacity-90"
                  >
                    Open PDF<span className="sr-only"> (opens in a new tab): {d.title}</span>
                  </a>
                </div>
              )}

              {d.previous.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">Previous versions ({d.previous.length})</summary>
                  <ul className="mt-2 flex flex-col gap-2">
                    {d.previous.map((v) => (
                      <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="rounded border border-line px-2 py-0.5 text-xs font-semibold text-ink-muted">Superseded</span>
                        <span>Version {v.version_number}, uploaded {fmtDate(v.uploaded_at)}</span>
                        <a href={`/health-safety/file/${v.id}`} target="_blank" rel="noopener noreferrer" className="text-brand-text underline">
                          Open<span className="sr-only"> version {v.version_number} of {d.title} (opens in a new tab)</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {canUpload && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">Upload a new version</summary>
                  <form action={addVersion.bind(null, d.id)} className="mt-3 flex flex-col gap-3">
                    <p className="text-sm text-ink-muted">The new file becomes the current version. The existing one is kept under previous versions.</p>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
