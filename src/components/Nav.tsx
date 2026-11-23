import Link from "next/link";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { signOut } from "@/app/signin/actions";
import type { SessionUser } from "@/lib/auth";

// Only sections that exist are linked. Add entries as sections are built.
const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/calendar", label: "Team calendar" },
  { href: "/health-safety", label: "Health and Safety" },
];

export function Nav({ user }: { user: SessionUser }) {
  const links = user.role === "admin" ? [...LINKS, { href: "/settings/users", label: "Settings" }] : LINKS;
  const userLabel = `${user.name} (${user.role === "admin" ? "Admin" : "Staff"})`;

  return (
    // `relative` anchors the mobile menu panel under the header. The light-green focus ring
    // keeps keyboard focus visible on the dark background.
    <header className="relative bg-header text-header-ink [&_:focus-visible]:outline-brand">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-3">
        <Link href="/" aria-label="Dashboard"><Logo height={32} /></Link>

        {/* Large screens: full bar */}
        <nav aria-label="Main" className="hidden flex-1 gap-1 lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap rounded px-3 py-2 text-sm font-medium hover:bg-white/10">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 text-sm lg:flex">
          <span>{userLabel}</span>
          <form action={signOut}>
            <button className="rounded border border-white/60 px-3 py-1.5 hover:bg-white/10">Sign out</button>
          </form>
        </div>

        {/* Small screens: hamburger menu */}
        <MobileMenu links={links} userLabel={userLabel}>
          <form action={signOut}>
            <button className="w-full rounded border border-white/60 px-3 py-2.5 font-medium hover:bg-white/10">Sign out</button>
          </form>
        </MobileMenu>
      </div>
    </header>
  );
}
