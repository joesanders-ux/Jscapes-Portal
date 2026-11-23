"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// Both actions only ever touch the signed-in person's own notifications.

export async function markNotificationRead(id: string) {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await db().query("UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL", [id, user.id]);
  revalidatePath("/");
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await db().query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [user.id]);
  revalidatePath("/");
}
