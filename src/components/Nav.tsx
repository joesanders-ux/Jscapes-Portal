import Link from "next/link";
import { Logo } from "./Logo";
import { signOut } from "@/app/signin/actions";
import type { SessionUser } from "@/lib/auth";

// Only sections that exist are linked. Add entries as sections are built.
const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/calendar", label: "Team calendar" },
  { href: "/health-safety", label: "Health and Safety" },
];

export function Nav({ user }: { user: SessionUser }) {
  return (
    <header className="bg-header text-header-ink">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" aria-label="Dashboard"><Logo height={32} /></Link>
        <nav aria-label="Main" className="flex flex-1 gap-1 overflow-x-auto">
          {(user.role === "admin" ? [...LINKS, { href: "/settings/users", label: "Settings" }] : LINKS).map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap rounded px-3 py-2 text-sm font-medium hover:bg-white/10">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {user.name} ({user.role === "admin" ? "Admin" : "Staff"})
          </span>
          <form action={signOut}>
            <button className="rounded border border-white/60 px-3 py-1.5 hover:bg-white/10">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
