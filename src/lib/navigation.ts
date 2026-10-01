import {
  Bell,
  Boxes,
  ChartNoAxesCombined,
  ClipboardList,
  LayoutDashboard,
  PackageOpen,
  ReceiptText,
  RotateCcw,
  ShoppingCart,
  SlidersHorizontal,
  Users,
  WalletCards,
} from "lucide-react";

export const navigation = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Products", href: "/products", icon: Boxes },
  { label: "Sales", href: "/sales", icon: ReceiptText },
  { label: "Point of sale", href: "/pos", icon: ShoppingCart },
  { label: "Job cards", href: "/job-cards", icon: ClipboardList },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Purchases", href: "/purchases", icon: PackageOpen },
  { label: "Returns", href: "/returns", icon: RotateCcw },
  { label: "People", href: "/people", icon: ClipboardList },
  { label: "Expenses", href: "/expenses", icon: WalletCards },
  { label: "Reports", href: "/reports", icon: ChartNoAxesCombined },
  { label: "Alerts", href: "/alerts", icon: Bell },
] as const;

export const secondaryNavigation = [
  { label: "Settings", href: "/settings", icon: SlidersHorizontal },
] as const;

// These routes intentionally show the platform-owner restriction in tenant workspaces.
export const tenantNavigation = navigation.filter(
  (item) => item.href !== "/customers" && item.href !== "/purchases",
);

export const validSections = [
  ...navigation.filter((item) => item.href !== "/dashboard"),
  ...secondaryNavigation,
];
