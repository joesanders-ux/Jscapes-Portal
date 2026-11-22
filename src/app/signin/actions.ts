"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { endSession, startSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/security";

const MAX_ATTEMPTS = 5;

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const { rows } = await db().query(
    "SELECT id, password_hash, locked_until FROM users WHERE lower(email) = $1 AND active",
    [email]
  );
  const user = rows[0];
  const locked = Boolean(user?.locked_until && new Date(user.locked_until) > new Date());
  const ok = await verifyPassword(password, user?.password_hash ?? null); // always runs, to keep timing even

  if (!user || locked || !ok) {
    if (user && !locked) {
      // Lock for 15 minutes after 5 wrong passwords in a row.
      await db().query(
        `UPDATE users SET
           locked_until    = CASE WHEN failed_attempts + 1 >= $2 THEN now() + interval '15 minutes' ELSE locked_until END,
           failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END
         WHERE id = $1`,
        [user.id, MAX_ATTEMPTS]
      );
    }
    redirect("/signin?error=invalid");
  }

  await db().query("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [user.id]);
  await startSession(user.id);
  redirect("/");
}

export async function signOut() {
  await endSession();
  redirect("/signin");
}
