import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { CreateUserForm, InviteLinkButton } from "./InviteForms";
import { newInviteLink, setUserActive, setUserRole } from "./actions";

type Row = { id: string; name: string; email: string; role: "admin" | "staff"; active: boolean; activated_at: string | null; has_password: boolean; has_google: boolean };

export default async function UsersPage() {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/"); // server-side: staff never see this page

  const { rows } = await db().query<Row>(
    `SELECT id, name, email, role, active, activated_at, (password_hash IS NOT NULL) AS has_password, (google_sub IS NOT NULL) AS has_google
       FROM users ORDER BY active DESC, role, name`
  );
  const status = (u: Row) => (!u.active ? "Deactivated" : u.activated_at ? "Active" : "Invite pending");
  const methods = (u: Row) => [u.has_password && "Password", u.has_google && "Google"].filter(Boolean).join(" and ") || "None yet";
  const small = "rounded border border-line px-3 py-1.5 text-sm hover:bg-brand-soft";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings: users and login access</h1>
      <CreateUserForm />
      <ul className="flex flex-col gap-3">
        {rows.map((u) => (
          <li key={u.id} className="rounded-lg border border-line bg-surface-raised p-4">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h2 className="font-semibold">{u.name}</h2>
              <span className="text-sm text-ink-muted">{u.email}</span>
            </div>
            <p className="mt-1 text-sm">{u.role === "admin" ? "Admin" : "Staff"}. {status(u)}. Signs in with: {methods(u)}.</p>
            <div className="mt-3 flex flex-wrap items-start gap-2">
              {u.active && <InviteLinkButton action={newInviteLink.bind(null, u.id)} label={u.activated_at ? "New sign-in link (reset)" : "New invite link"} />}
              <form action={setUserRole.bind(null, u.id, u.role === "admin" ? "staff" : "admin")}>
                <button className={small}>{u.role === "admin" ? "Make staff" : "Make admin"}</button>
              </form>
              <form action={setUserActive.bind(null, u.id, !u.active)}>
                <button className={`${small} ${u.active ? "text-danger" : ""}`}>{u.active ? "Deactivate" : "Reactivate"}</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-ink-muted">The last active admin cannot be deactivated or made staff.</p>
    </div>
  );
}
