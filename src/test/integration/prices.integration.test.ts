import { afterAll, afterEach, beforeAll, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { refreshPricesForTickers } from "@/lib/prices";
import { computePositions } from "@/lib/portfolio";
import type { Transaction } from "@/types/transaction";

interface PricesRow {
  price: number | string;
  fetched_at: string;
  change_pct?: number | null;
}

function buildAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.test");
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function makeTransaction(ticker: string): Transaction {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    user_id: "00000000-0000-0000-0000-000000000000",
    portfolio_id: "00000000-0000-0000-0000-000000000002",
    ticker,
    purchase_price: 40.0,
    purchase_date: "2026-01-01",
    currency: "USD",
    shares: 10,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function toUrlString(url: RequestInfo | URL): string {
  if (typeof url === "string") return url;
  if (url instanceof URL) return url.href;
  return url.url;
}

describe("Risk #5 — Finnhub outage fallback", () => {
  const ticker = `TST${Date.now()}`;
  let admin: ReturnType<typeof buildAdminClient>;
  let realFetch: typeof global.fetch;
  let fetchSpy: MockInstance | undefined;

  beforeAll(() => {
    admin = buildAdminClient();
    realFetch = global.fetch.bind(global);
  });

  afterEach(async () => {
    fetchSpy?.mockRestore();
    fetchSpy = undefined;
    await admin.from("prices").delete().eq("ticker", ticker);
  });

  afterAll(async () => {
    await admin.from("prices").delete().eq("ticker", ticker);
  });

  it("(a) stale-cache fallback — is_fresh:false, cached price reused, Supabase row unchanged", async () => {
    const seededPrice = 42.5;
    const seededFetchedAt = "2020-01-01T00:00:00.000Z";
    await admin.from("prices").insert({ ticker, price: seededPrice, fetched_at: seededFetchedAt });

    fetchSpy = vi.spyOn(global, "fetch").mockImplementation((url, opts) => {
      if (toUrlString(url).includes("finnhub.io")) {
        return Promise.resolve({ ok: false, status: 503 } as unknown as Response);
      }
      return realFetch(url, opts);
    });

    const result = await refreshPricesForTickers([ticker], admin);

    expect(result[ticker]).toBeDefined();
    expect(result[ticker].is_fresh).toBe(false);
    expect(result[ticker].price).toBe(seededPrice);

    // Supabase row must be unchanged — no upsert occurred
    const singleResult = await admin.from("prices").select("price, fetched_at").eq("ticker", ticker).single();
    const rowData = (singleResult as { data: PricesRow | null }).data;
    expect(rowData).not.toBeNull();
    if (rowData) {
      expect(Number(rowData.price)).toBe(seededPrice);
      expect(rowData.fetched_at).toContain("2020-01-01");
    }

    // Data-layer signal through computePositions
    const positions = computePositions([makeTransaction(ticker)], result);
    const pos = positions.find((p) => p.ticker === ticker);
    expect(pos?.isFresh).toBe(false);
    expect(pos?.currentPrice).toBe(seededPrice);
  });

  it("(b) no-cache fallback — ticker absent, no row written, computePositions currentPrice:null", async () => {
    fetchSpy = vi.spyOn(global, "fetch").mockImplementation((url, opts) => {
      if (toUrlString(url).includes("finnhub.io")) {
        return Promise.reject(new Error("Network error"));
      }
      return realFetch(url, opts);
    });

    const result = await refreshPricesForTickers([ticker], admin);

    expect(result[ticker]).toBeUndefined();

    // Confirm no row was written
    const maybeResult = await admin.from("prices").select("price").eq("ticker", ticker).maybeSingle();
    const rowData = (maybeResult as { data: PricesRow | null }).data;
    expect(rowData).toBeNull();

    // Data-layer signal through computePositions
    const positions = computePositions([makeTransaction(ticker)], result);
    const pos = positions.find((p) => p.ticker === ticker);
    expect(pos?.currentPrice).toBeNull();
    expect(pos?.isFresh).toBe(false);
    expect(pos?.priceDate).toBeNull();
  });
});
