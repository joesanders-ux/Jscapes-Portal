import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { EXT, slug } from "@/lib/job-images-shared";
import { readStoredFile } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Streams one stored image to a signed-in user. Files are never served from a public folder.
// ?size=thumb gives the small preview; ?download=1 saves the full image instead of showing it.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user || !/^[0-9a-f-]{36}$/i.test(params.id)) return new Response("Not found", { status: 404 });

  const { rows } = await db().query(
    "SELECT storage_key, thumb_key, content_type, job_date, job_ref FROM job_images WHERE id = $1",
    [params.id]
  );
  const row = rows[0];
  if (!row) return new Response("Not found", { status: 404 });

  const q = new URL(req.url).searchParams;
  const thumb = q.get("size") === "thumb";
  const download = !thumb && q.get("download") === "1";

  let data: Buffer;
  try {
    data = await readStoredFile(thumb ? row.thumb_key : row.storage_key);
  } catch {
    return new Response("This image is missing from storage.", { status: 404 });
  }

  const headers: Record<string, string> = {
    "Content-Type": thumb ? "image/jpeg" : String(row.content_type),
    "Content-Length": String(data.length),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    // Thumbnails never change, so the browser may keep them briefly; full images are not cached.
    "Cache-Control": thumb ? "private, max-age=3600" : "private, no-store",
  };
  if (download) {
    const base = [String(row.job_date), slug(String(row.job_ref), 30)].filter(Boolean).join("-");
    headers["Content-Disposition"] = `attachment; filename="${base}-${String(params.id).slice(0, 8)}.${EXT[row.content_type as string] ?? "jpg"}"`;
  }
  return new Response(new Uint8Array(data), { headers });
}
