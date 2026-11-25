"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { markAllNotificationsRead, markNotificationRead } from "@/app/(portal)/notifications/actions";

export type MenuNotification = { id: string; message: string; link: string | null; when: string };

/**
 * The bell at the top of the menu. The number beside it is the unread count (a number, never colour alone).
 * Pressing it opens a list of what the notifications are for; each one can be opened (which marks it read) or
 * marked as read. On phones the list drops down under the header; on desktop it opens beside the sidebar.
 */
export function NotificationMenu({ unread, notifications }: { unread: number; notifications: MenuNotification[] }) {
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

  const label = unread === 0 ? "Notifications: none unread" : `Notifications: ${unread} unread`;
  const more = unread - notifications.length;

  return (
    // Not positioned on phones, so the list can span the whole header; positioned from lg up, where it hangs under the bell.
    <div ref={wrapRef} className="lg:relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="notification-list"
        aria-label={label}
        title={label}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded hover:bg-white/10"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span aria-hidden="true" className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold text-brand-ink">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-list"
          role="region"
          aria-label="Notifications"
          className="absolute inset-x-0 top-full z-50 max-h-[70vh] overflow-y-auto border-t border-white/15 bg-white text-ink shadow-[0_8px_16px_rgba(0,0,0,0.25)] lg:inset-x-auto lg:left-0 lg:top-full lg:mt-1 lg:w-96 lg:rounded-lg lg:border lg:border-line"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="font-semibold">{unread === 0 ? "No new notifications" : `Notifications (${unread})`}</h2>
            {unread > 1 && (
              <form action={markAllNotificationsRead}>
                <button className="rounded border border-line bg-white px-3 py-1.5 text-sm hover:bg-brand-soft">Mark all as read</button>
              </form>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-4 text-sm text-ink-muted">You are up to date.</p>
          ) : (
            <ul>
              {notifications.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
                  <div className="min-w-0 text-sm">
                    {n.link ? (
                      // Opening it marks it read. The page change closes the list.
                      <Link href={n.link} onClick={() => void markNotificationRead(n.id)} className="font-medium text-brand-text underline">
                        {n.message}
                      </Link>
                    ) : (
                      <p className="font-medium">{n.message}</p>
                    )}
                    <p className="mt-0.5 text-xs text-ink-muted">{n.when}</p>
                  </div>
                  <form action={markNotificationRead.bind(null, n.id)} className="shrink-0">
                    <button className="rounded border border-line bg-white px-2.5 py-1 text-xs hover:bg-brand-soft">
                      Mark read<span className="sr-only">: {n.message}</span>
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {more > 0 && <p className="border-t border-line px-4 py-3 text-sm text-ink-muted">And {more} more. Open the Dashboard to see them all.</p>}
        </div>
      )}
    </div>
  );
}
