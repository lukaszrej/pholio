import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildFixture, type Fixture } from "./helpers/users";

describe("Integration harness smoke test", () => {
  let fixture: Fixture;

  beforeAll(async () => {
    fixture = await buildFixture();
  });

  afterAll(async () => {
    await fixture.teardown();
  });

  it("creates two distinct confirmed users", () => {
    expect(fixture.userA.userId).toBeTruthy();
    expect(fixture.userB.userId).toBeTruthy();
    expect(fixture.userA.userId).not.toBe(fixture.userB.userId);
  });

  it("User A can read their own seeded transaction", async () => {
    const { data, error } = await fixture.userA.client
      .from("transactions")
      .select("id, ticker")
      .eq("id", fixture.userA.transactionId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.ticker).toBe(fixture.userA.transactionSeed.ticker);
  });

  it("User B can read their own seeded transaction", async () => {
    const { data, error } = await fixture.userB.client
      .from("transactions")
      .select("id, ticker")
      .eq("id", fixture.userB.transactionId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.ticker).toBe(fixture.userB.transactionSeed.ticker);
  });

  it("User A can read their own seeded portfolio", async () => {
    const { data, error } = await fixture.userA.client
      .from("portfolios")
      .select("id, name")
      .eq("id", fixture.userA.portfolioId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.name).toBe("Portfolio A");
  });
});
