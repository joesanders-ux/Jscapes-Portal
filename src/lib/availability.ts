import "server-only";
import { db } from "./db";
import { addDays, addMonths, fmtMonth, startOfMonth, todayLondon } from "./dates";
import { REMINDER_DAY } from "./availability-shared";

export type AvailabilityReminder = { monthLabel: string; monthStart: string; submittedDays: number; totalDays: number; overdue: boolean };

/**
 * The monthly reminder: has this person entered every day of NEXT month yet?
 * Returns null when they have. It counts as overdue once the 15th has passed.
 */
export async function availabilityReminder(userId: string): Promise<AvailabilityReminder | null> {
  const today = todayLondon();
  const monthStart = addMonths(startOfMonth(today), 1);
  const totalDays = Number(addDays(addMonths(monthStart, 1), -1).slice(8));
  const { rows } = await db().query<{ n: number }>(
    "SELECT count(*)::int AS n FROM availability_days WHERE user_id = $1 AND day >= $2::date AND day < $3::date",
    [userId, monthStart, addMonths(monthStart, 1)]
  );
  const submittedDays = rows[0].n;
  if (submittedDays >= totalDays) return null;
  return { monthLabel: fmtMonth(monthStart), monthStart, submittedDays, totalDays, overdue: Number(today.slice(8)) > REMINDER_DAY };
}

export async function pendingChangeRequestCount(): Promise<number> {
  const { rows } = await db().query<{ n: number }>("SELECT count(*)::int AS n FROM availability_change_requests WHERE state = 'pending'");
  return rows[0].n;
}
