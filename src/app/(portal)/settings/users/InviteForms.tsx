"use client";
import { useState } from "react";
import { useFormState } from "react-dom";
import { createUser, type InviteState } from "./actions";

function LinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 rounded border border-brand bg-brand-soft p-3">
      <p className="text-sm font-medium">Invite link (shown once). Copy it and send it to them yourself. It works once and expires in 7 days.</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" className="min-w-0 flex-1 rounded border border-line bg-white px-3 py-2 text-sm" />
        <button
          type="button"
          onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-brand-ink hover:bg-brand-dark"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}

const initial: InviteState = {};

export function CreateUserForm() {
  const [state, action] = useFormState(createUser, initial);
  return (
    <form action={action} className="rounded-lg border border-line bg-surface-raised p-4">
      <h2 className="font-semibold">Add a user</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium">Name
          <input name="name" required maxLength={100} className="rounded border border-line px-3 py-2 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Email
          <input name="email" type="email" required className="rounded border border-line px-3 py-2 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">Role
          <select name="role" className="rounded border border-line bg-white px-3 py-2 font-normal">
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>
      <button className="mt-3 rounded bg-brand px-4 py-2 font-medium text-brand-ink hover:bg-brand-dark">Create user and invite link</button>
      {state.error && <p role="alert" className="mt-3 text-sm text-danger">{state.error}</p>}
      {state.link && <LinkBox link={state.link} />}
    </form>
  );
}

export function InviteLinkButton({ action, label }: { action: (prev: InviteState, fd: FormData) => Promise<InviteState>; label: string }) {
  const [state, formAction] = useFormState(action, initial);
  return (
    <form action={formAction}>
      <button className="rounded border border-line px-3 py-1.5 text-sm hover:bg-brand-soft">{label}</button>
      {state.error && <p role="alert" className="mt-2 text-sm text-danger">{state.error}</p>}
      {state.link && <LinkBox link={state.link} />}
    </form>
  );
}
