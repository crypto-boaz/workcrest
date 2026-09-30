export const offlineRoutes = [
  "/dashboard",
  "/products",
  "/sales",
  "/pos",
  "/job-cards",
  "/expenses",
  "/reports",
  "/alerts",
  "/settings",
] as const;

export function isOfflineRoute(pathname: string): boolean {
  return offlineRoutes.some((route) => pathname === route);
}
