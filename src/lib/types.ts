export type MetricKey =
  | "inventoryValue"
  | "todaysSales"
  | "monthlySales"
  | "totalProducts";

export interface DashboardMetric {
  key: MetricKey;
  label: string;
  value: number;
  format: "currency" | "number";
  change: number;
  changeLabel: string;
}

export interface SalesPoint {
  date: string;
  label: string;
  sales: number;
  transactions: number;
}

export type TransactionStatus = "completed" | "pending" | "refunded";
export type PaymentMethod = "Card" | "Transfer" | "Cash";

export interface Transaction {
  id: string;
  customer: string;
  createdAt: string;
  amount: number;
  method: PaymentMethod;
  status: TransactionStatus;
}

export type StockSeverity = "low" | "out";

export interface StockAlert {
  id: string;
  product: string;
  sku: string;
  remaining: number;
  reorderAt: number;
  severity: StockSeverity;
}

export interface FinancialSummary {
  customerDebts: number;
  supplierPayments: number;
  monthlyExpenses: number;
  netCashFlow: number;
}

export type NotificationTone = "info" | "warning" | "success";

export interface DashboardNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  unread: boolean;
  tone: NotificationTone;
}

export interface DashboardData {
  businessName: string;
  metrics: DashboardMetric[];
  sales: {
    sevenDays: SalesPoint[];
    thirtyDays: SalesPoint[];
    thisMonth: SalesPoint[];
  };
  transactions: Transaction[];
  stockAlerts: StockAlert[];
  finances: FinancialSummary;
  notifications: DashboardNotification[];
  lastUpdated: string;
}
