import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtLong, startOfWeek, todayLondon } from "@/lib/dates";
import { folderLabel, fmtSize } from "@/lib/job-images-shared";
import { deleteImage, updateImage } from "../actions";

type Row = {
  id: string;
  job_date: string;
  job_ref: string;
  description: string;
  operator_notes: string;
  original_filename: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  uploaded_by: string | null;
  uploaded_at: Date;
  uploaded_by_name: string | null;
};

const ERRORS: Record<string, string> = {
  forbidden: "Only the person who added an image, or an administrator, can change or delete it.",
  date: "Choose the job date. It cannot be in the future.",
};

const input = "rounded border border-line bg-white px-3 py-2 font-normal";
const fmtDateTime = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(d);

export default async function JobImagePage({ params, searchParams }: { params: { id: string }; searchParams: { error?: string; done?: string } }) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const { rows } = await db().query<Row>(
    `SELECT i.id, i.job_date, i.job_ref, i.description, i.operator_notes, i.original_filename, i.size_bytes, i.width, i.height,
            i.uploaded_by, i.uploaded_at, u.name AS uploaded_by_name
       FROM job_images i LEFT JOIN users u ON u.id = i.uploaded_by WHERE i.id = $1`,
    [params.id]
  );
  const img = rows[0];
  if (!img) notFound();

  const canEdit = user.role === "admin" || img.uploaded_by === user.id;
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const today = todayLondon();
  const file = `/job-images/file/${img.id}`;

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/job-images?week=${startOfWeek(img.job_date)}`} className="self-start text-sm text-brand-text underline">Back to Job Images</Link>
      <h1 className="text-2xl font-semibold">{folderLabel(img.job_ref)}</h1>

      {error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{error}</p>}
      {searchParams.done === "saved" && <p role="status" className="rounded border border-brand bg-brand-soft p-3 text-sm">Changes saved.</p>}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={file}
        alt={`${folderLabel(img.job_ref)}, ${fmtLong(img.job_date)}${img.description ? `: ${img.description}` : ""}`}
        width={img.width ?? undefined}
        height={img.height ?? undefined}
        className="h-auto max-h-[80vh] w-auto max-w-full self-start rounded border border-line bg-white"
      />

      <div className="flex flex-wrap gap-2">
        <a href={`${file}?download=1`} className="rounded bg-header px-4 py-2 text-sm font-medium text-header-ink hover:opacity-90">Download image</a>
        <a href={file} target="_blank" rel="noopener noreferrer" className="rounded border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-brand-soft">
          Open full size<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>

      <dl className="grid gap-x-6 gap-y-2 rounded-lg border border-line bg-surface-raised p-4 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="font-semibold">Job date</dt><dd>{fmtLong(img.job_date)}</dd>
        <dt className="font-semibold">Job reference</dt><dd>{img.job_ref || <span className="text-ink-muted">None</span>}</dd>
        <dt className="font-semibold">Job description</dt><dd className="whitespace-pre-line">{img.description || <span className="text-ink-muted">None</span>}</dd>
        <dt className="font-semibold">Operator notes</dt><dd className="whitespace-pre-line">{img.operator_notes || <span className="text-ink-muted">None</span>}</dd>
        <dt className="font-semibold">Added by</dt><dd>{img.uploaded_by_name ?? "Unknown"}, {fmtDateTime(img.uploaded_at)}</dd>
        <dt className="font-semibold">File</dt><dd>{img.original_filename} ({fmtSize(img.size_bytes)}{img.width && img.height ? `, ${img.width} x ${img.height}` : ""})</dd>
      </dl>

      {canEdit && (
        <>
          <details className="rounded-lg border border-line bg-surface-raised p-4" open={searchParams.error === "date"}>
            <summary className="cursor-pointer font-semibold">Edit details</summary>
            <form action={updateImage.bind(null, img.id)} className="mt-3 flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-medium">Job date
                  <input name="job_date" type="date" required defaultValue={img.job_date} max={today} className={input} />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">Job number or reference
                  <input name="job_ref" maxLength={60} defaultValue={img.job_ref} className={input} />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm font-medium">Job description
                <input name="description" maxLength={500} defaultValue={img.description} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">Operator notes
                <textarea name="operator_notes" rows={3} maxLength={1000} defaultValue={img.operator_notes} className={input} />
              </label>
              <button className="self-start rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark">Save changes</button>
            </form>
          </details>

          <details className="rounded-lg border border-line bg-surface-raised p-4">
            <summary className="cursor-pointer font-semibold">Delete this image</summary>
            <form action={deleteImage.bind(null, img.id)} className="mt-3 flex flex-col gap-3">
              <p className="text-sm">This permanently removes the image and its file. It cannot be undone.</p>
              <button className="self-start rounded border border-danger bg-white px-4 py-2 text-sm font-medium text-danger hover:bg-surface">Delete image permanently</button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
