import "server-only";

export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function googleAuthUrl(redirectUri: string, state: string, nonce: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email",
    state,
    nonce,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

/**
 * Exchanges the authorisation code for the user's verified Google identity.
 * The ID token comes straight from Google's token endpoint over TLS, so (per OpenID Connect Core 3.1.3.7)
 * its claims are checked here rather than re-verifying a signature.
 */
export async function googleIdentity(code: string, redirectUri: string, nonce: string): Promise<{ sub: string; email: string } | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) return null;
  const claims = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url").toString("utf8"));
  const okIssuer = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  if (!okIssuer || claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.nonce !== nonce) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
  if (claims.email_verified !== true || !claims.sub || !claims.email) return null;
  return { sub: String(claims.sub), email: String(claims.email).toLowerCase() };
}
