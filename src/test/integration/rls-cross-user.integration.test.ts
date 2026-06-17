import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildFixture, type Fixture } from "./helpers/users";

describe("Risk #2 — cross-user read scope (RLS)", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await buildFixture();
  });

  afterAll(async () => {
    await fixture.teardown();
  });

  describe("transactions table", () => {
    it("User A can read their own transaction (positive control)", async () => {
      const { data, error } = await fixture.userA.client
        .from("transactions")
        .select("id")
        .eq("id", fixture.userA.transactionId)
        .single();
      expect(error).toBeNull();
      const row = data;
      expect(row?.id).toBe(fixture.userA.transactionId);
    });

    it("User A direct lookup of User B transaction id returns empty — load-bearing", async () => {
      const { data, error } = await fixture.userA.client
        .from("transactions")
        .select("*")
        .eq("id", fixture.userB.transactionId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  describe("portfolios table", () => {
    it("User A can read their own portfolio (positive control)", async () => {
      const { data, error } = await fixture.userA.client
        .from("portfolios")
        .select("id")
        .eq("id", fixture.userA.portfolioId)
        .single();
      expect(error).toBeNull();
      const row = data;
      expect(row?.id).toBe(fixture.userA.portfolioId);
    });

    it("User A direct lookup of User B portfolio id returns empty — load-bearing", async () => {
      const { data, error } = await fixture.userA.client
        .from("portfolios")
        .select("*")
        .eq("id", fixture.userB.portfolioId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("User A cannot INSERT a portfolio owned by User B — load-bearing", async () => {
      const { error } = await fixture.userA.client
        .from("portfolios")
        .insert({ name: "Spoofed", user_id: fixture.userB.userId });
      expect(error).not.toBeNull();
    });
  });
});
