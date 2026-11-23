// Shared by the sidebar and the mobile menu.
export type NavLink = { href: string; label: string };

/** True when `href` is the page you are on, or a parent of it ("/vans" is active on "/vans?tab=records"). */
export const isActivePath = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
