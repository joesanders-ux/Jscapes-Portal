"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isYmd, startOfWeek, todayLondon } from "@/lib/dates";
import { processImage, type ProcessedImage } from "@/lib/job-images";
import { EXT, MAX_FILES_PER_UPLOAD, MAX_UPLOAD_BYTES } from "@/lib/job-images-shared";
import { deleteFile, saveFile, storageConfigured } from "@/lib/storage";

const PAGE = "/job-images";
const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const text = (fd: FormData, k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);

/** A job date must be a real date, not in the future (UK time), and not absurdly old. */
const validDate = (s: string) => isYmd(s) && s <= todayLondon() && s >= "2000-01-01";

// Any signed-in person can add images. Only the person who added an image, or an admin, can change or remove it.
// These checks are made here on the server; hiding buttons on the page is not security.

export async function uploadImages(formData: FormData) {
  const user = await requireUser();
  if (!storageConfigured()) redirect(`${PAGE}?error=storage`);

  const jobDate = text(formData, "job_date", 10);
  const jobRef = text(formData, "job_ref", 60);
  const description = text(formData, "description", 500);
  const notes = text(formData, "operator_notes", 1000);
  if (!validDate(jobDate)) redirect(`${PAGE}?error=date`);

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) redirect(`${PAGE}?error=nofile`);
  if (files.length > MAX_FILES_PER_UPLOAD) redirect(`${PAGE}?error=toomany`);
  if (files.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_BYTES) redirect(`${PAGE}?error=toobigtotal`);

  // Check every file first, so a bad one means nothing at all is saved.
  const images: ProcessedImage[] = [];
  for (const f of files) {
    const p = await processImage(f);
    if ("error" in p) redirect(`${PAGE}?error=${p.error}`);
    images.push(p);
  }

  const saved: string[] = [];
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    for (const img of images) {
      const key = `${randomUUID()}.${EXT[img.contentType]}`;
      const thumbKey = `${randomUUID()}.jpg`;
      await saveFile(key, img.buf);
      saved.push(key);
      await saveFile(thumbKey, img.thumb);
      saved.push(thumbKey);
      await client.query(
        `INSERT INTO job_images (job_date, job_ref, description, operator_notes, original_filename, content_type, size_bytes, width, height, storage_key, thumb_key, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [jobDate, jobRef, description, notes, img.name, img.contentType, img.buf.length, img.width, img.height, key, thumbKey, user.id]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    for (const k of saved) await deleteFile(k); // don't leave orphan files behind
    throw err;
  } finally {
    client.release();
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?week=${startOfWeek(jobDate)}&done=uploaded&n=${images.length}`);
}

/** Looks up an image and checks the signed-in person may change it. */
async function loadEditable(id: string, user: { id: string; role: string }) {
  if (!uuid(id)) return null;
  const { rows } = await db().query<{ uploaded_by: string | null; job_date: string; storage_key: string; thumb_key: string }>(
    "SELECT uploaded_by, job_date, storage_key, thumb_key FROM job_images WHERE id = $1",
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  if (user.role !== "admin" && row.uploaded_by !== user.id) return "forbidden" as const;
  return row;
}

export async function updateImage(id: string, formData: FormData) {
  const user = await requireUser();
  const row = await loadEditable(id, user);
  if (row === "forbidden") redirect(`${PAGE}/${id}?error=forbidden`);
  if (!row) redirect(`${PAGE}?error=missing`);

  const jobDate = text(formData, "job_date", 10);
  if (!validDate(jobDate)) redirect(`${PAGE}/${id}?error=date`);
  await db().query(
    "UPDATE job_images SET job_date = $2, job_ref = $3, description = $4, operator_notes = $5 WHERE id = $1",
    [id, jobDate, text(formData, "job_ref", 60), text(formData, "description", 500), text(formData, "operator_notes", 1000)]
  );
  revalidatePath(PAGE);
  redirect(`${PAGE}/${id}?done=saved`);
}

export async function deleteImage(id: string) {
  const user = await requireUser();
  const row = await loadEditable(id, user);
  if (row === "forbidden") redirect(`${PAGE}/${id}?error=forbidden`);
  if (!row) redirect(`${PAGE}?error=missing`);

  await db().query("DELETE FROM job_images WHERE id = $1", [id]);
  await deleteFile(row.storage_key);
  await deleteFile(row.thumb_key);
  revalidatePath(PAGE);
  redirect(`${PAGE}?week=${startOfWeek(row.job_date)}&done=deleted`);
}
