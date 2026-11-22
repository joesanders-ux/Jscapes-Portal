import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import { randomToken, sha256 } from "./security";

export const INVITE_DAYS = 7;

/** Public base URL. Set APP_URL in production; otherwise derived from the request. */
export async function appUrl(): Promise<string> {
  const env = process.env.APP_URL?.replace(/\/+$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Creates a one-time invite link (replacing any unused one for that user). */
export async function createInvite(userId: string, createdBy: string | null): Promise<string> {
  const token = randomToken();
  await db().query("DELETE FROM invites WHERE user_id = $1 AND used_at IS NULL", [userId]);
  await db().query(
    "INSERT INTO invites (token_hash, user_id, expires_at, created_by) VALUES ($1, $2, now() + make_interval(days => $3::int), $4)",
    [sha256(token), userId, INVITE_DAYS, createdBy]
  );
  return `${await appUrl()}/invite/${token}`;
}

export type InviteInfo = { user_id: string; name: string; email: string };

export async function findValidInvite(token: string): Promise<InviteInfo | null> {
  const { rows } = await db().query(
    `SELECT u.id AS user_id, u.name, u.email
       FROM invites i JOIN users u ON u.id = i.user_id
      WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > now() AND u.active`,
    [sha256(token)]
  );
  return (rows[0] as InviteInfo) ?? null;
}

/** Atomically uses up an invite. Returns the user id, or null if invalid, expired or already used. */
export async function consumeInvite(token: string): Promise<string | null> {
  const { rows } = await db().query(
    `UPDATE invites i SET used_at = now() FROM users u
      WHERE i.token_hash = $1 AND i.used_at IS NULL AND i.expires_at > now()
        AND u.id = i.user_id AND u.active
  RETURNING i.user_id`,
    [sha256(token)]
  );
  return rows[0]?.user_id ?? null;
}
