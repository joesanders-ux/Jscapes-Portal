import "server-only";
import { db } from "./db";
import { todayLondon } from "./dates";

/** Hidden shifts from today on: the admin's "remember to publish" reminder. `firstDay` is where to look first. */
export async function hiddenShiftSummary(): Promise<{ count: number; firstDay: string | null }> {
  const { rows } = await db().query<{ count: number; first_day: string | null }>(
    "SELECT count(*)::int AS count, min(day) AS first_day FROM shifts WHERE published_at IS NULL AND day >= $1::date",
    [todayLondon()]
  );
  return { count: rows[0].count, firstDay: rows[0].first_day };
}

export type Notification = { id: string; message: string; link: string | null; created_at: Date };

export async function unreadNotifications(userId: string): Promise<Notification[]> {
  const { rows } = await db().query<Notification>(
    "SELECT id, message, link, created_at FROM notifications WHERE user_id = $1 AND read_at IS NULL ORDER BY created_at DESC LIMIT 20",
    [userId]
  );
  return rows;
}

/** How many unread notifications someone has: the number on the bell. */
export async function unreadNotificationCount(userId: string): Promise<number> {
  const { rows } = await db().query<{ n: number }>("SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [userId]);
  return rows[0].n;
}
