import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { kindLabel } from "@/lib/policies-shared";

type Row = {
  id: string;
  version_number: number;
  is_current: boolean;
  size_bytes: number;
  note: string;
  uploaded_at: Date;
  uploaded_by_name: string | null;
  title: string;
  kind: string;
  archived_at: Date | null;
};

const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Europe/London" }).format(d);
const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const button = "rounded border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-brand-soft";

/** Reads one document in the browser's built-in PDF viewer, with plain links as a fallback. */
export default async function PolicyViewerPage({ params, searchParams }: { params: { id: string }; searchParams: { version?: string } }) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();

  // The archived filter is in the query: staff get nothing back for an archived document.
  const { rows } = await db().query<Row>(
    `SELECT v.id, v.version_number, v.is_current, v.size_bytes, v.note, v.uploaded_at, u.name AS uploaded_by_name,
            d.title, d.kind, d.archived_at
       FROM policy_versions v
       JOIN policy_documents d ON d.id = v.document_id
       LEFT JOIN users u ON u.id = v.uploaded_by
      WHERE d.id = $1 AND ($2::boolean OR d.archived_at IS NULL)
      ORDER BY v.version_number DESC`,
    [params.id, isAdmin]
  );
  if (rows.length === 0) notFound();

  const wanted = Number(searchParams.version);
  const shown = rows.find((r) => r.version_number === wanted) ?? rows.find((r) => r.is_current) ?? rows[0];
  const doc = rows[0];
  const src = `/policies/file/${shown.id}`;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/policies" className="self-start text-sm text-brand-text underline">Back to Policies and Handbooks</Link>

      <div>
        <p className="text-sm font-semibold text-ink-muted">{kindLabel(doc.kind).toUpperCase()}</p>
        <h1 className="text-2xl font-semibold">{doc.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded px-2 py-0.5 text-xs font-bold ${shown.is_current ? "bg-brand text-brand-ink" : "border border-line text-ink-muted"}`}>
            {shown.is_current ? "CURRENT VERSION" : "OLDER VERSION"}
          </span>
          <span>
            Version {shown.version_number}, uploaded {fmtDate(shown.uploaded_at)}
            {shown.uploaded_by_name ? ` by ${shown.uploaded_by_name}` : ""} ({fmtSize(shown.size_bytes)})
          </span>
          {doc.archived_at && <span className="rounded border border-line px-2 py-0.5 text-xs font-semibold text-ink-muted">ARCHIVED {fmtDate(doc.archived_at)}</span>}
        </p>
        {shown.note && <p className="mt-1 text-sm">{shown.note}</p>}
        {!shown.is_current && (
          <p role="status" className="mt-2 rounded border border-line bg-surface-raised p-3 text-sm">
            This is an older version, kept for reference. <Link href={`/policies/${doc.id}`} className="text-brand-text underline">Read the current version instead</Link>.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={src} target="_blank" rel="noopener noreferrer" className="rounded bg-header px-4 py-2 text-sm font-medium text-header-ink hover:opacity-90">
          Open full screen<span className="sr-only"> (opens in a new tab)</span>
        </a>
        <a href={`${src}?download=1`} className={button}>Download PDF</a>
      </div>

      {/* The browser's own PDF viewer. Some phones only show the first page here, hence the links above. */}
      <iframe
        title={`${doc.title}, version ${shown.version_number}`}
        src={src}
        className="h-[75vh] min-h-[420px] w-full rounded border border-line bg-white"
      />
      <p className="text-sm text-ink-muted">
        Can&apos;t see the document, or only the first page? Use <strong>Open full screen</strong> or <strong>Download PDF</strong> above.
      </p>

      {rows.length > 1 && (
        <section aria-labelledby="versions" className="rounded-lg border border-line bg-surface-raised p-4">
          <h2 id="versions" className="font-semibold">All versions</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${r.is_current ? "bg-brand text-brand-ink" : "border border-line text-ink-muted"}`}>
                  {r.is_current ? "Current" : "Superseded"}
                </span>
                <span>Version {r.version_number}, uploaded {fmtDate(r.uploaded_at)}</span>
                {r.id === shown.id ? (
                  <span className="font-medium">Showing now</span>
                ) : (
                  <Link href={`/policies/${doc.id}?version=${r.version_number}`} className="text-brand-text underline">
                    Read<span className="sr-only"> version {r.version_number}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
