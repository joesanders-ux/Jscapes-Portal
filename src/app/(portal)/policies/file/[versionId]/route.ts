import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { readStoredFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Streams one stored PDF to a signed-in user. Files are never served from a public folder,
// so a link only works for people who are signed in. `?download=1` saves the file instead of showing it.
export async function GET(req: Request, { params }: { params: { versionId: string } }) {
  const user = await getSessionUser();
  if (!user) return new Response("Not found", { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(params.versionId)) return new Response("Not found", { status: 404 });

  const { rows } = await db().query(
    `SELECT v.storage_key, v.version_number, d.title, d.archived_at
       FROM policy_versions v JOIN policy_documents d ON d.id = v.document_id
      WHERE v.id = $1`,
    [params.versionId]
  );
  const row = rows[0];
  // Archived documents are admin-only, even for someone who kept an old link.
  if (!row || (row.archived_at && user.role !== "admin")) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await readStoredFile(row.storage_key);
  } catch {
    return new Response("This file is missing from storage. Ask an administrator to upload it again.", { status: 404 });
  }

  const download = new URL(req.url).searchParams.get("download") === "1";
  const slug = String(row.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${slug}-v${row.version_number}.pdf"`,
      "Content-Length": String(data.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
