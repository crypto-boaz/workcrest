import type { DashboardData, SalesPoint } from "@/lib/types";

const day = 86_400_000;

function buildSalesSeries(days: number, scale = 1): SalesPoint[] {
  const now = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now.getTime() - (days - index - 1) * day);
    const weekday = date.getDay();
    const weekendLift = weekday === 5 || weekday === 6 ? 1.18 : 1;
    const rhythm = 0.85 + ((index * 37) % 45) / 100;
    const sales =
      Math.round((164_000 * rhythm * weekendLift * scale) / 1000) * 1000;

    return {
      date: date.toISOString(),
      label: new Intl.DateTimeFormat("en-NG", {
        day: days > 7 ? "numeric" : undefined,
        month: days > 7 ? "short" : undefined,
        weekday: days <= 7 ? "short" : undefined,
      }).format(date),
      sales,
      transactions: Math.round(sales / 8_700),
    };
  });
}

const now = new Date();
const atToday = (hour: number, minute: number) => {
  const value = new Date(now);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
};

export const mockDashboardData: DashboardData = {
  businessName: "Timphat Store",
  metrics: [
    {
      key: "inventoryValue",
      label: "Inventory value",
      value: 18_760_400,
      format: "currency",
      change: 4.2,
      changeLabel: "from last month",
    },
    {
      key: "todaysSales",
      label: "Today’s sales",
      value: 428_500,
      format: "currency",
      change: 12.8,
      changeLabel: "vs. yesterday",
    },
    {
      key: "monthlySales",
      label: "Monthly sales",
      value: 8_942_300,
      format: "currency",
      change: 7.4,
      changeLabel: "vs. last month",
    },
    {
      key: "totalProducts",
      label: "Total products",
      value: 1_284,
      format: "number",
      change: 2.1,
      changeLabel: "48 added this month",
    },
  ],
  sales: {
    sevenDays: buildSalesSeries(7, 1.45),
    thirtyDays: buildSalesSeries(30, 1.25),
    thisMonth: buildSalesSeries(Math.max(now.getDate(), 7), 1.3),
  },
  transactions: [
    {
      id: "TP-80491",
      customer: "Amina Yusuf",
      createdAt: atToday(11, 42),
      amount: 42_600,
      method: "Transfer",
      status: "completed",
    },
    {
      id: "TP-80490",
      customer: "Walk-in customer",
      createdAt: atToday(11, 18),
      amount: 18_250,
      method: "Cash",
      status: "completed",
    },
    {
      id: "TP-80489",
      customer: "Chinedu Okafor",
      createdAt: atToday(10, 54),
      amount: 67_800,
      method: "Card",
      status: "completed",
    },
    {
      id: "TP-80488",
      customer: "Zainab Bello",
      createdAt: atToday(10, 21),
      amount: 12_400,
      method: "Transfer",
      status: "pending",
    },
    {
      id: "TP-80487",
      customer: "Walk-in customer",
      createdAt: atToday(9, 47),
      amount: 29_900,
      method: "Cash",
      status: "completed",
    },
  ],
  stockAlerts: [
    {
      id: "stk-01",
      product: "Peak Milk 400g",
      sku: "DRY-PEA-400",
      remaining: 3,
      reorderAt: 12,
      severity: "low",
    },
    {
      id: "stk-02",
      product: "Golden Penny Pasta",
      sku: "FD-GPP-500",
      remaining: 0,
      reorderAt: 20,
      severity: "out",
    },
    {
      id: "stk-03",
      product: "Sunlight Detergent 1kg",
      sku: "HOM-SUN-1K",
      remaining: 5,
      reorderAt: 10,
      severity: "low",
    },
    {
      id: "stk-04",
      product: "Eva Water 75cl",
      sku: "BEV-EVA-75",
      remaining: 0,
      reorderAt: 24,
      severity: "out",
    },
  ],
  finances: {
    customerDebts: 486_200,
    supplierPayments: 1_240_000,
    monthlyExpenses: 2_380_500,
    netCashFlow: 5_814_800,
  },
  notifications: [
    {
      id: "note-01",
      title: "Two products are out of stock",
      body: "Create a purchase order before the next delivery window.",
      createdAt: atToday(10, 30),
      unread: true,
      tone: "warning",
    },
    {
      id: "note-02",
      title: "Daily sales target at 71%",
      body: "₦171,500 remaining to reach today’s goal.",
      createdAt: atToday(9, 15),
      unread: true,
      tone: "info",
    },
    {
      id: "note-03",
      title: "Bank transfer reconciled",
      body: "Payment for transaction TP-80491 is confirmed.",
      createdAt: atToday(8, 40),
      unread: false,
      tone: "success",
    },
  ],
  lastUpdated: new Date().toISOString(),
};
