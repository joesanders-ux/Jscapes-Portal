import Link from "next/link";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { SideNav } from "./SideNav";
import { signOut } from "@/app/signin/actions";
import type { SessionUser } from "@/lib/auth";

// Only sections that exist are linked. Add entries as sections are built.
const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/calendar", label: "Team calendar" },
  { href: "/health-safety", label: "Health and Safety" },
  { href: "/vans", label: "Van Compliance" },
  { href: "/equipment", label: "Equipment Maintenance" },
  { href: "/availability", label: "Availability" },
  { href: "/shifts", label: "Shifts" },
  { href: "/policies", label: "Policies and Handbooks" },
  { href: "/job-images", label: "Job Images" },
];

/**
 * Navigation, in two forms that swap at the `lg` breakpoint (1024px):
 *  - below it: a top bar with a hamburger menu
 *  - at and above it: a fixed sidebar down the left of the page
 * The light-green focus ring keeps keyboard focus visible on the dark background.
 */
export function Nav({ user }: { user: SessionUser }) {
  // Timesheets and Settings are for administrators only.
  const links = user.role === "admin" ? [...LINKS, { href: "/timesheets", label: "Timesheets" }, { href: "/settings/users", label: "Settings" }] : LINKS;
  const userLabel = `${user.name} (${user.role === "admin" ? "Admin" : "Staff"})`;

  return (
    <>
      {/* Phones and small tablets. `relative` anchors the dropdown panel under the bar. */}
      <header className="relative bg-header text-header-ink lg:hidden [&_:focus-visible]:outline-brand">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="Dashboard"><Logo height={32} /></Link>
          <MobileMenu links={links} userLabel={userLabel}>
            <form action={signOut}>
              <button className="w-full rounded border border-white/60 px-3 py-2.5 font-medium hover:bg-white/10">Sign out</button>
            </form>
          </MobileMenu>
        </div>
      </header>

      {/* Large screens: sidebar. Stays in view while the page scrolls. */}
      <aside className="hidden bg-header text-header-ink lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col [&_:focus-visible]:outline-brand">
        <Link href="/" aria-label="Dashboard" className="block px-6 py-6"><Logo height={40} /></Link>
        <SideNav links={links} />
        <div className="border-t border-white/15 p-4">
          {/* A long name is cut short with an ellipsis rather than wrapping */}
          <p className="truncate text-sm opacity-80" title={userLabel}>{userLabel}</p>
          <form action={signOut} className="mt-3">
            <button className="w-full whitespace-nowrap rounded border border-white/60 px-3 py-2 text-sm font-medium hover:bg-white/10">Sign out</button>
          </form>
        </div>
      </aside>
    </>
  );
}
