import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { startSession } from "@/lib/auth";
import { appUrl, consumeInvite, findValidInvite } from "@/lib/invites";
import { googleIdentity } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const base = await appUrl();
  const fail = (path: string) => NextResponse.redirect(`${base}${path}`);

  const jar = await cookies();
  const raw = jar.get("jscapes_oauth")?.value;
  jar.delete("jscapes_oauth");
  let saved: { state: string; nonce: string; invite?: string };
  try { saved = JSON.parse(raw ?? ""); } catch { return fail("/signin?error=google"); }

  const code = req.nextUrl.searchParams.get("code");
  if (!code || req.nextUrl.searchParams.get("state") !== saved.state) return fail("/signin?error=google");

  const who = await googleIdentity(code, `${base}/auth/google/callback`, saved.nonce);
  if (!who) return fail("/signin?error=google");

  let userId: string | null = null;
  if (saved.invite) {
    // Finishing an invite: the Google email must match the email the invite was created for.
    const invite = await findValidInvite(saved.invite);
    const back = `/invite/${encodeURIComponent(saved.invite)}`;
    if (!invite) return fail(back);
    if (invite.email.toLowerCase() !== who.email) return fail(`${back}?error=google`);
    userId = await consumeInvite(saved.invite);
    if (!userId) return fail(back);
    try {
      await db().query("UPDATE users SET google_sub = $2, activated_at = COALESCE(activated_at, now()) WHERE id = $1", [userId, who.sub]);
    } catch {
      return fail(`${back}?error=google`); // this Google account is already linked to another user
    }
  } else {
    // Normal sign-in: only users who already linked this Google account.
    const { rows } = await db().query("SELECT id FROM users WHERE google_sub = $1 AND active", [who.sub]);
    userId = rows[0]?.id ?? null;
    if (!userId) return fail("/signin?error=no-account");
  }

  await startSession(userId);
  return fail("/");
}
