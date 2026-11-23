"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { addDays, addMonths, isYmd, todayLondon } from "@/lib/dates";
import { isStatus, MAX_DAYS_AHEAD, MAX_REQUEST_SPAN, type Status } from "@/lib/availability-shared";

export type SubmitState = { error?: string };

const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const REQUESTS = "/availability?tab=requests";

/**
 * Submits a month of availability and LOCKS it. Every rule is re-checked here, whatever the browser did:
 *  - only today onward, and no further than a year ahead
 *  - days that are already locked are never overwritten (ON CONFLICT DO NOTHING)
 *  - your own days only: the person comes from the session, never from the form
 */
export async function submitAvailability(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const user = await requireUser();

  const month = String(fd.get("month") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: "Choose a month." };
  const first = `${month}-01`;
  const today = todayLondon();
  const lastAllowed = addDays(today, MAX_DAYS_AHEAD);
  const start = first > today ? first : today;
  const end = addDays(addMonths(first, 1), -1) < lastAllowed ? addDays(addMonths(first, 1), -1) : lastAllowed;
  if (start > end) return { error: "That month is outside the dates you can enter (today up to a year ahead)." };

  const days: string[] = [];
  const statuses: Status[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const raw = fd.get(`d_${d}`);
    if (raw === null) continue; // already locked days are not in the form
    if (!isStatus(raw)) return { error: "One of the days has an answer that is not allowed. Reload the page and try again." };
    days.push(d);
    statuses.push(raw);
  }
  if (days.length === 0) return { error: "Everything in that month is already submitted." };
  if (statuses.every((s) => s === "not_provided")) return { error: "Mark at least one day as Available or Not available before submitting." };

  const res = await db().query(
    `INSERT INTO availability_days (user_id, day, status)
     SELECT $1, t.d, t.s FROM unnest($2::date[], $3::text[]) AS t(d, s)
     ON CONFLICT (user_id, day) DO NOTHING`,
    [user.id, days, statuses]
  );
  if (res.rowCount === 0) return { error: "Those days were already submitted, so nothing was changed." };
  revalidatePath("/availability");
  revalidatePath("/");
  redirect(`/availability?tab=mine&date=${first}&view=month&done=submitted`);
}

/** Asks an administrator to change days that are already locked. Any signed-in user can ask. */
export async function requestChange(fd: FormData) {
  const user = await requireUser();
  const from = fd.get("from");
  const to = fd.get("to");
  const status = fd.get("status");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 500);
  const today = todayLondon();

  if (!isYmd(from) || !isYmd(to)) redirect(`${REQUESTS}&error=dates`);
  if (!isStatus(status)) redirect(`${REQUESTS}&error=status`);
  if (from < today || to > addDays(today, MAX_DAYS_AHEAD)) redirect(`${REQUESTS}&error=range`);
  if (to < from) redirect(`${REQUESTS}&error=order`);
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > MAX_REQUEST_SPAN) redirect(`${REQUESTS}&error=span`);
  if (!reason) redirect(`${REQUESTS}&error=reason`);

  await db().query(
    "INSERT INTO availability_change_requests (user_id, from_day, to_day, requested_status, reason) VALUES ($1, $2, $3, $4, $5)",
    [user.id, from, to, status, reason]
  );
  revalidatePath("/availability");
  revalidatePath("/");
  redirect(`${REQUESTS}&done=requested`);
}

/** Withdraws your own request while it is still waiting. */
export async function cancelRequest(id: string) {
  const user = await requireUser();
  if (!uuid(id)) redirect(`${REQUESTS}&error=missing`);
  await db().query("DELETE FROM availability_change_requests WHERE id = $1 AND user_id = $2 AND state = 'pending'", [id, user.id]);
  revalidatePath("/availability");
  revalidatePath("/");
  redirect(`${REQUESTS}&done=cancelled`);
}

/**
 * Admin decision. Approving applies the requested status to every day in the range that has not passed yet.
 * The request is claimed first (state = 'pending'), so two admins cannot both decide it.
 */
export async function decideRequest(id: string, fd: FormData) {
  const admin = await requireAdmin();
  if (!uuid(id)) redirect(`${REQUESTS}&error=missing`);
  const decision = fd.get("decision");
  if (decision !== "approve" && decision !== "decline") redirect(`${REQUESTS}&error=missing`);
  const note = String(fd.get("note") ?? "").trim().slice(0, 500);

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const claimed = await client.query<{ user_id: string; from_day: string; to_day: string; requested_status: Status }>(
      `UPDATE availability_change_requests
          SET state = $2, decided_by = $3, decided_at = now(), decision_note = $4
        WHERE id = $1 AND state = 'pending'
        RETURNING user_id, from_day, to_day, requested_status`,
      [id, decision === "approve" ? "approved" : "declined", admin.id, note]
    );
    const r = claimed.rows[0];
    if (!r) {
      await client.query("ROLLBACK");
      redirect(`${REQUESTS}&error=decided`);
    }
    if (decision === "approve") {
      await client.query(
        `INSERT INTO availability_days (user_id, day, status, source)
         SELECT $1, g::date, $4, 'change_approved'
           FROM generate_series($2::date, $3::date, interval '1 day') AS g
          WHERE g::date >= (now() AT TIME ZONE 'Europe/London')::date
         ON CONFLICT (user_id, day) DO UPDATE SET status = EXCLUDED.status, source = 'change_approved', submitted_at = now()`,
        [r.user_id, r.from_day, r.to_day, r.requested_status]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  revalidatePath("/availability");
  revalidatePath("/");
  redirect(`${REQUESTS}&done=${decision === "approve" ? "approved" : "declined"}`);
}
