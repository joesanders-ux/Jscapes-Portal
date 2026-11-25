import { requireUser } from "@/lib/auth";
import { PortalShell } from "@/components/PortalShell";
import { unreadNotificationCount } from "@/lib/shifts";

export const dynamic = "force-dynamic";

// Every page in this group requires sign-in.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const unread = await unreadNotificationCount(user.id);
  return <PortalShell user={user} unread={unread}>{children}</PortalShell>;
}
