export const offlineRoutes = [
  "/dashboard",
  "/products",
  "/sales",
  "/pos",
  "/expenses",
  "/reports",
  "/alerts",
  "/settings",
] as const;

export function isOfflineRoute(pathname: string): boolean {
  return offlineRoutes.some((route) => pathname === route);
}
