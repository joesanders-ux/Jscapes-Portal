"use server";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { CATEGORIES, ITEMS, MAX_CHECK_PHOTOS, MAX_EQUIPMENT_IMAGES, MAX_EQUIPMENT_MANUALS, MAX_EQUIPMENT_UPLOAD_BYTES, isChecklist, isOptionalItem, type Result } from "@/lib/equipment-shared";
import { processImage, type ProcessedImage } from "@/lib/job-images";
import { MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } from "@/lib/job-images-shared";
import { deleteFile, readPdfUpload, saveFile, storageConfigured } from "@/lib/storage";

export type CheckState = { error?: string };

const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const ASSETS = "/equipment?tab=assets";

/**
 * Any signed-in user can submit a check. Every rule is re-checked here, whatever the browser did.
 * The person chooses the checklist on the form (Hand tools, Lawn mowers or Petrol equipment) and ticks
 * what was done. A ticked box is "yes". An unticked box is "no" (needs attention), except Sharpening
 * (if required), which is "not required" when unticked. Anything not ticked needs an explanation in Notes.
 */
export async function submitEquipmentCheck(_prev: CheckState, fd: FormData): Promise<CheckState> {
  const user = await requireUser();

  const equipmentId = String(fd.get("equipment") ?? "");
  if (!uuid(equipmentId)) return { error: "Choose the equipment you checked." };
  const found = await db().query("SELECT 1 FROM equipment WHERE id = $1 AND active", [equipmentId]);
  if (!found.rows[0]) return { error: "That equipment is not on the active list. Pick another." };

  const checklist = fd.get("checklist");
  if (!isChecklist(checklist)) return { error: "Choose Hand tools, Lawn mowers or Petrol equipment." };

  const notes = String(fd.get("notes") ?? "").trim().slice(0, 2000);

  // The checklist comes from the server's own list, not from what the browser sent.
  const answers: { key: string; result: Result; note: string }[] = [];
  const missed: string[] = [];
  for (const key of CATEGORIES[checklist].items) {
    const ticked = fd.get(key) === "on";
    const result: Result = ticked ? "yes" : isOptionalItem(key) ? "na" : "no";
    if (result === "no") missed.push(ITEMS[key].label);
    answers.push({ key, result, note: result === "no" ? notes.slice(0, 500) : "" });
  }
  if (missed.length > 0 && !notes) {
    return { error: `Not ticked: ${missed.join(", ")}. Tick ${missed.length === 1 ? "it" : "them"}, or explain in Notes why not.` };
  }

  // Photos added next to the Notes box. Each is decoded to make sure it really is a picture; nothing is saved
  // unless every photo and the whole check are fine.
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const photos: ProcessedImage[] = [];
  if (files.length > 0) {
    if (!storageConfigured()) return { error: "Photos cannot be uploaded yet because file storage is not set up. Submit the check without photos, or ask an administrator." };
    if (files.length > MAX_CHECK_PHOTOS) return { error: `You can add up to ${MAX_CHECK_PHOTOS} photos to a check.` };
    if (files.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_BYTES) return { error: `Those photos are too large together (the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).` };
    for (const f of files) {
      const p = await processImage(f);
      if ("error" in p) {
        return { error: p.error === "toobig" ? `"${f.name}" is too large. The limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB per photo.` : `"${f.name}" is not a usable JPEG, PNG or WebP image. Nothing was submitted.` };
      }
      photos.push(p);
    }
  }

  const saved: string[] = [];
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const check = await client.query<{ id: string }>(
      "INSERT INTO equipment_checks (equipment_id, checked_by, notes, checklist) VALUES ($1, $2, $3, $4) RETURNING id",
      [equipmentId, user.id, notes, checklist]
    );
    for (const a of answers) {
      await client.query("INSERT INTO equipment_check_items (check_id, item_key, result, note) VALUES ($1, $2, $3, $4)", [check.rows[0].id, a.key, a.result, a.note]);
    }
    for (const img of photos) {
      const key = `${randomUUID()}.${img.contentType === "image/png" ? "png" : img.contentType === "image/webp" ? "webp" : "jpg"}`;
      const thumbKey = `${randomUUID()}.jpg`;
      await saveFile(key, img.buf);
      saved.push(key);
      await saveFile(thumbKey, img.thumb);
      saved.push(thumbKey);
      await client.query(
        `INSERT INTO equipment_check_images (check_id, original_filename, content_type, size_bytes, width, height, storage_key, thumb_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [check.rows[0].id, img.name, img.contentType, img.buf.length, img.width, img.height, key, thumbKey]
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
  revalidatePath("/equipment");
  revalidatePath("/");
  redirect("/equipment?done=checked");
}

// Everything below manages the equipment list and is admin-only, checked on the server.

function readFields(fd: FormData) {
  return {
    name: String(fd.get("name") ?? "").trim().slice(0, 120),
    brand: String(fd.get("brand") ?? "").trim().slice(0, 100),
    modelSerial: String(fd.get("model_serial") ?? "").trim().slice(0, 200),
    spareParts: String(fd.get("spare_parts") ?? "").trim().slice(0, 2000),
    notes: String(fd.get("notes") ?? "").trim().slice(0, 2000),
  };
}


const extFor = (t: ProcessedImage["contentType"]) => (t === "image/png" ? "png" : t === "image/webp" ? "webp" : "jpg");

/**
 * Reads and checks the pictures on an equipment form. Each one is decoded to make sure it really is a picture.
 * `already` is how many the item has after any removals, so the total can never go over the limit.
 */
async function readEquipmentImages(fd: FormData, already: number): Promise<{ photos: ProcessedImage[] } | { error: string }> {
  const files = fd.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { photos: [] };
  if (!storageConfigured()) return { error: "storage" };
  if (already + files.length > MAX_EQUIPMENT_IMAGES) return { error: "imgmany" };
  if (files.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_BYTES) return { error: "imgtotal" };
  const photos: ProcessedImage[] = [];
  for (const f of files) {
    const p = await processImage(f);
    if ("error" in p) return { error: p.error === "toobig" ? "imgbig" : "imgbad" };
    photos.push(p);
  }
  return { photos };
}

/** Saves the files and inserts the rows for new pictures. Returns the file keys written, so a failure can remove them. */
async function storeEquipmentImages(client: PoolClient, equipmentId: string, photos: ProcessedImage[], saved: string[]) {
  for (const img of photos) {
    const key = `${randomUUID()}.${extFor(img.contentType)}`;
    const thumbKey = `${randomUUID()}.jpg`;
    await saveFile(key, img.buf);
    saved.push(key);
    await saveFile(thumbKey, img.thumb);
    saved.push(thumbKey);
    await client.query(
      `INSERT INTO equipment_images (equipment_id, original_filename, content_type, size_bytes, width, height, storage_key, thumb_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [equipmentId, img.name, img.contentType, img.buf.length, img.width, img.height, key, thumbKey]
    );
  }
}

type Manual = { buf: Buffer; name: string };

/** Manuals and pictures arrive in one request, so together they must stay under the upload limit. */
const uploadTooBig = (fd: FormData) =>
  [...fd.getAll("manual"), ...fd.getAll("images")].reduce<number>((n, f) => n + (f instanceof File ? f.size : 0), 0) > MAX_EQUIPMENT_UPLOAD_BYTES;

/** Reads and checks the PDFs on an equipment form: each must really be a PDF, and the item can have at most MAX_EQUIPMENT_MANUALS. */
async function readManuals(fd: FormData, already: number): Promise<{ manuals: Manual[] } | { error: string }> {
  const files = fd.getAll("manual").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { manuals: [] };
  if (!storageConfigured()) return { error: "storage" };
  if (already + files.length > MAX_EQUIPMENT_MANUALS) return { error: "manualmany" };
  if (files.reduce((n, f) => n + f.size, 0) > MAX_EQUIPMENT_UPLOAD_BYTES) return { error: "manualtotal" };
  const manuals: Manual[] = [];
  for (const f of files) {
    const pdf = await readPdfUpload(f);
    if (pdf && "error" in pdf) return { error: pdf.error };
    if (pdf) manuals.push(pdf);
  }
  return { manuals };
}

async function storeManuals(client: PoolClient, equipmentId: string, manuals: Manual[], saved: string[]) {
  for (const m of manuals) {
    const key = `${randomUUID()}.pdf`;
    await saveFile(key, m.buf);
    saved.push(key);
    await client.query("INSERT INTO equipment_manuals (equipment_id, original_filename, size_bytes, storage_key) VALUES ($1, $2, $3, $4)", [equipmentId, m.name, m.buf.length, key]);
  }
}

export async function addEquipment(fd: FormData) {
  const admin = await requireAdmin();
  const f = readFields(fd);
  if (!f.name) redirect(`${ASSETS}&error=name`);
  const category = "general"; // no category is chosen when adding: new equipment gets the general checklist

  if (uploadTooBig(fd)) redirect(`${ASSETS}&error=manualtotal`);
  const pdfs = await readManuals(fd, 0);
  if ("error" in pdfs) redirect(`${ASSETS}&error=${pdfs.error}`);
  const imgs = await readEquipmentImages(fd, 0);
  if ("error" in imgs) redirect(`${ASSETS}&error=${imgs.error}`);

  const saved: string[] = [];
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const row = await client.query<{ id: string }>(
      `INSERT INTO equipment (name, category, brand, model_serial, spare_parts, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [f.name, category, f.brand, f.modelSerial, f.spareParts, f.notes]
    );
    await storeManuals(client, row.rows[0].id, pdfs.manuals, saved);
    await storeEquipmentImages(client, row.rows[0].id, imgs.photos, saved);
    // Tell everyone else who is active, in the same transaction as the item. ref_id is the item, so it can be cleared on delete.
    await client.query(
      "INSERT INTO notifications (user_id, message, link, ref_id) SELECT id, $2, '/equipment?tab=assets', $3 FROM users WHERE active AND id <> $1",
      [admin.id, `New equipment added: ${f.name}`, row.rows[0].id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    for (const k of saved) await deleteFile(k); // don't leave orphan files behind
    throw err;
  } finally {
    client.release();
  }
  revalidatePath("/equipment");
  revalidatePath("/");
  // `n` changes every time, so the page treats the Add form as a new one and shows it empty, ready for the next item.
  redirect(`${ASSETS}&done=added&n=${Date.now()}`);
}

/** Edits the details. The category is fixed. New manuals and pictures are added to the existing ones; ticked ones are removed. */
export async function updateEquipment(id: string, fd: FormData) {
  const admin = await requireAdmin();
  if (!uuid(id)) redirect(`${ASSETS}&error=missing`);
  const f = readFields(fd);
  if (!f.name) redirect(`${ASSETS}&error=name`);

  const existing = await db().query("SELECT 1 FROM equipment WHERE id = $1", [id]);
  if (!existing.rows[0]) redirect(`${ASSETS}&error=missing`);

  // Which current manuals and pictures are being removed, and whether the new ones fit and are real files.
  const curManuals = await db().query<{ id: string; storage_key: string }>("SELECT id, storage_key FROM equipment_manuals WHERE equipment_id = $1", [id]);
  const curImages = await db().query<{ id: string; storage_key: string; thumb_key: string }>("SELECT id, storage_key, thumb_key FROM equipment_images WHERE equipment_id = $1", [id]);
  const wantManuals = new Set(fd.getAll("remove_manual").map(String));
  const wantImages = new Set(fd.getAll("remove_image").map(String));
  const removingManuals = curManuals.rows.filter((r) => wantManuals.has(r.id));
  const removingImages = curImages.rows.filter((r) => wantImages.has(r.id));
  if (uploadTooBig(fd)) redirect(`${ASSETS}&error=manualtotal`);
  const pdfs = await readManuals(fd, curManuals.rows.length - removingManuals.length);
  if ("error" in pdfs) redirect(`${ASSETS}&error=${pdfs.error}`);
  const imgs = await readEquipmentImages(fd, curImages.rows.length - removingImages.length);
  if ("error" in imgs) redirect(`${ASSETS}&error=${imgs.error}`);

  const saved: string[] = [];
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE equipment SET name=$2, brand=$3, model_serial=$4, spare_parts=$5, notes=$6,
              spare_parts_updated_at = CASE WHEN spare_parts IS DISTINCT FROM $5 THEN now() ELSE spare_parts_updated_at END,
              spare_parts_updated_by = CASE WHEN spare_parts IS DISTINCT FROM $5 THEN $7::uuid ELSE spare_parts_updated_by END
        WHERE id=$1`,
      [id, f.name, f.brand, f.modelSerial, f.spareParts, f.notes, admin.id]
    );
    if (removingManuals.length) await client.query("DELETE FROM equipment_manuals WHERE equipment_id = $1 AND id = ANY($2::uuid[])", [id, removingManuals.map((r) => r.id)]);
    if (removingImages.length) await client.query("DELETE FROM equipment_images WHERE equipment_id = $1 AND id = ANY($2::uuid[])", [id, removingImages.map((r) => r.id)]);
    await storeManuals(client, id, pdfs.manuals, saved);
    await storeEquipmentImages(client, id, imgs.photos, saved);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    for (const k of saved) await deleteFile(k);
    throw err;
  } finally {
    client.release();
  }
  // Only once the database points at the new state are the removed files deleted.
  for (const r of removingManuals) await deleteFile(r.storage_key);
  for (const r of removingImages) { await deleteFile(r.storage_key); await deleteFile(r.thumb_key); }
  revalidatePath("/equipment");
  redirect(`${ASSETS}&done=updated&open=${id}`);
}

