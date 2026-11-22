import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { googleEnabled } from "@/lib/google";
import { Logo } from "@/components/Logo";
import { signIn } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Incorrect email or password, or the account is temporarily locked. Try again in a few minutes.",
  google: "Google sign-in did not work. Try again, or use your email and password.",
  "no-account": "That Google account is not linked to a portal user. Use the invite link an administrator sent you.",
};

export default async function SignInPage({ searchParams }: { searchParams: { error?: string } }) {
  if (await getSessionUser()) redirect("/");
  const error = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Logo height={56} />
      <h1 className="text-2xl font-semibold">Staff portal sign-in</h1>
      {error && <p role="alert" className="rounded border border-danger bg-white p-3 text-sm text-danger">{error}</p>}
      <form action={signIn} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
        <label className="flex flex-col gap-1 text-sm font-medium">Email
          <input name="email" type="email" required autoComplete="username" className="rounded border border-line px-3 py-2 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Password
          <input name="password" type="password" required autoComplete="current-password" className="rounded border border-line px-3 py-2 font-normal" />
        </label>
        <button className="rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark">Sign in</button>
      </form>
      {googleEnabled() && (
        <a href="/auth/google" className="rounded border border-line bg-surface-raised px-4 py-2 text-center font-medium hover:bg-brand-soft">
          Sign in with Google
        </a>
      )}
      <p className="text-sm text-ink-muted">There is no sign-up. An administrator sends you an invite link to get started.</p>
    </main>
  );
}
