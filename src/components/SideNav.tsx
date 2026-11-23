"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath, type NavLink } from "../lib/nav";

/** The vertical link list in the desktop sidebar. Marks the current page. Scrolls on its own if the list gets long. */
export function SideNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-2">
      <ul className="flex flex-col gap-1">
        {links.map((l) => {
          const active = isActivePath(pathname, l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded border-l-4 px-3 py-2.5 text-sm font-medium hover:bg-white/10 ${
                  active ? "border-brand bg-white/10" : "border-transparent"
                }`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
