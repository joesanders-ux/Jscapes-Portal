import { Nav } from "./Nav";
import type { SessionUser } from "@/lib/auth";

/**
 * The page frame for everything behind sign-in: navigation plus the main content.
 * Below 1024px the navigation is a top bar stacked above the content; from 1024px it is a sidebar beside it.
 */
export function PortalShell({ user, unread, children }: { user: SessionUser; unread: number; children: React.ReactNode }) {
  return (
    <div className="lg:flex lg:min-h-screen">
      {/* First thing a keyboard user reaches, so they can skip past the menu */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-ink focus:shadow"
      >
        Skip to main content
      </a>
      <Nav user={user} unread={unread} />
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none lg:px-8 lg:py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
