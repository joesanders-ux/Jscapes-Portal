"use server";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { CATEGORIES, ITEMS, MAX_CHECK_PHOTOS, MAX_EQUIPMENT_IMAGES, isChecklist, isOptionalItem, type Result } from "@/lib/equipment-shared";
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

export async function addEquipment(fd: FormData) {
  await requireAdmin();
  const f = readFields(fd);
  if (!f.name) redirect(`${ASSETS}&error=name`);
  const category = "general"; // no category is chosen when adding: new equipment gets the general checklist

  const pdf = await readPdfUpload(fd.get("manual"));
  if (pdf && "error" in pdf) redirect(`${ASSETS}&error=${pdf.error}`);
  if (pdf && !storageConfigured()) redirect(`${ASSETS}&error=storage`);

  const imgs = await readEquipmentImages(fd, 0);
  if ("error" in imgs) redirect(`${ASSETS}&error=${imgs.error}`);

  const key = pdf ? `${randomUUID()}.pdf` : null;
  const saved: string[] = [];
  if (pdf && key) { await saveFile(key, pdf.buf); saved.push(key); }
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const row = await client.query<{ id: string }>(
      `INSERT INTO equipment (name, category, brand, model_serial, spare_parts, notes, manual_key, manual_filename, manual_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [f.name, category, f.brand, f.modelSerial, f.spareParts, f.notes, key, pdf?.name ?? null, pdf?.buf.length ?? null]
    );
    await storeEquipmentImages(client, row.rows[0].id, imgs.photos, saved);
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
  redirect(`${ASSETS}&done=added`);
}

/** Edits the details. The category is fixed. A new manual replaces the old one; the box removes it. */
export async function updateEquipment(id: string, fd: FormData) {
  const admin = await requireAdmin();
  if (!uuid(id)) redirect(`${ASSETS}&error=missing`);
  const f = readFields(fd);
  if (!f.name) redirect(`${ASSETS}&error=name`);

  const existing = await db().query<{ manual_key: string | null }>("SELECT manual_key FROM equipment WHERE id = $1", [id]);
  if (!existing.rows[0]) redirect(`${ASSETS}&error=missing`);
  const oldKey = existing.rows[0].manual_key;

  // Pictures: which current ones are being removed, and whether the new ones fit and are real images.
  const current = await db().query<{ id: string; storage_key: string; thumb_key: string }>("SELECT id, storage_key, thumb_key FROM equipment_images WHERE equipment_id = $1", [id]);
  const wanted = new Set(fd.getAll("remove_image").map(String));
  const removing = current.rows.filter((r) => wanted.has(r.id));
  const imgs = await readEquipmentImages(fd, current.rows.length - removing.length);
  if ("error" in imgs) redirect(`${ASSETS}&error=${imgs.error}`);

  const pdf = await readPdfUpload(fd.get("manual"));
  if (pdf && "error" in pdf) redirect(`${ASSETS}&error=${pdf.error}`);
  if (pdf && !storageConfigured()) redirect(`${ASSETS}&error=storage`);
  const removeManual = fd.get("remove_manual") === "on";

  let newKey: string | null = null;
  if (pdf) {
    newKey = `${randomUUID()}.pdf`;
    await saveFile(newKey, pdf.buf);
  }
  try {
    if (pdf && newKey) {
      await db().query(
        `UPDATE equipment SET name=$2, brand=$3, model_serial=$4, spare_parts=$5, notes=$6, manual_key=$7, manual_filename=$8, manual_size=$9, spare_parts_updated_at = CASE WHEN spare_parts IS DISTINCT FROM $5 THEN now() ELSE spare_parts_updated_at END, spare_parts_updated_by = CASE WHEN spare_parts IS DISTINCT FROM $5 THEN $10::uuid ELSE spare_parts_updated_by END WHERE id=$1`,
        [id, f.name, f.brand, f.modelSerial, f.spareParts, f.notes, newKey, pdf.name, pdf.buf.length, admin.id]
      );
    } else if (removeManual) {
      await db().query(
        `UPDATE equipment SET name=$2, brand=$3, model_serial=$4, spare_parts=$5, notes=$6, manual_key=NULL, manual_filename=NULL, manual_size=NULL, spare_parts_updated_at = CASE WHEN spare_parts IS DISTINCT FROM $5 THEN now() ELSE spare_parts_updated_at END, spare_parts_updated_by = CASE WHEN spare_parts IS DISTINCT FROM $5 THEN $7::uuid ELSE spare_parts_updated_by END WHERE id=$1`,
        [id, f.name, f.brand, f.modelSerial, f.spareParts, f.notes, admin.id]
      );
    } else {
      await db().query(`UPDATE equipment SET name=$2, brand=$3, model_serial=$4, spare_parts=$5, notes=$6, spare_parts_updated_at = CASE WHEN spare_parts IS DISTINCT FROM $5 THEN now() ELSE spare_parts_updated_at END, spare_parts_updated_by = CASE WHEN spare_parts IS DISTINCT FROM $5 THEN $7::uuid ELSE spare_parts_updated_by END WHERE id=$1`, [id, f.name, f.brand, f.modelSerial, f.spareParts, f.notes, admin.id]);
    }
  } catch (err) {
    if (newKey) await deleteFile(newKey);
    throw err;
  }
  // Only once the database points at the new state is the old file removed.
  if (oldKey && (newKey || removeManual)) await deleteFile(oldKey);

  if (removing.length > 0 || imgs.photos.length > 0) {
    const saved: string[] = [];
    const client = await db().connect();
    try {
      await client.query("BEGIN");
      if (removing.length > 0) {
        await client.query("DELETE FROM equipment_images WHERE equipment_id = $1 AND id = ANY($2::uuid[])", [id, removing.map((r) => r.id)]);
      }
      await storeEquipmentImages(client, id, imgs.photos, saved);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      for (const k of saved) await deleteFile(k);
      throw err;
    } finally {
      client.release();
    }
    for (const r of removing) { await deleteFile(r.storage_key); await deleteFile(r.thumb_key); }
  }
  revalidatePath("/equipment");
  redirect(`${ASSETS}&done=updated`);
}

/** Deactivating hides an item from the check form and reminders. Its past checks are kept. */
export async function setEquipmentActive(id: string, active: boolean) {
  await requireAdmin();
  if (!uuid(id)) redirect(`${ASSETS}&error=missing`);
  await db().query("UPDATE equipment SET active = $2 WHERE id = $1", [id, active]);
  revalidatePath("/equipment");
  revalidatePath("/");
  redirect(`${ASSETS}&done=${active ? "restored" : "deactivated"}`);
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
  redirect(`${ASSETS}&done=spare`);
}
