"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { startSession } from "@/lib/auth";
import { consumeInvite } from "@/lib/invites";
import { hashPassword } from "@/lib/security";

export async function acceptWithPassword(token: string, formData: FormData) {
  const page = `/invite/${encodeURIComponent(token)}`;
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 10 || password.length > 200) redirect(`${page}?error=short`);
  if (password !== confirm) redirect(`${page}?error=mismatch`);

  const userId = await consumeInvite(token);
  if (!userId) redirect(page); // the page explains that the link is no longer valid

  await db().query(
    "UPDATE users SET password_hash = $2, activated_at = COALESCE(activated_at, now()), failed_attempts = 0, locked_until = NULL WHERE id = $1",
    [userId, await hashPassword(password)]
  );
  await db().query("DELETE FROM sessions WHERE user_id = $1", [userId]); // a new password signs out older sessions
  await startSession(userId);
  redirect("/");
}
