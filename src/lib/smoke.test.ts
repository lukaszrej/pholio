import { describe, it, expect } from "vitest";
import { CURRENCIES } from "@/lib/transaction-schema";

describe("smoke", () => {
  it("runs assertions", () => {
    expect(true).toBe(true);
  });

  it("resolves @ alias", () => {
    expect(CURRENCIES).toContain("USD");
  });
});
