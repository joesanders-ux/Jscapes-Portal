"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { EVENT_TYPES, type EventType } from "@/lib/events";
import { isYmd } from "@/lib/dates";

const text = (fd: FormData, key: string, max: number) => String(fd.get(key) ?? "").trim().slice(0, max);
const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

// Every action re-checks the user on the server. Hiding a button is not security.

export async function createPost(formData: FormData) {
  const admin = await requireAdmin();
  const title = text(formData, "title", 120);
  const body = text(formData, "body", 2000);
  if (!title) return;
  await db().query("INSERT INTO bulletin_posts (title, body, pinned, author_id) VALUES ($1,$2,$3,$4)", [
    title,
    body,
    formData.get("pinned") === "on",
    admin.id,
  ]);
  revalidatePath("/");
}

export async function togglePin(id: string) {
  await requireAdmin();
  if (!uuid(id)) return;
  await db().query("UPDATE bulletin_posts SET pinned = NOT pinned WHERE id = $1", [id]);
  revalidatePath("/");
}

export async function deletePost(id: string) {
  await requireAdmin();
  if (!uuid(id)) return;
  await db().query("DELETE FROM bulletin_posts WHERE id = $1", [id]);
  revalidatePath("/");
}

export async function createEvent(formData: FormData) {
  const admin = await requireAdmin();
  const title = text(formData, "title", 120);
  const type = text(formData, "type", 20) as EventType;
  const date = text(formData, "date", 10);
  const time = text(formData, "time", 5);
  const url = text(formData, "meeting_url", 500);
  const notes = text(formData, "notes", 2000);

  if (!title || !EVENT_TYPES.includes(type) || !isYmd(date)) return;
  if (time && !/^\d{2}:\d{2}$/.test(time)) return;
  if (url && !/^https?:\/\//i.test(url)) return; // links must be http(s)

  await db().query(
    "INSERT INTO events (title, type, event_date, start_time, meeting_url, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [title, type, date, time || null, url || null, notes, admin.id]
  );
  revalidatePath("/calendar");
  revalidatePath("/");
}

export async function deleteEvent(id: string) {
  await requireAdmin();
  if (!uuid(id)) return;
  await db().query("DELETE FROM events WHERE id = $1", [id]);
  revalidatePath("/calendar");
}
