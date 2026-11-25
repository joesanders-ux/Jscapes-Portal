import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { readStoredFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Streams one equipment manual to a signed-in user. Files are never served from a public folder,
// so a link only works for people who are signed in. The id is the manual's own id. An older link that
// used the equipment's id still works and opens that item's first manual.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });

  const { rows } = await db().query<{ storage_key: string; original_filename: string; name: string }>(
    `SELECT m.storage_key, m.original_filename, e.name
       FROM equipment_manuals m JOIN equipment e ON e.id = m.equipment_id
      WHERE m.id = $1 OR m.equipment_id = $1
      ORDER BY (m.id = $1) DESC, m.created_at
      LIMIT 1`,
    [params.id]
  );
  const row = rows[0];
  if (!row) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await readStoredFile(row.storage_key);
  } catch {
    return new Response("This manual is missing from storage. Ask an administrator to upload it again.", { status: 404 });
  }

  const base = row.original_filename.replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
  const slug = base || row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "manual";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${slug}.pdf"`,
      "Content-Length": String(data.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
