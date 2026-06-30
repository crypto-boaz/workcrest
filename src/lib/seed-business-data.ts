import type {
  BusinessState,
  Customer,
  Expense,
  Product,
  Sale,
} from "@/lib/business-types";

const now = new Date();
const isoDaysAgo = (days: number, hour = 10, minute = 0) => {
  const value = new Date(now);
  value.setDate(value.getDate() - days);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
};

const products: Product[] = [
  ["prd-001", "Peak Milk 400g", "DRY-PEA-400", "Groceries", 4_800, 3_550, 3, 12],
  ["prd-002", "Golden Penny Pasta 500g", "FD-GPP-500", "Groceries", 1_350, 980, 0, 20],
  ["prd-003", "Sunlight Detergent 1kg", "HOM-SUN-1K", "Home care", 5_900, 4_250, 5, 10],
  ["prd-004", "Eva Water 75cl", "BEV-EVA-75", "Beverages", 450, 290, 0, 24],
  ["prd-005", "Milo Refill 800g", "DRY-MIL-800", "Groceries", 9_500, 7_300, 18, 8],
  ["prd-006", "Indomie Chicken 70g", "FD-IND-070", "Groceries", 450, 320, 96, 30],
  ["prd-007", "Coca-Cola 50cl", "BEV-COK-50", "Beverages", 700, 510, 42, 18],
  ["prd-008", "Dano Full Cream 400g", "DRY-DAN-400", "Groceries", 5_200, 3_900, 14, 8],
  ["prd-009", "Nivea Body Lotion 400ml", "PER-NIV-400", "Personal care", 8_700, 6_550, 11, 5],
  ["prd-010", "Harpic Toilet Cleaner 725ml", "HOM-HAR-725", "Home care", 4_300, 3_100, 21, 8],
  ["prd-011", "Nestlé Pure Life 1.5L", "BEV-NES-15", "Beverages", 700, 480, 55, 20],
  ["prd-012", "Kings Vegetable Oil 3L", "FD-KIN-3L", "Groceries", 13_800, 10_900, 9, 6],
].map(([id, name, sku, category, price, cost, stock, reorderLevel]) => ({
  id: String(id),
  name: String(name),
  sku: String(sku),
  category: String(category),
  price: Number(price),
  cost: Number(cost),
  stock: Number(stock),
  reorderLevel: Number(reorderLevel),
  status: "active",
  updatedAt: isoDaysAgo(Math.floor(Number(stock) % 5)),
}));

const customers: Customer[] = [
  ["cus-001", "Amina Yusuf", "0803 445 9221", "amina@example.com", 486_200, 42_600, 18],
  ["cus-002", "Chinedu Okafor", "0706 118 3074", "chinedu@example.com", 324_850, 0, 11],
  ["cus-003", "Zainab Bello", "0812 700 4510", "zainab@example.com", 187_400, 12_400, 9],
  ["cus-004", "Tunde Balogun", "0902 332 1880", "tunde@example.com", 742_300, 0, 26],
  ["cus-005", "Ifeoma Eze", "0805 221 9088", "ifeoma@example.com", 98_750, 0, 6],
].map(([id, name, phone, email, totalSpent, outstanding, orders], index) => ({
  id: String(id),
  name: String(name),
  phone: String(phone),
  email: String(email),
  totalSpent: Number(totalSpent),
  outstanding: Number(outstanding),
  orders: Number(orders),
  createdAt: isoDaysAgo(96 - index * 13),
}));

