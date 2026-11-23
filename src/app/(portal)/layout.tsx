import { requireUser } from "@/lib/auth";
import { PortalShell } from "@/components/PortalShell";

export const dynamic = "force-dynamic";

// Every page in this group requires sign-in.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <PortalShell user={user}>{children}</PortalShell>;
}
