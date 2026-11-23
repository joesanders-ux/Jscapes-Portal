"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type NavLink = { href: string; label: string };

/**
 * Hamburger menu for small screens (hidden from the `lg` breakpoint up, where the full bar shows).
 * The panel overlays the page under the header. It closes when you pick a link, press Escape,
 * or tap outside it. `children` is the sign-out form, rendered on the server.
 */
export function MobileMenu({ links, userLabel, children }: { links: NavLink[]; userLabel: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close after navigating to another page.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div ref={wrapRef} className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="-mr-2 flex h-11 w-11 items-center justify-center rounded hover:bg-white/10"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full z-50 border-t border-white/15 bg-header shadow-[0_8px_16px_rgba(0,0,0,0.25)]">
          <nav aria-label="Main" className="mx-auto max-w-5xl py-2">
            <ul>
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(l.href) ? "page" : undefined}
                    className={`block border-l-4 px-4 py-3 text-base font-medium hover:bg-white/10 ${
                      isActive(l.href) ? "border-brand bg-white/10" : "border-transparent"
                    }`}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mx-auto max-w-5xl border-t border-white/15 px-4 py-4">
            <p className="mb-3 text-sm opacity-80">{userLabel}</p>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
