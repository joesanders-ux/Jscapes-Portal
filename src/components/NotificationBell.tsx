import Link from "next/link";

/**
 * The bell at the top of the menu. It shows how many notifications are unread, as a number (never colour alone),
 * and links to the Notifications panel on the Dashboard.
 */
export function NotificationBell({ unread }: { unread: number }) {
  const label = unread === 0 ? "Notifications: none unread" : `Notifications: ${unread} unread`;
  return (
    <Link
      href={unread > 0 ? "/#notices" : "/"}
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
    </Link>
  );
}
