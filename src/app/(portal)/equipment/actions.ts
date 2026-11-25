"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { CATEGORIES, ITEMS, isCategory, isOptionalItem, type Result } from "@/lib/equipment-shared";
import { deleteFile, readPdfUpload, saveFile, storageConfigured } from "@/lib/storage";

export type CheckState = { error?: string };

const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const ASSETS = "/equipment?tab=assets";

/** Any signed-in user can submit a check. Every rule is re-checked here, whatever the browser did. */
export async function submitEquipmentCheck(_prev: CheckState, fd: FormData): Promise<CheckState> {
  const user = await requireUser();

  const equipmentId = String(fd.get("equipment") ?? "");
  if (!uuid(equipmentId)) return { error: "Choose the equipment you checked." };
  const found = await db().query<{ category: string }>("SELECT category FROM equipment WHERE id = $1 AND active", [equipmentId]);
  const category = found.rows[0]?.category;
  if (!isCategory(category)) return { error: "That equipment is not on the active list. Pick another." };

  // The checklist comes from the equipment's category on the server, not from what the browser sent.
  const answers: { key: string; result: Result; note: string }[] = [];
  for (const key of CATEGORIES[category].items) {
    const label = ITEMS[key].label;
    const raw = fd.get(key);
    const allowed = isOptionalItem(key) ? ["yes", "no", "na"] : ["yes", "no"];
    if (typeof raw !== "string" || !allowed.includes(raw)) return { error: `Answer "${label}".` };
    const result = raw as Result;
    const note = result === "no" ? String(fd.get(`${key}_note`) ?? "").trim().slice(0, 500) : "";
    if (result === "no" && !note) return { error: `Explain why for "${label}".` };
    answers.push({ key, result, note });
  }
  const notes = String(fd.get("notes") ?? "").trim().slice(0, 2000);

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const check = await client.query<{ id: string }>(
      "INSERT INTO equipment_checks (equipment_id, checked_by, notes) VALUES ($1, $2, $3) RETURNING id",
      [equipmentId, user.id, notes]
    );
    for (const a of answers) {
      await client.query("INSERT INTO equipment_check_items (check_id, item_key, result, note) VALUES ($1, $2, $3, $4)", [check.rows[0].id, a.key, a.result, a.note]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
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

export async function addEquipment(fd: FormData) {
  await requireAdmin();
  const f = readFields(fd);
  if (!f.name) redirect(`${ASSETS}&error=name`);
  const category = "general"; // no category is chosen when adding: new equipment gets the general checklist

  const pdf = await readPdfUpload(fd.get("manual"));
  if (pdf && "error" in pdf) redirect(`${ASSETS}&error=${pdf.error}`);
  if (pdf && !storageConfigured()) redirect(`${ASSETS}&error=storage`);

  const key = pdf ? `${randomUUID()}.pdf` : null;
  if (pdf && key) await saveFile(key, pdf.buf);
  try {
    await db().query(
      `INSERT INTO equipment (name, category, brand, model_serial, spare_parts, notes, manual_key, manual_filename, manual_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [f.name, category, f.brand, f.modelSerial, f.spareParts, f.notes, key, pdf?.name ?? null, pdf?.buf.length ?? null]
    );
  } catch (err) {
    if (key) await deleteFile(key); // don't leave an orphan file behind
    throw err;
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
