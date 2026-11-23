import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { addDays, isYmd } from "@/lib/dates";
import { EXT, MAX_ZIP_BYTES, MAX_ZIP_IMAGES, slug } from "@/lib/job-images-shared";
import { readStoredFile } from "@/lib/storage";
import { zipStream } from "@/lib/zip";

export const dynamic = "force-dynamic";

// A ZIP of one week's images, or of one job folder in that week (?ref=1234; an empty ?ref= means "no job reference").
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return new Response("Not found", { status: 404 });

  const q = new URL(req.url).searchParams;
  const from = q.get("week");
  if (!isYmd(from)) return new Response("Choose a week to download.", { status: 400 });
  const to = addDays(from, 6);
  const byRef = q.has("ref");
  const ref = (q.get("ref") ?? "").slice(0, 60);

  const { rows } = await db().query<{ id: string; storage_key: string; content_type: string; job_date: string; job_ref: string; size_bytes: number; uploaded_at: Date }>(
    `SELECT id, storage_key, content_type, job_date, job_ref, size_bytes, uploaded_at
       FROM job_images
      WHERE job_date BETWEEN $1::date AND $2::date AND ($3::boolean = false OR job_ref = $4)
      ORDER BY job_date, job_ref, uploaded_at`,
    [from, to, byRef, ref]
  );
  if (rows.length === 0) return new Response("There are no images to download.", { status: 404 });
  if (rows.length > MAX_ZIP_IMAGES || rows.reduce((n, r) => n + Number(r.size_bytes), 0) > MAX_ZIP_BYTES) {
    return new Response(`That is too many images for one ZIP (the limit is ${MAX_ZIP_IMAGES} images). Download a single job folder, or download images one at a time.`, { status: 413 });
  }

  const sources = rows.map((r, i) => ({
    name: `${String(r.job_date)}-${slug(r.job_ref, 30) || "no-reference"}-${String(i + 1).padStart(3, "0")}.${EXT[r.content_type] ?? "jpg"}`,
    modified: new Date(r.uploaded_at),
    read: async () => new Uint8Array(await readStoredFile(r.storage_key)),
  }));
  const label = byRef ? slug(ref, 30) || "no-reference" : "all-jobs";
  return new Response(zipStream(sources), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="job-images-${from}-${label}.zip"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
