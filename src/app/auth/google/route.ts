import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { appUrl } from "@/lib/invites";
import { googleAuthUrl, googleEnabled } from "@/lib/google";
import { randomToken } from "@/lib/security";

export const dynamic = "force-dynamic";

// Starts Google sign-in. With ?invite=<token> it finishes an invite; without it, signs in an existing user.
export async function GET(req: NextRequest) {
  const base = await appUrl();
  if (!googleEnabled()) return NextResponse.redirect(`${base}/signin?error=google`);

  const state = randomToken();
  const nonce = randomToken();
  const invite = req.nextUrl.searchParams.get("invite") ?? undefined;
  (await cookies()).set("jscapes_oauth", JSON.stringify({ state, nonce, invite }), {
    httpOnly: true,
    sameSite: "lax", // must survive the redirect back from Google
    secure: process.env.NODE_ENV === "production",
    path: "/auth/google",
    maxAge: 600,
  });
  return NextResponse.redirect(googleAuthUrl(`${base}/auth/google/callback`, state, nonce));
}
