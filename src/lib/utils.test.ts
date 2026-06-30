import { beforeEach, describe, expect, it } from "vitest";

import {
  configureFormatting,
  formatCurrency,
  formatDate,
} from "@/lib/utils";

describe("tenant-aware business formatting", () => {
  beforeEach(() => {
    configureFormatting({ locale: "en-NG", currency: "NGN" });
  });

  it("formats the configured currency without decimals", () => {
    const value = formatCurrency(428_500);
    expect(value).toContain("428,500");
    expect(value).toMatch(/₦|NGN/);
  });

  it("uses the configured locale's date order", () => {
    const value = formatDate(new Date("2026-06-27T12:00:00.000Z"));
    expect(value).toContain("27");
    expect(value).toContain("Jun");
    expect(value).toContain("2026");
  });
});
