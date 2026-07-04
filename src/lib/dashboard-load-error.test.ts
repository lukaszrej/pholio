import { describe, it, expect } from "vitest";
import { resolveLoadError } from "@/lib/dashboard-load-error";

// dashboard.astro must surface a Supabase query failure (500 + error banner)
// instead of silently rendering an empty-portfolio success page. This is the
// pure decision extracted from that fix — see src/pages/dashboard.astro.
describe("resolveLoadError", () => {
  it("returns null when both queries succeed", () => {
    expect(resolveLoadError(null, null)).toBeNull();
  });

  it("returns null when both queries are absent (no Supabase client)", () => {
    expect(resolveLoadError(undefined, undefined)).toBeNull();
  });

  it("surfaces the transactions error message when only that query fails", () => {
    expect(resolveLoadError({ message: "transactions read failed" }, null)).toBe("transactions read failed");
  });

  it("surfaces the portfolios error message when only that query fails", () => {
    expect(resolveLoadError(null, { message: "portfolios read failed" })).toBe("portfolios read failed");
  });

  it("prefers the transactions error message when both queries fail", () => {
    expect(resolveLoadError({ message: "transactions read failed" }, { message: "portfolios read failed" })).toBe(
      "transactions read failed",
    );
  });
});