/** Deactivating hides an item from the check form and reminders. Its past checks are kept. */
export async function setEquipmentActive(id: string, active: boolean) {
  await requireAdmin();
  if (!uuid(id)) redirect(`${ASSETS}&error=missing`);
  await db().query("UPDATE equipment SET active = $2 WHERE id = $1", [id, active]);
  revalidatePath("/equipment");
  revalidatePath("/");
  redirect(`${ASSETS}&done=${active ? "restored" : "deactivated"}&open=${id}`);
}

/**
 * Permanently deletes an item, its pictures, its manuals and its past checks (with their photos). Admin only.
 * The database keeps its safety net (checks restrict deleting equipment), so the checks are removed here, explicitly,
 * in one transaction, and only when the admin has ticked the confirmation. Files are removed after the commit.
 */
export async function deleteEquipment(id: string, fd: FormData) {
  await requireAdmin();
  if (!uuid(id)) redirect(`${ASSETS}&error=missing`);
  if (fd.get("confirm_delete") !== "on") redirect(`${ASSETS}&error=confirmdelete`);

  const item = await db().query("SELECT 1 FROM equipment WHERE id = $1", [id]);
  if (!item.rows[0]) redirect(`${ASSETS}&error=missing`);
  const manuals = await db().query<{ storage_key: string }>("SELECT storage_key FROM equipment_manuals WHERE equipment_id = $1", [id]);
  const pics = await db().query<{ storage_key: string; thumb_key: string }>("SELECT storage_key, thumb_key FROM equipment_images WHERE equipment_id = $1", [id]);
  const checkPics = await db().query<{ storage_key: string; thumb_key: string }>(
    "SELECT im.storage_key, im.thumb_key FROM equipment_check_images im JOIN equipment_checks c ON c.id = im.check_id WHERE c.equipment_id = $1",
    [id]
  );

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    // Check answers and check photos go with their check (ON DELETE CASCADE); equipment pictures go with the item.
    await client.query("DELETE FROM equipment_checks WHERE equipment_id = $1", [id]);
    await client.query("DELETE FROM equipment WHERE id = $1", [id]);
    await client.query("DELETE FROM notifications WHERE ref_id = $1", [id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  // The rows are gone, so now the files can go too. A missing file is not an error.
  const keys = [...pics.rows, ...checkPics.rows].flatMap((r) => [r.storage_key, r.thumb_key]);
  for (const m of manuals.rows) keys.push(m.storage_key);
  for (const k of keys) await deleteFile(k);
  revalidatePath("/equipment");
  revalidatePath("/");
  redirect(`${ASSETS}&done=deleted`);
}

/**
 * Updates only the spare parts. Open to everyone who is signed in (staff can keep the list current),
 * and it changes nothing else. Staff can edit active equipment; admins can also edit deactivated items.
 */
export async function updateSpareParts(id: string, fd: FormData) {
  const user = await requireUser();
  if (!uuid(id)) redirect(`${ASSETS}&error=missing`);
  const spareParts = String(fd.get("spare_parts") ?? "").trim().slice(0, 2000);
  const res = await db().query(
    `UPDATE equipment
        SET spare_parts = $2,
            spare_parts_updated_at = CASE WHEN spare_parts IS DISTINCT FROM $2 THEN now() ELSE spare_parts_updated_at END,
            spare_parts_updated_by = CASE WHEN spare_parts IS DISTINCT FROM $2 THEN $3::uuid ELSE spare_parts_updated_by END
      WHERE id = $1 AND (active OR $4::boolean)`,
    [id, spareParts, user.id, user.role === "admin"]
  );
  if (!res.rowCount) redirect(`${ASSETS}&error=missing`);
  revalidatePath("/equipment");
  redirect(`${ASSETS}&done=spare&open=${id}`);
}
