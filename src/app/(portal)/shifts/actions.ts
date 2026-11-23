"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { addDays, fmtShort, isYmd, startOfWeek } from "@/lib/dates";
import { isTime } from "@/lib/shifts-shared";

/**
 * Saves the whole week from the planner. Admin only, checked on the server.
 *
 * Rules:
 *  - each person/day needs both a start and an end time, or neither (neither removes the shift)
 *  - the end must be after the start
 *  - a new or CHANGED shift is saved HIDDEN. An unchanged shift keeps its published state
 *  - "Save and publish" then publishes every hidden shift in the week and notifies each person once
 */
export async function saveWeek(fd: FormData) {
  const admin = await requireAdmin();
  const dateRaw = fd.get("week");
  if (!isYmd(dateRaw)) redirect("/shifts?tab=plan");
  const week = startOfWeek(dateRaw);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const back = (query: string) => `/shifts?tab=plan&date=${week}&${query}`;
  const publish = fd.get("intent") === "publish";

  const people = await db().query<{ id: string; name: string }>("SELECT id, name FROM users WHERE active ORDER BY lower(name)");

  const up = { users: [] as string[], days: [] as string[], starts: [] as string[], ends: [] as string[] };
  const del = { users: [] as string[], days: [] as string[] };
  for (const p of people.rows) {
    for (const d of days) {
      const start = String(fd.get(`s_${p.id}_${d}`) ?? "").trim();
      const end = String(fd.get(`e_${p.id}_${d}`) ?? "").trim();
      const where = `who=${encodeURIComponent(p.name)}&day=${d}`;
      if (!start && !end) {
        del.users.push(p.id);
        del.days.push(d);
        continue;
      }
      if (!isTime(start) || !isTime(end)) redirect(back(`error=incomplete&${where}`));
      if (end <= start) redirect(back(`error=order&${where}`));
      up.users.push(p.id);
      up.days.push(d);
      up.starts.push(start);
      up.ends.push(end);
    }
  }

  let publishedCount = 0;
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    if (del.users.length) {
      await client.query("DELETE FROM shifts WHERE (user_id, day) IN (SELECT * FROM unnest($1::uuid[], $2::date[]))", [del.users, del.days]);
    }
    if (up.users.length) {
      await client.query(
        `INSERT INTO shifts (user_id, day, start_time, end_time, created_by)
         SELECT t.u, t.d, t.s, t.e, $5 FROM unnest($1::uuid[], $2::date[], $3::time[], $4::time[]) AS t(u, d, s, e)
         ON CONFLICT (user_id, day) DO UPDATE
            SET start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                updated_at = now(),
                -- unchanged times keep their state; a change sends the shift back to hidden until it is published again
                published_at = CASE WHEN shifts.start_time = EXCLUDED.start_time AND shifts.end_time = EXCLUDED.end_time THEN shifts.published_at ELSE NULL END`,
        [up.users, up.days, up.starts, up.ends, admin.id]
      );
    }
    if (publish) {
      const done = await client.query<{ user_id: string; day: string }>(
        "UPDATE shifts SET published_at = now() WHERE published_at IS NULL AND day BETWEEN $1::date AND $2::date RETURNING user_id, day",
        [days[0], days[6]]
      );
      publishedCount = done.rowCount ?? 0;
      // One notification per person, however many of their shifts were published.
      const byUser = new Map<string, string[]>();
      for (const r of done.rows) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.day]);
      for (const [userId, ds] of byUser) {
        ds.sort();
        const span = ds[0] === ds[ds.length - 1] ? fmtShort(ds[0]) : `${fmtShort(ds[0])} to ${fmtShort(ds[ds.length - 1])}`;
        await client.query("INSERT INTO notifications (user_id, message, link) VALUES ($1, $2, $3)", [
          userId,
          `New shifts published for ${span} (${ds.length} ${ds.length === 1 ? "shift" : "shifts"}). Times are approximate.`,
          `/shifts?date=${ds[0]}`,
        ]);
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  revalidatePath("/shifts");
  revalidatePath("/");
  redirect(back(publish ? `done=published&n=${publishedCount}` : "done=saved"));
}
