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
  // People with a staff account and people added to the timesheet only are stored in different columns.
  const mk = () => ({ ids: [] as string[], days: [] as string[], hours: [] as number[] });
  const save = { account: mk(), only: mk() };
  const clear = { account: mk(), only: mk() };
  for (const p of people) {
    for (const d of days) {
      const raw = fd.get(`h_${p.id}_${d}`);
      if (raw === null) continue; // not on the form, leave as it is
      if (String(raw).trim() === "") {
        const c = p.account ? clear.account : clear.only;
        c.ids.push(p.id);
        c.days.push(d);
        continue;
      }
      const hours = parseHours(String(raw));
      if (hours === null) redirect(back(`error=hours&who=${encodeURIComponent(p.name)}&day=${d}`));
      const t = p.account ? save.account : save.only;
      t.ids.push(p.id);
      t.days.push(d);
      t.hours.push(hours);
    }
  }

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    for (const [col, c, sv] of [["user_id", clear.account, save.account], ["person_id", clear.only, save.only]] as const) {
      if (c.ids.length) {
        await client.query(`DELETE FROM timesheet_entries WHERE (${col}, day) IN (SELECT * FROM unnest($1::uuid[], $2::date[]))`, [c.ids, c.days]);
      }
      if (sv.ids.length) {
        await client.query(
          `INSERT INTO timesheet_entries (${col}, day, hours, updated_by)
           SELECT t.u, t.d, t.h, $4 FROM unnest($1::uuid[], $2::date[], $3::numeric[]) AS t(u, d, h)
           ON CONFLICT (${col}, day) WHERE ${col} IS NOT NULL DO UPDATE SET hours = EXCLUDED.hours, updated_by = EXCLUDED.updated_by, updated_at = now()
            WHERE timesheet_entries.hours IS DISTINCT FROM EXCLUDED.hours`,
          [sv.ids, sv.days, sv.hours, admin.id]
        );
      }
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

/** Where to return to after adding or changing a person: the same period the admin was looking at. */
function backTo(fd: FormData, q: string): string {
  const from = fd.get("from");
  const to = fd.get("to");
  const anchor = fd.get("anchor");
  const view = fd.get("view") === "month" ? "month" : fd.get("view") === "custom" ? "custom" : "week";
  if (!isYmd(from) || !isYmd(to)) return `/timesheets?${q}`;
  const base = view === "custom" ? `view=custom&from=${from}&to=${to}` : `view=${view}&date=${isYmd(anchor) ? anchor : from}`;
  return `/timesheets?${base}&${q}`;
}

/**
 * Adds a person to the timesheet who has no staff account. They cannot sign in and appear nowhere else.
 * Admin only, checked on the server. A name already used by a staff account or another timesheet person is refused,
 * so two rows can never look the same on a payroll sheet.
 */
export async function addTimesheetPerson(fd: FormData) {
  const admin = await requireAdmin();
  const name = String(fd.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!name) redirect(backTo(fd, "error=personname"));
  const { rows } = await db().query(
    "SELECT 1 FROM users WHERE lower(btrim(name)) = lower($1) UNION ALL SELECT 1 FROM timesheet_people WHERE lower(btrim(name)) = lower($1)",
    [name]
  );
  if (rows.length) redirect(backTo(fd, `error=persondup&who=${encodeURIComponent(name)}`));
  try {
    await db().query("INSERT INTO timesheet_people (name, created_by) VALUES ($1, $2)", [name, admin.id]);
  } catch (err) {
    // A second admin adding the same name at the same moment hits the unique index.
    if ((err as { code?: string }).code === "23505") redirect(backTo(fd, `error=persondup&who=${encodeURIComponent(name)}`));
    throw err;
  }
  revalidatePath("/timesheets");
  redirect(backTo(fd, "done=personadded"));
}

/** Removes a no-account person from the timesheet (or brings them back). Nothing is deleted: saved hours stay, and still show for the periods they were worked in. */
export async function setTimesheetPersonActive(personId: string, active: boolean, fd: FormData) {
  await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(personId)) redirect(backTo(fd, "error=personmissing"));
  const res = await db().query("UPDATE timesheet_people SET active = $2 WHERE id = $1 AND active <> $2", [personId, active]);
  revalidatePath("/timesheets");
  redirect(backTo(fd, res.rowCount ? `done=${active ? "personrestored" : "personremoved"}` : "error=personmissing"));
}
