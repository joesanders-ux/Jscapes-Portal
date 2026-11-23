// Limits and labels for Job Images. No server-only code here.
export const MAX_FILES_PER_UPLOAD = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 45 * 1024 * 1024;
/** The most images one ZIP download will contain. */
export const MAX_ZIP_IMAGES = 150;
export const MAX_ZIP_BYTES = 300 * 1024 * 1024;

export const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Folder label for a job reference ("" means none was entered). */
export const folderLabel = (ref: string) => (ref ? `Job ${ref}` : "No job reference");

/** A file-name-safe version of free text. */
export const slug = (s: string, max = 40) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max);
