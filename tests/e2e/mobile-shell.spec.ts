import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_EMAIL ?? "owner@timphat.local";
const password = process.env.E2E_PASSWORD ?? "ChangeMe-2026!";

async function ensureSignedIn(page: Page) {
  await page.goto("/auth/login");
  if (await page.getByLabel("Email address").isVisible()) {
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/(dashboard|onboarding)$/);
  }
  if (!page.url().includes("/dashboard")) await page.goto("/dashboard");
}

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile shell regression coverage.");
  await page.setViewportSize({ width: 375, height: 812 });
  await ensureSignedIn(page);
});

test("mobile navigation opens, navigates, and closes", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const drawer = page.getByRole("dialog", { name: "Navigation menu" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Products" })).toBeVisible();

  await drawer.getByRole("link", { name: "Products" }).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(drawer).toBeHidden();
});

test("mobile workspace routes avoid page-level overflow", async ({ page }) => {
  const routes = [
    "/dashboard",
    "/products",
    "/sales",
    "/pos",
    "/returns",
    "/people",
    "/expenses",
    "/reports",
    "/alerts",
    "/settings",
  ];

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    if (process.env.MOBILE_AUDIT_SCREENSHOTS) {
      await page.screenshot({
        path: `test-results/mobile-${route.slice(1)}.png`,
        fullPage: true,
      });
    }
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflow, `${route} has page-level horizontal overflow`).toBe(false);
  }
});

test("mobile forms stay usable inside the viewport", async ({ page }) => {
  for (const form of [
    {
      route: "/products",
      button: "Add product",
      dialog: "Add product",
    },
    {
      route: "/returns",
      button: "Process return",
      dialog: "Process return",
    },
  ]) {
    await page.goto(form.route);
    await page.getByRole("button", { name: form.button }).click();

    const dialog = page.getByRole("dialog", { name: form.dialog });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(812);

    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  }
});
