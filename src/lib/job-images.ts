import "server-only";
import sharp from "sharp";
import { MAX_IMAGE_BYTES } from "./job-images-shared";

export type ProcessedImage = {
  buf: Buffer;
  name: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  thumb: Buffer;
};

const TYPES: Record<string, ProcessedImage["contentType"]> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Checks that an uploaded file really is a JPEG, PNG or WebP picture (it must decode, not just be named .jpg)
 * and makes its thumbnail. Returns an error code for the page to show, never throws for a bad file.
 */
export async function processImage(file: File): Promise<ProcessedImage | { error: "toobig" | "notimage" }> {
  if (file.size > MAX_IMAGE_BYTES) return { error: "toobig" };
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const input = () => sharp(buf, { limitInputPixels: 100_000_000, failOn: "error" });
    const meta = await input().metadata();
    const contentType = meta.format ? TYPES[meta.format] : undefined;
    if (!contentType || !meta.width || !meta.height) return { error: "notimage" };
    // .rotate() applies the camera's orientation so thumbnails are the right way up.
    const thumb = await input().rotate().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
    return { buf, name: file.name.slice(0, 200) || "image", contentType, width: meta.width, height: meta.height, thumb };
  } catch {
    return { error: "notimage" };
  }
}
