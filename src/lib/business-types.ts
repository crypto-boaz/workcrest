export type ProductStatus = "active" | "archived";

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  qrIdentifier?: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  reorderLevel: number;
  status: ProductStatus;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  totalSpent: number;
  outstanding: number;
  orders: number;
  createdAt: string;
}

export interface SaleItem {
  sourceItemId?: string;
  productId: string;
  name: string;
  sku: string;
  barcode?: string;
  productQrIdentifier?: string;
  quantity: number;
  unitPrice: number;
  cost: number;
}

export type SaleStatus = "completed" | "held" | "refunded";
export type PaymentMethod = "Cash" | "Card" | "Transfer";

export interface Sale {
  sourceId?: string;
  id: string;
  receiptQrIdentifier?: string;
  customerId?: string;
  customerName: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  createdAt: string;
  cashier: string;
}

export interface HeldSale {
  id: string;
  customerId?: string;
  items: SaleItem[];
  discount: number;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  balance: number;
}

export interface PurchaseItem {
  productId: string;
  name: string;
  quantity: number;
  unitCost: number;
}

export type PurchaseStatus = "draft" | "ordered" | "received";

export interface Purchase {
  id: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseItem[];
  total: number;
  status: PurchaseStatus;
  createdAt: string;
  expectedAt: string;
}

export type ReturnStatus = "approved" | "pending";

export interface ReturnRecord {
  id: string;
  saleId: string;
  productId: string;
  itemName: string;
  customerName: string;
  quantity: number;
  amount: number;
  reason: string;
  status: ReturnStatus;
  createdAt: string;
}

export type StaffRole = "Owner" | "Manager" | "Cashier" | "Inventory";
export type StaffStatus = "active" | "invited" | "suspended";

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  status: StaffStatus;
  permissions: string[];
  lastActive: string;
}

export type ExpenseStatus = "paid" | "pending";

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  paymentMethod: PaymentMethod;
  status: ExpenseStatus;
  notes: string;
}

export type NotificationTone = "info" | "warning" | "success";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  tone: NotificationTone;
  unread: boolean;
  createdAt: string;
  href: string;
}

export interface BusinessSettings {
  businessName: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  lowStockNotifications: boolean;
  dailySummary: boolean;
}

export interface BusinessState {
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  heldSales: HeldSale[];
  suppliers: Supplier[];
  purchases: Purchase[];
  returns: ReturnRecord[];
  staff: StaffMember[];
  expenses: Expense[];
  notifications: AppNotification[];
  settings: BusinessSettings;
}

export interface CartInput {
  productId: string;
  quantity: number;
}

export interface CompleteSaleInput {
  items: CartInput[];
  customerId?: string;
  discount: number;
  paymentMethod: PaymentMethod;
}

export interface ProductInput {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  reorderLevel: number;
}

export interface CustomerInput {
  name: string;
  phone: string;
  email: string;
  outstanding?: number;
}

export interface PurchaseInput {
  supplierId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  expectedAt: string;
}

export interface ReturnInput {
  saleId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  reason: string;
}

export interface StaffInput {
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  permissions: string[];
}

export interface ExpenseInput {
  title: string;
  category: string;
  amount: number;
  date: string;
  paymentMethod: PaymentMethod;
  status: ExpenseStatus;
  notes: string;
}
