import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { addDays, fmtShort, isYmd, startOfWeek, todayLondon } from "@/lib/dates";
import { folderLabel, fmtSize, MAX_FILES_PER_UPLOAD, MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES, MAX_ZIP_BYTES, MAX_ZIP_IMAGES } from "@/lib/job-images-shared";
import { storageConfigured } from "@/lib/storage";
import { uploadImages } from "./actions";

type Img = {
  id: string;
  job_date: string;
  job_ref: string;
  description: string;
  operator_notes: string;
  original_filename: string;
  size_bytes: number;
  uploaded_at: Date;
  uploaded_by_name: string | null;
};

const LIMIT = 500;

const ERRORS: Record<string, string> = {
  storage: "File storage is not set up yet, so nothing can be uploaded. Ask an administrator to set FILES_DIR to a Railway Volume (see the README).",
  nofile: "Choose at least one image to upload.",
  toomany: `You can upload up to ${MAX_FILES_PER_UPLOAD} images at a time.`,
  toobig: `One of the images is too large. The limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB per image.`,
  toobigtotal: `Those images are too large together. The limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB per upload: upload them in smaller batches.`,
  notimage: "One of the files is not a usable JPEG, PNG or WebP image. Nothing was uploaded.",
  date: "Choose the job date. It cannot be in the future.",
  missing: "That image no longer exists.",
};

