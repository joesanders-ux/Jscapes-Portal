"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { createInvite } from "@/lib/invites";

export type InviteState = { link?: string; error?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

async function otherActiveAdmins(excludeId: string): Promise<number> {
  const { rows } = await db().query("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND active AND id <> $1", [excludeId]);
  return rows[0].n;
}

export async function createUser(_prev: InviteState, fd: FormData): Promise<InviteState> {
  const admin = await requireAdmin();
  const name = String(fd.get("name") ?? "").trim().slice(0, 100);
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const role = fd.get("role") === "admin" ? "admin" : "staff";
  if (!name) return { error: "Enter the person's name." };
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };
  try {
    const { rows } = await db().query("INSERT INTO users (email, name, role) VALUES ($1, $2, $3) RETURNING id", [email, name, role]);
    const link = await createInvite(rows[0].id, admin.id);
    revalidatePath("/settings/users");
    return { link };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { error: "A user with that email already exists." };
    throw e;
  }
}

export async function newInviteLink(userId: string, _prev: InviteState, _fd: FormData): Promise<InviteState> {
  const admin = await requireAdmin();
  if (!uuid(userId)) return { error: "Unknown user." };
  const { rows } = await db().query("SELECT 1 FROM users WHERE id = $1 AND active", [userId]);
  if (!rows[0]) return { error: "That user is deactivated. Reactivate them first." };
  const link = await createInvite(userId, admin.id);
  revalidatePath("/settings/users");
  return { link };
}

export async function setUserActive(id: string, active: boolean) {
  await requireAdmin();
  if (!uuid(id)) return;
  if (!active) {
    const target = (await db().query("SELECT role FROM users WHERE id = $1", [id])).rows[0];
    if (target?.role === "admin" && (await otherActiveAdmins(id)) === 0) return; // keep one active admin
  }
  await db().query("UPDATE users SET active = $2 WHERE id = $1", [id, active]);
  if (!active) await db().query("DELETE FROM sessions WHERE user_id = $1", [id]); // sign them out now
  revalidatePath("/settings/users");
}

export async function setUserRole(id: string, role: "admin" | "staff") {
  await requireAdmin();
  if (!uuid(id) || (role !== "admin" && role !== "staff")) return;
  if (role === "staff") {
    const target = (await db().query("SELECT role, active FROM users WHERE id = $1", [id])).rows[0];
    if (target?.role === "admin" && target.active && (await otherActiveAdmins(id)) === 0) return; // keep one active admin
  }
  await db().query("UPDATE users SET role = $2 WHERE id = $1", [id, role]);
  revalidatePath("/settings/users");
}
