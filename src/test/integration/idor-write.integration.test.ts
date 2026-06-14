import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildFixture, type Fixture } from "./helpers/users";

describe("Risk #4 — IDOR on transaction writes", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await buildFixture();
  });

  afterAll(async () => {
    await fixture.teardown();
  });

  it("User A UPDATE on User B transaction affects 0 rows; oracle confirms row unchanged", async () => {
    const { data: updated, error: updateErr } = await fixture.userA.client
      .from("transactions")
      .update({ ticker: "HACKED" })
      .eq("id", fixture.userB.transactionId)
      .select("*");
    expect(updateErr).toBeNull();
    expect(updated).toHaveLength(0);

    // Oracle: re-fetch with User B's client and compare field-for-field to the seeded value.
    // The oracle is the hand-known seed — not derived from the write response.
    const { data: row, error: fetchErr } = await fixture.userB.client
      .from("transactions")
      .select("ticker, purchase_price, purchase_date, currency, shares")
      .eq("id", fixture.userB.transactionId)
      .single();
    expect(fetchErr).toBeNull();
    const tx = row;
    const seed = fixture.userB.transactionSeed;
    expect(tx?.ticker).toBe(seed.ticker);
    expect(tx?.purchase_price).toBe(seed.purchase_price);
    expect(tx?.purchase_date).toBe(seed.purchase_date);
    expect(tx?.currency).toBe(seed.currency);
    expect(tx?.shares).toBe(seed.shares);
  });

  it("User A DELETE on User B transaction affects 0 rows; oracle confirms row still exists", async () => {
    const { data: deleted, error: deleteErr } = await fixture.userA.client
      .from("transactions")
      .delete()
      .eq("id", fixture.userB.transactionId)
      .select("*");
    expect(deleteErr).toBeNull();
    expect(deleted).toHaveLength(0);

    // Oracle: row must still exist and be unchanged
    const { data: row, error: fetchErr } = await fixture.userB.client
      .from("transactions")
      .select("ticker, purchase_price, purchase_date, currency, shares")
      .eq("id", fixture.userB.transactionId)
      .single();
    expect(fetchErr).toBeNull();
    const tx = row;
    const seed = fixture.userB.transactionSeed;
    expect(tx?.ticker).toBe(seed.ticker);
    expect(tx?.purchase_price).toBe(seed.purchase_price);
    expect(tx?.currency).toBe(seed.currency);
  });

  it("User A UPDATE on User B portfolio affects 0 rows; oracle confirms name unchanged", async () => {
    const { data: updated, error: updateErr } = await fixture.userA.client
      .from("portfolios")
      .update({ name: "HACKED" })
      .eq("id", fixture.userB.portfolioId)
      .select("*");
    expect(updateErr).toBeNull();
    expect(updated).toHaveLength(0);

    // Oracle: re-fetch with User B's client
    const { data: row, error: fetchErr } = await fixture.userB.client
      .from("portfolios")
      .select("name")
      .eq("id", fixture.userB.portfolioId)
      .single();
    expect(fetchErr).toBeNull();
    const portfolio = row;
    expect(portfolio?.name).toBe("Portfolio B");
  });
});
