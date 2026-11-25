import { requireUser } from "@/lib/auth";
import { PortalShell } from "@/components/PortalShell";
import { unreadNotificationCount, unreadNotifications } from "@/lib/shifts";

export const dynamic = "force-dynamic";

// Every page in this group requires sign-in.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [unread, list] = await Promise.all([unreadNotificationCount(user.id), unreadNotifications(user.id)]);
  // Pre-formatted here (UK time) so the browser only has to show it.
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const notifications = list.map((n) => ({ id: n.id, message: n.message, link: n.link, when: fmt.format(n.created_at) }));
  return <PortalShell user={user} unread={unread} notifications={notifications}>{children}</PortalShell>;
}
