"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { isKind } from "@/lib/policies-shared";
import { deleteFile, readPdfUpload, saveFile, storageConfigured } from "@/lib/storage";

const PAGE = "/policies";
const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

// Every action re-checks the admin role on the server. Hiding the form from staff is not security.

export async function addDocument(formData: FormData) {
  const admin = await requireAdmin();
  if (!storageConfigured()) redirect(`${PAGE}?error=storage`);

  const title = String(formData.get("title") ?? "").trim().slice(0, 150);
  const kindRaw = String(formData.get("kind") ?? "policy");
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  if (!title) redirect(`${PAGE}?error=title`);
  if (!isKind(kindRaw)) redirect(`${PAGE}?error=kind`);
  const pdf = await readPdfUpload(formData.get("file"));
  if (pdf === null) redirect(`${PAGE}?error=nofile`);
  if ("error" in pdf) redirect(`${PAGE}?error=${pdf.error}`);

  const key = `${randomUUID()}.pdf`;
  await saveFile(key, pdf.buf);
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const doc = await client.query("INSERT INTO policy_documents (title, kind, created_by) VALUES ($1, $2, $3) RETURNING id", [title, kindRaw, admin.id]);
    await client.query(
      `INSERT INTO policy_versions (document_id, version_number, is_current, original_filename, size_bytes, storage_key, note, uploaded_by)
       VALUES ($1, 1, true, $2, $3, $4, $5, $6)`,
      [doc.rows[0].id, pdf.name, pdf.buf.length, key, note, admin.id]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    await deleteFile(key); // don't leave an orphan file behind
    throw err;
  } finally {
    client.release();
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?done=added`);
}

/** Adds a new version. The old current version is kept as a previous version, never replaced. */
export async function addVersion(documentId: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!uuid(documentId)) redirect(`${PAGE}?error=missing`);
  if (!storageConfigured()) redirect(`${PAGE}?error=storage`);

  const note = String(formData.get("note") ?? "").trim().slice(0, 500);
  const pdf = await readPdfUpload(formData.get("file"));
  if (pdf === null) redirect(`${PAGE}?error=nofile`);
  if ("error" in pdf) redirect(`${PAGE}?error=${pdf.error}`);

  const key = `${randomUUID()}.pdf`;
  await saveFile(key, pdf.buf);
  const client = await db().connect();
  let problem: "missing" | "archived" | null = null;
  try {
    await client.query("BEGIN");
    const lock = await client.query("SELECT archived_at FROM policy_documents WHERE id = $1 FOR UPDATE", [documentId]);
    if (!lock.rows[0] || lock.rows[0].archived_at) {
      problem = lock.rows[0] ? "archived" : "missing"; // an archived document must be restored first
      await client.query("ROLLBACK");
    } else {
      const next = await client.query("SELECT COALESCE(MAX(version_number), 0) + 1 AS n FROM policy_versions WHERE document_id = $1", [documentId]);
      await client.query("UPDATE policy_versions SET is_current = false WHERE document_id = $1 AND is_current", [documentId]);
      await client.query(
        `INSERT INTO policy_versions (document_id, version_number, is_current, original_filename, size_bytes, storage_key, note, uploaded_by)
         VALUES ($1, $2, true, $3, $4, $5, $6, $7)`,
        [documentId, next.rows[0].n, pdf.name, pdf.buf.length, key, note, admin.id]
      );
      await client.query("COMMIT");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    await deleteFile(key);
    throw err;
  } finally {
    client.release();
  }
  if (problem) {
    await deleteFile(key);
    redirect(`${PAGE}?error=${problem}`);
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?done=version`);
}

/** Hides a document from staff. Nothing is deleted: all versions and files are kept. */
export async function archiveDocument(documentId: string) {
  const admin = await requireAdmin();
  if (!uuid(documentId)) redirect(`${PAGE}?error=missing`);
  const res = await db().query(
    "UPDATE policy_documents SET archived_at = now(), archived_by = $2 WHERE id = $1 AND archived_at IS NULL",
    [documentId, admin.id]
  );
  revalidatePath(PAGE);
  redirect(`${PAGE}?${res.rowCount ? "done=archived" : "error=missing"}`);
}

export async function restoreDocument(documentId: string) {
  await requireAdmin();
  if (!uuid(documentId)) redirect(`${PAGE}?error=missing`);
  const res = await db().query(
    "UPDATE policy_documents SET archived_at = NULL, archived_by = NULL WHERE id = $1 AND archived_at IS NOT NULL",
    [documentId]
  );
  revalidatePath(PAGE);
  redirect(`${PAGE}?${res.rowCount ? "done=restored" : "error=missing"}`);
}