const saleBlueprints: Array<{
  customerId?: string;
  productIds: string[];
  quantities: number[];
  daysAgo: number;
  method: Sale["paymentMethod"];
}> = [
  { customerId: "cus-001", productIds: ["prd-005", "prd-007"], quantities: [4, 6], daysAgo: 0, method: "Transfer" },
  { productIds: ["prd-006", "prd-011"], quantities: [15, 5], daysAgo: 0, method: "Cash" },
  { customerId: "cus-002", productIds: ["prd-009", "prd-010"], quantities: [5, 4], daysAgo: 0, method: "Card" },
  { customerId: "cus-003", productIds: ["prd-008", "prd-012"], quantities: [2, 1], daysAgo: 1, method: "Transfer" },
  { productIds: ["prd-006", "prd-007", "prd-011"], quantities: [20, 8, 6], daysAgo: 1, method: "Cash" },
  { customerId: "cus-004", productIds: ["prd-005", "prd-009"], quantities: [3, 2], daysAgo: 2, method: "Card" },
  { productIds: ["prd-010", "prd-012"], quantities: [2, 1], daysAgo: 3, method: "Cash" },
  { customerId: "cus-005", productIds: ["prd-008", "prd-006"], quantities: [2, 10], daysAgo: 4, method: "Transfer" },
  { productIds: ["prd-007", "prd-011"], quantities: [12, 12], daysAgo: 5, method: "Cash" },
  { customerId: "cus-001", productIds: ["prd-009"], quantities: [4], daysAgo: 6, method: "Card" },
  { productIds: ["prd-005", "prd-006"], quantities: [2, 24], daysAgo: 8, method: "Cash" },
  { customerId: "cus-004", productIds: ["prd-012", "prd-008"], quantities: [3, 3], daysAgo: 12, method: "Transfer" },
];

const sales: Sale[] = saleBlueprints.map((blueprint, index) => {
  const items = blueprint.productIds.map((productId, itemIndex) => {
    const product = products.find((entry) => entry.id === productId)!;
    return {
      productId,
      name: product.name,
      sku: product.sku,
      quantity: blueprint.quantities[itemIndex],
      unitPrice: product.price,
      cost: product.cost,
    };
  });
  const subtotal = items.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0,
  );
  const customer = customers.find(
    (entry) => entry.id === blueprint.customerId,
  );
  return {
    id: `TP-${80491 - index}`,
    customerId: customer?.id,
    customerName: customer?.name ?? "Walk-in customer",
    items,
    subtotal,
    discount: index % 4 === 0 ? 2_000 : 0,
    total: subtotal - (index % 4 === 0 ? 2_000 : 0),
    paymentMethod: blueprint.method,
    status: "completed",
    createdAt: isoDaysAgo(blueprint.daysAgo, 11 - (index % 3), 42 - index),
    cashier: index % 2 ? "Ada Nwosu" : "Samuel Ojo",
  };
});

const expenses: Expense[] = [
  ["exp-001", "June shop rent", "Rent", 650_000, 18, "Transfer", "paid"],
  ["exp-002", "Generator diesel", "Utilities", 184_500, 4, "Cash", "paid"],
  ["exp-003", "Internet subscription", "Utilities", 68_000, 8, "Transfer", "paid"],
  ["exp-004", "Delivery van service", "Logistics", 95_000, 2, "Transfer", "pending"],
  ["exp-005", "Staff lunch allowance", "Staff welfare", 72_000, 1, "Cash", "paid"],
].map(([id, title, category, amount, daysAgo, method, status]) => ({
  id: String(id),
  title: String(title),
  category: String(category),
  amount: Number(amount),
  date: isoDaysAgo(Number(daysAgo)),
  paymentMethod: method as Expense["paymentMethod"],
  status: status as Expense["status"],
  notes: "",
}));

