import { findValidInvite, INVITE_DAYS } from "@/lib/invites";
import { googleEnabled } from "@/lib/google";
import { Logo } from "@/components/Logo";
import { acceptWithPassword } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  short: "Use at least 10 characters for your password.",
  mismatch: "The two passwords do not match.",
  google: "That Google account does not match the email this invite was sent for. Use the invited email address or set a password instead.",
};

export default async function InvitePage({ params, searchParams }: { params: { token: string }; searchParams: { error?: string } }) {
  const invite = await findValidInvite(params.token);
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Logo height={56} />
      {!invite ? (
        <>
          <h1 className="text-2xl font-semibold">This invite link no longer works</h1>
          <p>Invite links work once and expire after {INVITE_DAYS} days. Ask an administrator to send you a new one.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">Welcome, {invite.name}</h1>
          <p className="text-sm text-ink-muted">Set up sign-in for {invite.email}.</p>
          {error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{error}</p>}
          <form action={acceptWithPassword.bind(null, params.token)} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
            <label className="flex flex-col gap-1 text-sm font-medium">Choose a password (10 characters or more)
              <input name="password" type="password" required minLength={10} autoComplete="new-password" className="rounded border border-line px-3 py-2 font-normal" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Repeat the password
              <input name="confirm" type="password" required minLength={10} autoComplete="new-password" className="rounded border border-line px-3 py-2 font-normal" />
            </label>
            <button className="rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark">Save password and sign in</button>
          </form>
          {googleEnabled() && (
            <a href={`/auth/google?invite=${encodeURIComponent(params.token)}`} className="rounded border border-line bg-surface-raised px-4 py-2 text-center font-medium hover:bg-brand-soft">
              Or continue with Google
            </a>
          )}
        </>
      )}
    </main>
  );
}