const fmtWeek = (monday: string) => `Week of ${new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${monday}T00:00:00Z`)).replace(",", "")}`;

const btn = "rounded border border-line bg-white px-3 py-2 text-sm font-medium hover:bg-brand-soft";
const input = "rounded border border-line bg-white px-3 py-2 font-normal";

export default async function JobImagesPage({ searchParams }: { searchParams: { week?: string; view?: string; q?: string; error?: string; done?: string; n?: string } }) {
  await requireUser(); // everyone who is signed in can see job images
  const today = todayLondon();
  const view = searchParams.view === "list" ? "list" : "folders";
  const q = (searchParams.q ?? "").trim().slice(0, 100);
  const week = startOfWeek(isYmd(searchParams.week) ? searchParams.week : today);
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;
  const n = Math.min(Number(searchParams.n) || 0, MAX_FILES_PER_UPLOAD);
  const done =
    searchParams.done === "uploaded" ? (n === 1 ? "Image uploaded." : n > 1 ? `${n} images uploaded.` : "Images uploaded.")
    : searchParams.done === "deleted" ? "Image deleted."
    : undefined;

  // Searching looks across every week; otherwise one week is shown at a time.
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { rows } = await db().query<Img>(
    q
      ? `SELECT i.id, i.job_date, i.job_ref, i.description, i.operator_notes, i.original_filename, i.size_bytes, i.uploaded_at, u.name AS uploaded_by_name
           FROM job_images i LEFT JOIN users u ON u.id = i.uploaded_by
          WHERE i.job_ref ILIKE $1 OR i.description ILIKE $1 OR i.operator_notes ILIKE $1 OR u.name ILIKE $1
          ORDER BY i.job_date DESC, i.job_ref, i.uploaded_at LIMIT ${LIMIT + 1}`
      : `SELECT i.id, i.job_date, i.job_ref, i.description, i.operator_notes, i.original_filename, i.size_bytes, i.uploaded_at, u.name AS uploaded_by_name
           FROM job_images i LEFT JOIN users u ON u.id = i.uploaded_by
          WHERE i.job_date BETWEEN $1::date AND $2::date
          ORDER BY i.job_ref, i.job_date, i.uploaded_at LIMIT ${LIMIT + 1}`,
    q ? [like] : [week, addDays(week, 6)]
  );
  const truncated = rows.length > LIMIT;
  const images = truncated ? rows.slice(0, LIMIT) : rows;

  // Group by week, then by job reference ("folders"). No reference sorts last.
  const weeks = new Map<string, Map<string, Img[]>>();
  for (const img of images) {
    const w = startOfWeek(img.job_date);
    const folders = weeks.get(w) ?? new Map<string, Img[]>();
    folders.set(img.job_ref, [...(folders.get(img.job_ref) ?? []), img]);
    weeks.set(w, folders);
  }
  const weekKeys = [...weeks.keys()].sort().reverse();

  const link = (o: { week?: string; view?: string; q?: string }) => {
    const p = new URLSearchParams();
    const w = o.week ?? (q ? "" : week);
    if (w) p.set("week", w);
    if ((o.view ?? view) === "list") p.set("view", "list");
    const qq = o.q ?? q;
    if (qq) p.set("q", qq);
    const s = p.toString();
    return `/job-images${s ? `?${s}` : ""}`;
  };
  const zipOk = (list: Img[]) => list.length <= MAX_ZIP_IMAGES && list.reduce((s, i) => s + Number(i.size_bytes), 0) <= MAX_ZIP_BYTES;

  const canUpload = storageConfigured();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Job Images</h1>
      <p className="text-ink-muted">
        Photos from jobs, grouped by the week of the job. Everyone can see and download them, and you can add your own.
      </p>

      {error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{error}</p>}
      {done && <p role="status" className="rounded border border-brand bg-brand-soft p-3 text-sm">{done}</p>}

      <details className="rounded-lg border border-line bg-surface-raised p-4" open={Boolean(error && searchParams.error !== "missing")}>
        <summary className="cursor-pointer font-semibold">Add images</summary>
        {canUpload ? (
          <form action={uploadImages} className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">Images (JPEG, PNG or WebP; up to {MAX_FILES_PER_UPLOAD} at a time, {MAX_IMAGE_BYTES / 1024 / 1024} MB each)
              <input name="files" type="file" accept="image/jpeg,image/png,image/webp" multiple required className={input} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-medium">Job date
                <input name="job_date" type="date" required defaultValue={today} max={today} className={input} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">Job number or reference (optional)
                <input name="job_ref" maxLength={60} className={input} />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium">Job description (optional)
              <input name="description" maxLength={500} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Operator notes (optional)
              <textarea name="operator_notes" rows={3} maxLength={1000} className={input} />
            </label>
            <p className="text-sm text-ink-muted">The date, reference, description and notes apply to all the images in this upload. You can change them for each image afterwards.</p>
            <button className="self-start rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark">Upload images</button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-danger">{ERRORS.storage}</p>
        )}
      </details>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
        {!q && (
          <div className="flex flex-wrap items-center gap-2">
            <Link className={btn} href={link({ week: addDays(week, -7) })} aria-label="Previous week">Previous</Link>
            <Link className={btn} href={link({ week: startOfWeek(today) })}>This week</Link>
            <Link className={btn} href={link({ week: addDays(week, 7) })} aria-label="Next week">Next</Link>
            <h2 className="ml-1 font-semibold">{fmtWeek(week)}</h2>
          </div>
        )}
        {q && <h2 className="font-semibold">Search results for &ldquo;{q}&rdquo; (all weeks)</h2>}

        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <form action="/job-images" className="flex flex-wrap items-end gap-2">
            {view === "list" && <input type="hidden" name="view" value="list" />}
            <label className="flex flex-col gap-1 text-sm font-medium">Go to the week containing
              <input name="week" type="date" defaultValue={q ? today : week} className={input} />
            </label>
            <button className={btn}>Go</button>
          </form>
          <form action="/job-images" className="flex flex-wrap items-end gap-2">
            {view === "list" && <input type="hidden" name="view" value="list" />}
            <label className="flex flex-col gap-1 text-sm font-medium">Search all weeks
              <input name="q" defaultValue={q} placeholder="Job number, description, notes, name" maxLength={100} className={`${input} w-64 max-w-full`} />
            </label>
            <button className={btn}>Search</button>
            {q && <Link className={btn} href={link({ q: "", week })}>Clear search</Link>}
          </form>
          <nav aria-label="Layout" className="flex gap-2">
            <Link className={`${btn} ${view === "folders" ? "border-brand font-semibold" : ""}`} href={link({ view: "folders" })} aria-current={view === "folders" ? "page" : undefined}>Folders</Link>
            <Link className={`${btn} ${view === "list" ? "border-brand font-semibold" : ""}`} href={link({ view: "list" })} aria-current={view === "list" ? "page" : undefined}>List</Link>
          </nav>
        </div>
      </div>

      {truncated && <p role="status" className="rounded border border-line bg-surface-raised p-3 text-sm">Showing the first {LIMIT} images. Narrow the search or choose a different week to see the rest.</p>}

      {images.length === 0 ? (
        <p className="text-ink-muted">{q ? "No images match that search." : "No images were added for this week."}</p>
      ) : (
        weekKeys.map((w) => {
          const folders = weeks.get(w)!;
          const refs = [...folders.keys()].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "en", { numeric: true })));
          const all = refs.flatMap((r) => folders.get(r)!);
          return (
            <section key={w} aria-labelledby={`w-${w}`} className="flex flex-col gap-4">
              {(q || view === "list") && (
                <div className="flex flex-wrap items-center gap-3">
                  <h2 id={`w-${w}`} className="text-lg font-semibold">{fmtWeek(w)}</h2>
                  <span className="text-sm text-ink-muted">{all.length} {all.length === 1 ? "image" : "images"}</span>
                  {zipOk(all) && <a className={btn} href={`/job-images/zip?week=${w}`}>Download week (ZIP)</a>}
                </div>
              )}
              {!q && view === "folders" && (
                <div className="flex flex-wrap items-center gap-3">
                  <h2 id={`w-${w}`} className="sr-only">{fmtWeek(w)}</h2>
                  <span className="text-sm text-ink-muted">{all.length} {all.length === 1 ? "image" : "images"} in {refs.length} {refs.length === 1 ? "folder" : "folders"}</span>
                  {zipOk(all) && <a className={btn} href={`/job-images/zip?week=${w}`}>Download whole week (ZIP)</a>}
                </div>
              )}

              {view === "folders" ? (
                refs.map((ref) => {
                  const list = folders.get(ref)!;
                  const descriptions = [...new Set(list.map((i) => i.description).filter(Boolean))];
                  return (
                    <div key={ref} className="rounded-lg border border-line bg-surface-raised p-4">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h3 className="text-base font-semibold">{folderLabel(ref)}</h3>
                        <span className="text-sm text-ink-muted">{list.length} {list.length === 1 ? "image" : "images"}</span>
                        {zipOk(list) && <a className="text-sm text-brand-text underline" href={`/job-images/zip?week=${startOfWeek(list[0].job_date)}&ref=${encodeURIComponent(ref)}`}>Download folder (ZIP)<span className="sr-only">: {folderLabel(ref)}</span></a>}
                      </div>
                      {descriptions.length > 0 && <p className="mt-1 text-sm">{descriptions.join(" / ")}</p>}
                      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {list.map((i) => (
                          <li key={i.id} className="flex flex-col gap-1">
                            <Link href={`/job-images/${i.id}`} className="block overflow-hidden rounded border border-line bg-white">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/job-images/file/${i.id}?size=thumb`}
                                alt={`${folderLabel(i.job_ref)}, ${fmtShort(i.job_date)}${i.description ? `: ${i.description}` : ""}`}
                                loading="lazy"
                                decoding="async"
                                className="aspect-[4/3] w-full object-cover"
                              />
                            </Link>
                            <p className="text-xs text-ink-muted">{fmtShort(i.job_date)}{i.uploaded_by_name ? `, ${i.uploaded_by_name}` : ""}</p>
                            {i.operator_notes && <p className="line-clamp-2 text-xs">{i.operator_notes}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })
              ) : (
                <div className="relative overflow-x-auto rounded-lg border border-line bg-surface-raised">
                  <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
                    <caption className="sr-only">Job images for {fmtWeek(w)}</caption>
                    <thead>
                      <tr className="border-b border-line bg-brand-soft">
                        <th scope="col" className="p-2">Image</th>
                        <th scope="col" className="p-2">Job</th>
                        <th scope="col" className="p-2">Description</th>
                        <th scope="col" className="p-2">Operator notes</th>
                        <th scope="col" className="p-2">Date</th>
                        <th scope="col" className="p-2">Added by</th>
                        <th scope="col" className="p-2">Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {refs.flatMap((r) => folders.get(r)!).map((i) => (
                        <tr key={i.id} className="border-b border-line align-top last:border-0">
                          <td className="p-2">
                            <Link href={`/job-images/${i.id}`} className="block w-20">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`/job-images/file/${i.id}?size=thumb`} alt={`${folderLabel(i.job_ref)}, ${fmtShort(i.job_date)}: open image`} loading="lazy" decoding="async" className="aspect-[4/3] w-20 rounded border border-line object-cover" />
                            </Link>
                          </td>
                          <td className="p-2 font-medium">{folderLabel(i.job_ref)}</td>
                          <td className="p-2">{i.description || <span className="text-ink-muted">None</span>}</td>
                          <td className="p-2">{i.operator_notes || <span className="text-ink-muted">None</span>}</td>
                          <td className="whitespace-nowrap p-2">{fmtShort(i.job_date)}</td>
                          <td className="p-2">{i.uploaded_by_name ?? <span className="text-ink-muted">Unknown</span>}</td>
                          <td className="whitespace-nowrap p-2">
                            <a className="text-brand-text underline" href={`/job-images/file/${i.id}?download=1`}>Download<span className="sr-only"> image: {folderLabel(i.job_ref)}, {fmtShort(i.job_date)}</span></a>
                            <span className="block text-xs text-ink-muted">{fmtSize(i.size_bytes)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
