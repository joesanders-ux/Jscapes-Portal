import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { readStoredFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Streams one picture of an equipment list item, to a signed-in user only.
// ?size=thumb gives the small preview; ?download=1 saves the full photo.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });

  const { rows } = await db().query("SELECT storage_key, thumb_key, content_type, original_filename FROM equipment_images WHERE id = $1", [params.id]);
  const row = rows[0];
  if (!row) return new Response("Not found", { status: 404 });

  const q = new URL(req.url).searchParams;
  const thumb = q.get("size") === "thumb";
  let data: Buffer;
  try {
    data = await readStoredFile(thumb ? row.thumb_key : row.storage_key);
  } catch {
    return new Response("This photo is missing from storage.", { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": thumb ? "image/jpeg" : String(row.content_type),
    "Content-Length": String(data.length),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": thumb ? "private, max-age=3600" : "private, no-store",
  };
  if (!thumb && q.get("download") === "1") {
    const safe = String(row.original_filename).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "photo";
    headers["Content-Disposition"] = `attachment; filename="${safe}"`;
  }
  return new Response(new Uint8Array(data), { headers });
}
