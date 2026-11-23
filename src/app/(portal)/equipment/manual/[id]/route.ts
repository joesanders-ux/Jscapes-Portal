import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { readStoredFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Streams one equipment manual to a signed-in user. Files are never served from a public folder,
// so a link only works for people who are signed in.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });

  const { rows } = await db().query<{ manual_key: string | null; name: string }>("SELECT manual_key, name FROM equipment WHERE id = $1", [params.id]);
  const row = rows[0];
  if (!row?.manual_key) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await readStoredFile(row.manual_key);
  } catch {
    return new Response("This manual is missing from storage. Ask an administrator to upload it again.", { status: 404 });
  }

  const slug = row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "manual";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${slug}-manual.pdf"`,
      "Content-Length": String(data.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
