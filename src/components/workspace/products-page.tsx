"use client";

import {
  Archive,
  Boxes,
  CircleAlert,
  PackageCheck,
  PackagePlus,
  Pencil,
  Plus,
  Warehouse,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { useBusinessStore } from "@/components/business-store-provider";
import { usePlatform } from "@/components/platform-provider";
import { Button } from "@/components/ui/button";
import type { Product, ProductInput } from "@/lib/business-types";
import { formatCurrency } from "@/lib/utils";
import {
  downloadCsv,
  ExportButton,
  FormField,
  inputClass,
  Modal,
  ModalFooter,
  PageHeader,
  Select,
  StatTile,
  StatusBadge,
  TableShell,
  Toolbar,
  Workspace,
} from "@/components/workspace/workspace-ui";

const emptyProduct: ProductInput = {
  name: "",
  sku: "",
  barcode: "",
  category: "Groceries",
  price: 0,
  cost: 0,
  stock: 0,
  reorderLevel: 5,
};

function formatProductSku(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function ProductsPage() {
  const { state, addProduct, updateProduct, archiveProduct } =
    useBusinessStore();
  const { bootstrap } = usePlatform();
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductInput>(emptyProduct);
  const [skuEdited, setSkuEdited] = useState(false);

  const filtered = useMemo(
    () =>
      state.products.filter((product) => {
        const matchesQuery = [
          product.name,
          product.sku,
          product.barcode,
          product.category,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase());
        const matchesStock =
          stockFilter === "all" ||
          (stockFilter === "out" && product.stock === 0) ||
          (stockFilter === "low" &&
            product.stock > 0 &&
            product.stock <= product.reorderLevel) ||
          (stockFilter === "healthy" && product.stock > product.reorderLevel) ||
          (stockFilter === "archived" && product.status === "archived");
        return matchesQuery && matchesStock;
      }),
    [query, state.products, stockFilter],
  );

  const inventoryValue = state.products.reduce(
    (sum, product) => sum + product.stock * product.cost,
    0,
  );
  const low = state.products.filter(
    (product) => product.stock > 0 && product.stock <= product.reorderLevel,
  ).length;
  const out = state.products.filter((product) => product.stock === 0).length;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyProduct);
    setSkuEdited(false);
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setSkuEdited(true);
    setForm({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode ?? "",
      category: product.category,
      price: product.price,
      cost: product.cost,
      stock: product.stock,
      reorderLevel: product.reorderLevel,
    });
    setModalOpen(true);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (editing) updateProduct(editing.id, form);
    else addProduct(form);
    setModalOpen(false);
  };

  const exportProducts = () =>
    downloadCsv(`${bootstrap.organization.slug}-products.csv`, [
      [
        "SKU",
        "Barcode",
        "Product",
        "Category",
        "Price",
        "Cost",
        "Stock",
        "Reorder level",
      ],
      ...filtered.map((product) => [
        product.sku,
        product.barcode || "Nil",
        product.name,
        product.category,
        product.price,
        product.cost,
        product.stock,
        product.reorderLevel,
      ]),
    ]);

  return (
    <Workspace>
      <PageHeader
        eyebrow="Inventory"
        title="Products"
        description="Manage catalogue pricing, stock levels, and reorder points from one dependable view."
        actions={
          <>
            <ExportButton onClick={exportProducts} />
            <Button onClick={openCreate}>
              <Plus className="size-4" /> Add product
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile
          label="Inventory value"
          value={formatCurrency(inventoryValue)}
          detail="Based on current unit costs"
          icon={Warehouse}
        />
        <StatTile
          label="Active products"
          value={state.products
            .filter((product) => product.status === "active")
            .length.toLocaleString()}
          detail={`${state.products.reduce((sum, product) => sum + product.stock, 0)} units on hand`}
          icon={Boxes}
          tone="green"
        />
        <StatTile
          label="Low stock"
          value={String(low)}
          detail="At or below reorder level"
          icon={CircleAlert}
          tone="amber"
        />
        <StatTile
          label="Out of stock"
          value={String(out)}
          detail="Requires replenishment"
          icon={PackagePlus}
          tone="red"
        />
      </section>

      <TableShell>
        <Toolbar
          query={query}
          onQueryChange={setQuery}
          placeholder="Search product, SKU, barcode, or category"
        >
          <Select
            value={stockFilter}
            onChange={setStockFilter}
            ariaLabel="Filter products by stock state"
          >
            <option value="all">All stock states</option>
            <option value="healthy">Healthy stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
            <option value="archived">Archived</option>
          </Select>
          <span className="text-[11px] text-[var(--muted-foreground)]">
            {filtered.length} products
          </span>
        </Toolbar>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead>
              <tr className="bg-[var(--surface-subtle)] text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                <th className="px-5 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Barcode</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 text-right font-semibold">Price</th>
                <th className="px-4 py-3 text-right font-semibold">Cost</th>
                <th className="px-4 py-3 font-semibold">Stock</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const stockState =
                  product.stock === 0
                    ? "out"
                    : product.stock <= product.reorderLevel
                      ? "low"
                      : "healthy";
                return (
                  <tr
                    key={product.id}
                    className="border-t border-[var(--border)] hover:bg-[var(--surface-subtle)]"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary-soft-foreground)]">
                          <PackageCheck className="size-4" />
                        </span>
                        <div>
                          <p className="font-semibold">{product.name}</p>
                          <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                            {product.sku}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-[11px] text-[var(--muted-foreground)]">
                      {product.barcode || "(Nil)"}
                    </td>
                    <td className="px-4 py-3.5 text-[var(--muted-foreground)]">
                      {product.category}
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold">
                      {formatCurrency(product.price)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-[var(--muted-foreground)]">
                      {formatCurrency(product.cost)}
                    </td>
                    <td className="px-4 py-3.5">
                      <p
                        className={
                          stockState === "out"
                            ? "font-bold text-red-600 dark:text-red-400"
                            : stockState === "low"
                              ? "font-bold text-amber-700 dark:text-amber-400"
                              : "font-semibold"
                        }
                      >
                        {product.stock} units
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--muted-foreground)]">
                        Reorder at {product.reorderLevel}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      {product.status === "archived" ? (
                        <StatusBadge>Archived</StatusBadge>
                      ) : stockState === "out" ? (
                        <StatusBadge tone="red">Out of stock</StatusBadge>
                      ) : stockState === "low" ? (
                        <StatusBadge tone="amber">Low stock</StatusBadge>
                      ) : (
                        <StatusBadge tone="green">In stock</StatusBadge>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(product)}
                          aria-label={`Edit ${product.name}`}
                          className="size-8"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => archiveProduct(product.id)}
                          aria-label={`${product.status === "active" ? "Archive" : "Restore"} ${product.name}`}
                          className="size-8"
                        >
                          <Archive className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TableShell>

      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? "Edit product" : "Add product"}
        description="Product changes are shared across inventory, POS, purchases, and reports."
        size="lg"
      >
        <form onSubmit={submit}>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <FormField label="Product name" className="sm:col-span-2">
              <input
                required
                className={inputClass}
                value={form.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setForm({
                    ...form,
                    name,
                    sku: skuEdited ? form.sku : formatProductSku(name),
                  });
                }}
                placeholder="e.g. Golden Penny Pasta 500g"
              />
            </FormField>
            <FormField
              label="SKU / product slug"
              hint="Generated from the product name. You can edit it before saving."
            >
              <input
                required
                className={inputClass}
                value={form.sku}
                onChange={(event) => {
                  setSkuEdited(true);
                  setForm({
                    ...form,
                    sku: formatProductSku(event.target.value),
                  });
                }}
                placeholder="FD-GPP-500"
              />
            </FormField>
            <FormField
              label="Barcode"
              hint="Optional. Leave blank and Workcrest will generate a valid EAN-13 barcode."
            >
              <input
                className={inputClass}
                value={form.barcode}
                onChange={(event) =>
                  setForm({ ...form, barcode: event.target.value.trim() })
                }
                placeholder="e.g. 0123456789012"
              />
            </FormField>
            <FormField label="Category">
              <select
                className={inputClass}
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
              >
                <option>Groceries</option>
                <option>Beverages</option>
                <option>Home care</option>
                <option>Personal care</option>
                <option>Other</option>
              </select>
            </FormField>
            <FormField label="Selling price (optional)">
              <input
                min="0"
                step="0.01"
                type="number"
                className={inputClass}
                value={form.price || ""}
                onChange={(event) =>
                  setForm({ ...form, price: Number(event.target.value) })
                }
              />
            </FormField>
            <FormField label="Unit cost (optional)">
              <input
                min="0"
                step="0.01"
                type="number"
                className={inputClass}
                value={form.cost || ""}
                onChange={(event) =>
                  setForm({ ...form, cost: Number(event.target.value) })
                }
              />
            </FormField>
            <FormField label="Quantity on hand">
              <input
                required
                min="0"
                type="number"
                className={inputClass}
                value={form.stock || ""}
                onChange={(event) =>
                  setForm({ ...form, stock: Number(event.target.value) })
                }
              />
            </FormField>
            <FormField
              label="Reorder level"
              hint="You’ll receive an alert at or below this quantity."
            >
              <input
                required
                min="0"
                type="number"
                className={inputClass}
                value={form.reorderLevel}
                onChange={(event) =>
                  setForm({
                    ...form,
                    reorderLevel: Number(event.target.value),
                  })
                }
              />
            </FormField>
          </div>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              {editing ? "Save changes" : "Add product"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </Workspace>
  );
}
