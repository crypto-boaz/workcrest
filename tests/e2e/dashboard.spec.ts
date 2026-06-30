import { expect, test } from "@playwright/test";

test("dashboard loads and chart periods work", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page.getByText("Inventory value")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sales overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent sales" })).toBeVisible();

  const thirtyDays = page.getByRole("button", { name: "30 days" });
  await thirtyDays.click();
  await expect(thirtyDays).toHaveAttribute("aria-pressed", "true");
});

test("navigation shell reaches a workspace route", async ({ page, isMobile }) => {
  await page.goto("/dashboard");

  if (isMobile) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }

  await page.getByRole("link", { name: "Products" }).first().click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(
    page.getByRole("heading", { name: "Products", exact: true }),
  ).toBeVisible();
});

test("dashboard has no page-level horizontal overflow", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("Inventory value")).toBeVisible();

  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);
});

test("all workspace routes render their primary heading", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The route matrix only needs one browser profile.");
  const routes = [
    ["products", "Products"],
    ["sales", "Sales"],
    ["pos", "Point of sale"],
    ["customers", "Customers"],
    ["purchases", "Purchases"],
    ["returns", "Returns"],
    ["people", "Staff"],
    ["expenses", "Expenses"],
    ["reports", "Reports"],
    ["alerts", "Notification center"],
    ["settings", "Settings"],
  ] as const;

  for (const [route, heading] of routes) {
    await page.goto(`/${route}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
    ).toBeVisible();
  }
});

test("a completed checkout updates inventory", async ({ page, isMobile }) => {
  test.skip(isMobile, "The workflow is covered once on desktop.");
  await page.goto("/pos");

  await page.getByRole("button", { name: /Milo Refill 800g/ }).click();
  await page.getByRole("button", { name: /Checkout/ }).click();
  await page.getByRole("button", { name: "Complete sale" }).click();

  await expect(
    page.getByRole("heading", { name: "Sale complete" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await page.goto("/products");
  await page.getByRole("searchbox").fill("Milo Refill 800g");
  await expect(page.getByText("17 units")).toBeVisible();
});
