// Shared by seed.mjs and create-admin.mjs. Mirrors src/lib/invites.ts and security.ts
// (token = 32 random bytes as base64url; only its SHA-256 hash is stored).
import { randomBytes, createHash } from "node:crypto";

export const INVITE_DAYS = 7;
export const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

export async function createInvite(client, userId) {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await client.query("DELETE FROM invites WHERE user_id = $1 AND used_at IS NULL", [userId]);
  await client.query(
    "INSERT INTO invites (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3::int))",
    [hash, userId, INVITE_DAYS]
  );
  return `${appUrl()}/invite/${token}`;
}

export function connect(pg) {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  return new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
}
