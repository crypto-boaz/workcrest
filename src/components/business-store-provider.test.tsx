import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import {
  BusinessStoreProvider,
  useBusinessStore,
} from "@/components/business-store-provider";

function StoreHarness() {
  const { state, hydrated, completeSale } = useBusinessStore();
  const product = state.products.find((item) => item.id === "prd-005")!;
  return (
    <div>
      <span data-testid="hydrated">{String(hydrated)}</span>
      <span data-testid="stock">{product.stock}</span>
      <span data-testid="sales">{state.sales.length}</span>
      <button
        onClick={() =>
          completeSale({
            items: [{ productId: product.id, quantity: 2 }],
            discount: 0,
            paymentMethod: "Cash",
          })
        }
      >
        Complete test sale
      </button>
    </div>
  );
}

describe("BusinessStoreProvider", () => {
  beforeEach(() => window.localStorage.clear());

  it("updates related sales and stock state without browser persistence", async () => {
    const user = userEvent.setup();
    render(
      <BusinessStoreProvider>
        <StoreHarness />
      </BusinessStoreProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("hydrated")).toHaveTextContent("true"),
    );
    const initialStock = Number(screen.getByTestId("stock").textContent);
    const initialSales = Number(screen.getByTestId("sales").textContent);

    await user.click(screen.getByRole("button", { name: "Complete test sale" }));

    expect(screen.getByTestId("stock")).toHaveTextContent(
      String(initialStock - 2),
    );
    expect(screen.getByTestId("sales")).toHaveTextContent(
      String(initialSales + 1),
    );
    expect(window.localStorage.length).toBe(0);
  });
});
