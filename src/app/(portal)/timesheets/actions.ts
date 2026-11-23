"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { isYmd } from "@/lib/dates";
import { listTimesheetPeople } from "@/lib/timesheets";
import { listDays, MAX_EDIT_DAYS, parseHours } from "@/lib/timesheets-shared";

/**
 * Saves the hours grid. Admin only, checked on the server (staff cannot reach any timesheet code).
 * A blank cell means "no entry" and removes any saved hours for that day; a number (0 to 24) saves it.
 * The people and days come from the database and the period, never from the form's field names alone.
 */
export async function saveHours(fd: FormData) {
  const admin = await requireAdmin();
  const from = fd.get("from");
  const to = fd.get("to");
  const view = fd.get("view") === "month" ? "month" : fd.get("view") === "custom" ? "custom" : "week";
  const anchor = fd.get("anchor");
  const back = (q: string) => {
    const base = view === "custom" ? `view=custom&from=${from}&to=${to}` : `view=${view}&date=${isYmd(anchor) ? anchor : from}`;
    return `/timesheets?${base}&${q}`;
  };
  if (!isYmd(from) || !isYmd(to) || to < from) redirect("/timesheets");
  const days = listDays(from, to);
  if (days.length > MAX_EDIT_DAYS) redirect(back("error=toolong"));

  const people = await listTimesheetPeople(from, to);
  const save = { users: [] as string[], days: [] as string[], hours: [] as number[] };
  const clear = { users: [] as string[], days: [] as string[] };
  for (const p of people) {
    for (const d of days) {
      const raw = fd.get(`h_${p.id}_${d}`);
      if (raw === null) continue; // not on the form, leave as it is
      if (String(raw).trim() === "") {
        clear.users.push(p.id);
        clear.days.push(d);
        continue;
      }
      const hours = parseHours(String(raw));
      if (hours === null) redirect(back(`error=hours&who=${encodeURIComponent(p.name)}&day=${d}`));
      save.users.push(p.id);
      save.days.push(d);
      save.hours.push(hours);
    }
  }

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    if (clear.users.length) {
      await client.query("DELETE FROM timesheet_entries WHERE (user_id, day) IN (SELECT * FROM unnest($1::uuid[], $2::date[]))", [clear.users, clear.days]);
    }
    if (save.users.length) {
      await client.query(
        `INSERT INTO timesheet_entries (user_id, day, hours, updated_by)
         SELECT t.u, t.d, t.h, $4 FROM unnest($1::uuid[], $2::date[], $3::numeric[]) AS t(u, d, h)
         ON CONFLICT (user_id, day) DO UPDATE SET hours = EXCLUDED.hours, updated_by = EXCLUDED.updated_by, updated_at = now()
          WHERE timesheet_entries.hours IS DISTINCT FROM EXCLUDED.hours`,
        [save.users, save.days, save.hours, admin.id]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  revalidatePath("/timesheets");
  redirect(back("done=saved"));
}