export const seedBusinessState: BusinessState = {
  products,
  customers,
  sales,
  heldSales: [],
  suppliers: [
    {
      id: "sup-001",
      name: "Mainland FMCG Depot",
      contactName: "Kola Adebayo",
      phone: "0802 118 4730",
      email: "orders@mainlandfmcg.ng",
      balance: 840_000,
    },
    {
      id: "sup-002",
      name: "BlueSpring Beverages",
      contactName: "Ngozi Anene",
      phone: "0703 611 8852",
      email: "sales@bluespring.ng",
      balance: 400_000,
    },
    {
      id: "sup-003",
      name: "Prime Household Supplies",
      contactName: "Musa Lawal",
      phone: "0816 084 2391",
      email: "musa@primehousehold.ng",
      balance: 0,
    },
  ],
  purchases: [
    {
      id: "PO-1028",
      supplierId: "sup-001",
      supplierName: "Mainland FMCG Depot",
      items: [{ productId: "prd-002", name: "Golden Penny Pasta 500g", quantity: 80, unitCost: 980 }],
      total: 78_400,
      status: "ordered",
      createdAt: isoDaysAgo(2),
      expectedAt: isoDaysAgo(-2),
    },
    {
      id: "PO-1027",
      supplierId: "sup-002",
      supplierName: "BlueSpring Beverages",
      items: [{ productId: "prd-004", name: "Eva Water 75cl", quantity: 120, unitCost: 290 }],
      total: 34_800,
      status: "ordered",
      createdAt: isoDaysAgo(3),
      expectedAt: isoDaysAgo(-1),
    },
    {
      id: "PO-1026",
      supplierId: "sup-003",
      supplierName: "Prime Household Supplies",
      items: [{ productId: "prd-003", name: "Sunlight Detergent 1kg", quantity: 24, unitCost: 4_250 }],
      total: 102_000,
      status: "received",
      createdAt: isoDaysAgo(9),
      expectedAt: isoDaysAgo(5),
    },
  ],
  returns: [
    {
      id: "RT-2041",
      saleId: "TP-80487",
      productId: "prd-007",
      itemName: "Coca-Cola 50cl",
      customerName: "Walk-in customer",
      quantity: 2,
      amount: 1_400,
      reason: "Damaged packaging",
      status: "approved",
      createdAt: isoDaysAgo(1, 14, 20),
    },
  ],
  staff: [
    {
      id: "stf-001",
      name: "Samuel Ojo",
      email: "samuel@timphat.store",
      phone: "0803 200 1448",
      role: "Owner",
      status: "active",
      permissions: ["all"],
      lastActive: new Date().toISOString(),
    },
    {
      id: "stf-002",
      name: "Ada Nwosu",
      email: "ada@timphat.store",
      phone: "0810 455 7712",
      role: "Cashier",
      status: "active",
      permissions: ["sales.create", "sales.view", "returns.create"],
      lastActive: isoDaysAgo(0, 9, 45),
    },
    {
      id: "stf-003",
      name: "Ibrahim Musa",
      email: "ibrahim@timphat.store",
      phone: "0704 612 9401",
      role: "Inventory",
      status: "active",
      permissions: ["products.manage", "purchases.manage", "reports.stock"],
      lastActive: isoDaysAgo(1, 17, 10),
    },
    {
      id: "stf-004",
      name: "Damilola Kazeem",
      email: "damilola@timphat.store",
      phone: "0901 888 4030",
      role: "Manager",
      status: "invited",
      permissions: ["sales.view", "products.manage", "staff.view", "reports.view"],
      lastActive: isoDaysAgo(8),
    },
  ],
  expenses,
  notifications: [
    {
      id: "note-001",
      title: "Two products are out of stock",
      body: "Golden Penny Pasta and Eva Water need replenishment.",
      tone: "warning",
      unread: true,
      createdAt: isoDaysAgo(0, 10, 30),
      href: "/products",
    },
    {
      id: "note-002",
      title: "Daily sales target at 71%",
      body: "Keep an eye on afternoon sales performance.",
      tone: "info",
      unread: true,
      createdAt: isoDaysAgo(0, 9, 15),
      href: "/reports",
    },
    {
      id: "note-003",
      title: "Purchase PO-1026 received",
      body: "24 units were added to inventory successfully.",
      tone: "success",
      unread: false,
      createdAt: isoDaysAgo(1, 16, 40),
      href: "/purchases",
    },
  ],
  settings: {
    businessName: "Timphat Store",
    email: "hello@timphat.store",
    phone: "+234 803 555 0194",
    address: "14 Admiralty Way, Lekki Phase 1, Lagos",
    currency: "NGN",
    lowStockNotifications: true,
    dailySummary: true,
  },
};
