"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { CHECK_ITEMS, isCondition } from "@/lib/vans-shared";

export type CheckState = { error?: string };

const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const VEHICLES = "/vans?tab=vehicles";

/** Any signed-in user can submit a check. Every rule is re-checked here, whatever the browser did. */
export async function submitVanCheck(_prev: CheckState, fd: FormData): Promise<CheckState> {
  const user = await requireUser();

  const vanId = String(fd.get("van") ?? "");
  if (!uuid(vanId)) return { error: "Choose the van you checked." };
  const van = await db().query("SELECT 1 FROM vans WHERE id = $1 AND active", [vanId]);
  if (!van.rows[0]) return { error: "That van is not on the active list. Pick another." };

  const answers: Record<string, boolean | string> = {};
  for (const item of CHECK_ITEMS) {
    const answer = fd.get(item.key);
    if (answer !== "yes" && answer !== "no") return { error: `Answer Yes or No for "${item.label}".` };
    const ok = answer === "yes";
    const note = ok ? "" : String(fd.get(`${item.key}_note`) ?? "").trim().slice(0, 500);
    if (!ok && !note) return { error: `Explain why for "${item.label}".` };
    answers[`${item.key}_ok`] = ok;
    answers[`${item.key}_note`] = note;
  }

  const condition = fd.get("condition");
  if (!isCondition(condition)) return { error: "Choose the overall condition of the van." };
  const notes = String(fd.get("notes") ?? "").trim().slice(0, 2000);
  if (condition !== "compliant" && !notes) return { error: "Add a note explaining what needs attention." };

  await db().query(
    `INSERT INTO van_checks (van_id, checked_by, oil_ok, oil_note, tyres_ok, tyres_note, lights_ok, lights_note,
                             dashboard_ok, dashboard_note, clean_ok, clean_note, condition, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      vanId, user.id,
      answers.oil_ok, answers.oil_note, answers.tyres_ok, answers.tyres_note, answers.lights_ok, answers.lights_note,
      answers.dashboard_ok, answers.dashboard_note, answers.clean_ok, answers.clean_note,
      condition, notes,
    ]
  );
  revalidatePath("/vans");
  revalidatePath("/");
  redirect("/vans?done=checked");
}

// Vehicle list management is admin-only, checked on the server.

export async function addVan(formData: FormData) {
  await requireAdmin();
  const registration = String(formData.get("registration") ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  const description = String(formData.get("description") ?? "").trim().slice(0, 80);
  if (!/^[A-Z0-9][A-Z0-9 -]{1,11}$/.test(registration)) redirect(`${VEHICLES}&error=reg`);
  try {
    await db().query("INSERT INTO vans (registration, description) VALUES ($1, $2)", [registration, description]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") redirect(`${VEHICLES}&error=dup`);
    throw e;
  }
  revalidatePath("/vans");
  revalidatePath("/");
  redirect(`${VEHICLES}&done=added`);
}

/** Deactivating hides a van from the check form and reminders. Its past checks are kept. */
export async function setVanActive(id: string, active: boolean) {
  await requireAdmin();
  if (!uuid(id)) redirect(`${VEHICLES}&error=missing`);
  await db().query("UPDATE vans SET active = $2 WHERE id = $1", [id, active]);
  revalidatePath("/vans");
  revalidatePath("/");
  redirect(`${VEHICLES}&done=${active ? "restored" : "deactivated"}`);
}
