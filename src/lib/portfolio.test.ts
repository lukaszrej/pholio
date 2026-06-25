import { describe, it, expect, beforeEach } from "vitest";
import type { Transaction } from "@/types/transaction";
import {
  computePositions,
  computePortfolioSummary,
  computeCashBalance,
  computeSectorAllocation,
} from "@/lib/portfolio";
import type { PriceData, PortfolioPosition } from "@/lib/portfolio";

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

let _seq = 0;
beforeEach(() => {
  _seq = 0;
});

const txn = (overrides: Partial<Transaction>): Transaction => ({
  id: `t${++_seq}`,
  user_id: "u1",
  ticker: "AAPL",
  purchase_price: 100,
  purchase_date: "2024-01-01",
  currency: "USD",
  shares: 10,
  portfolio_id: "p1",
  transaction_type: "equity",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

const priceData = (p: number, changePct: number | null = null): PriceData => ({
  price: p,
  fetched_at: "2026-06-14T00:00:00Z",
  is_fresh: true,
  changePct,
  changeAbs: null,
  high: null,
  low: null,
  open: null,
  prevClose: null,
});

const position = (overrides: Partial<PortfolioPosition>): PortfolioPosition => ({
  ticker: "AAPL",
  totalShares: 10,
  avgCost: 100,
  currency: "USD",
  hasMultipleCurrencies: false,
  currentPrice: 150,
  isFresh: true,
  priceDate: "2026-06-14T00:00:00Z",
  changePct: null,
  costBasis: 1000,
  positionValue: 1500,
  weightPct: 100,
  roiPct: 50,
  roiAbs: 500,
  ...overrides,
});

// ---------------------------------------------------------------------------
// computePositions
// ---------------------------------------------------------------------------

describe("computePositions", () => {
  it("single purchase — avgCost, roiAbs, roiPct, positionValue", () => {
    // 10sh @ $100, price $150
    // avgCost = (10 × 100) / 10 = 100
    // positionValue = 150 × 10 = 1500
    // roiAbs = (150 − 100) × 10 = 500
    // roiPct = (150 − 100) / 100 × 100 = 50
    const txns = [txn({ ticker: "AAPL", purchase_price: 100, shares: 10, currency: "USD" })];
    const prices = { AAPL: priceData(150) };

    const [p] = computePositions(txns, prices);

    expect(p.avgCost).toBe(100);
    expect(p.totalShares).toBe(10);
    expect(p.positionValue).toBe(1500);
    expect(p.roiAbs).toBe(500);
    expect(p.roiPct).toBe(50);
    expect(p.costBasis).toBe(1000); // 100 × 10
    expect(p.isFresh).toBe(true);
  });

  it("multi-purchase weighted average (even split)", () => {
    // 10sh@$100 + 10sh@$200, price $180
    // weightedSum = 10×100 + 10×200 = 3000, totalShares = 20
    // avgCost = 3000/20 = 150
    // roiAbs = (180 − 150) × 20 = 600
    // roiPct = 30/150 × 100 = 20
    const txns = [
      txn({ ticker: "AAPL", purchase_price: 100, shares: 10, currency: "USD" }),
      txn({ ticker: "AAPL", purchase_price: 200, shares: 10, currency: "USD" }),
    ];
    const prices = { AAPL: priceData(180) };

    const [p] = computePositions(txns, prices);

    expect(p.avgCost).toBe(150);
    expect(p.roiAbs).toBe(600);
    expect(p.roiPct).toBe(20);
  });

  it("multi-purchase weighted average (uneven split) — catches naive mean", () => {
    // 10sh@$100 + 30sh@$200, price $180
    // weightedSum = 10×100 + 30×200 = 7000, totalShares = 40
    // avgCost = 7000/40 = 175  (naive mean of 100 & 200 = 150 — wrong)
    // roiAbs = (180 − 175) × 40 = 200
    // roiPct = 5/175 × 100 ≈ 2.857...
    const txns = [
      txn({ ticker: "AAPL", purchase_price: 100, shares: 10, currency: "USD" }),
      txn({ ticker: "AAPL", purchase_price: 200, shares: 30, currency: "USD" }),
    ];
    const prices = { AAPL: priceData(180) };

    const [p] = computePositions(txns, prices);

    expect(p.avgCost).toBe(175);
    expect(p.roiAbs).toBe(200);
    // 5/175 × 100 ≈ 2.857142857...
    expect(p.roiPct).toBeCloseTo((5 / 175) * 100, 10);
  });

  it("multi-currency null-out — roiAbs and roiPct are null, currency is MULTI", () => {
    // same ticker in USD and EUR → no valid ROI comparison
    // positionValue is still computed: price × totalShares = 150 × 15 = 2250
    const txns = [
      txn({ ticker: "AAPL", purchase_price: 100, shares: 10, currency: "USD" }),
      txn({ ticker: "AAPL", purchase_price: 90, shares: 5, currency: "EUR" }),
    ];
    const prices = { AAPL: priceData(150) };

    const [p] = computePositions(txns, prices);

    expect(p.hasMultipleCurrencies).toBe(true);
    expect(p.currency).toBe("MULTI");
    expect(p.roiAbs).toBeNull();
    expect(p.roiPct).toBeNull();
    // positionValue = 150 × 15 = 2250 (currency does not block price × shares)
    expect(p.positionValue).toBe(2250);
  });

  it("null / missing price — positionValue, roiAbs, roiPct are null", () => {
    const txns = [txn({ ticker: "AAPL", purchase_price: 100, shares: 10, currency: "USD" })];
    const prices: Record<string, PriceData> = {}; // AAPL absent

    const [p] = computePositions(txns, prices);

    expect(p.currentPrice).toBeNull();
    expect(p.positionValue).toBeNull();
    expect(p.roiAbs).toBeNull();
    expect(p.roiPct).toBeNull();
    expect(p.isFresh).toBe(false);
  });

  it("ticker case aggregation — 'aapl' and 'AAPL' merge into one position", () => {
    const txns = [
      txn({ ticker: "aapl", purchase_price: 100, shares: 10, currency: "USD" }),
      txn({ ticker: "AAPL", purchase_price: 100, shares: 10, currency: "USD" }),
    ];
    const prices = { AAPL: priceData(150) };

    const positions = computePositions(txns, prices);

    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("AAPL");
    // totalShares = 10 + 10 = 20
    expect(positions[0].totalShares).toBe(20);
  });

  it("weightPct — two valued positions reflect their share of total value", () => {
    // AAPL: 10sh @ $200 → positionValue = 2000
    // GOOGL: 5sh @ $200 → positionValue = 1000
    // totalValue = 3000
    // AAPL weightPct = 2000/3000 × 100 ≈ 66.667
    // GOOGL weightPct = 1000/3000 × 100 ≈ 33.333
    const txns = [
      txn({ ticker: "AAPL", purchase_price: 100, shares: 10, currency: "USD" }),
      txn({ ticker: "GOOGL", purchase_price: 100, shares: 5, currency: "USD" }),
    ];
    const prices = {
      AAPL: priceData(200),
      GOOGL: priceData(200),
    };

    const positions = computePositions(txns, prices);
    const aapl = positions.find((p) => p.ticker === "AAPL");
    const googl = positions.find((p) => p.ticker === "GOOGL");

    expect(aapl).toBeDefined();
    expect(googl).toBeDefined();
    expect(aapl?.positionValue).toBe(2000);
    expect(googl?.positionValue).toBe(1000);
    expect(aapl?.weightPct).toBeCloseTo((2000 / 3000) * 100, 10);
    expect(googl?.weightPct).toBeCloseTo((1000 / 3000) * 100, 10);
    // weights sum to 100
    expect((aapl?.weightPct ?? 0) + (googl?.weightPct ?? 0)).toBeCloseTo(100, 5);
  });

  it("weightPct is null for a position with no current price", () => {
    const txns = [
      txn({ ticker: "AAPL", purchase_price: 100, shares: 10, currency: "USD" }),
      txn({ ticker: "GOOGL", purchase_price: 100, shares: 5, currency: "USD" }),
    ];
    const prices = {
      AAPL: priceData(200),
      // GOOGL absent → null price
    };

    const positions = computePositions(txns, prices);
    const googl = positions.find((p) => p.ticker === "GOOGL");

    expect(googl).toBeDefined();
    expect(googl?.positionValue).toBeNull();
    expect(googl?.weightPct).toBeNull();
  });

  it("empty input returns empty array", () => {
    expect(computePositions([], {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computePortfolioSummary
// ---------------------------------------------------------------------------

describe("computePortfolioSummary", () => {
  it("single valued position — all fields computed", () => {
    // avgCost=100, totalShares=10, positionValue=1500, roiAbs=500, currency=USD
    // totalInvested = 100 × 10 = 1000
    // pnlCostBasis = 100 × 10 = 1000  (only non-null roiAbs positions)
    // totalPnLPct = 500/1000 × 100 = 50
    const summary = computePortfolioSummary([position({})]);

    expect(summary.positionCount).toBe(1);
    expect(summary.totalInvested).toBe(1000);
    expect(summary.currentValue).toBe(1500);
    expect(summary.totalPnL).toBe(500);
    expect(summary.totalPnLPct).toBe(50);
    expect(summary.currency).toBe("USD");
    expect(summary.excludedCount).toBe(0);
  });

  it("one valued + one null-price position — null positions do not corrupt totals", () => {
    // posA: avgCost=100, totalShares=10, positionValue=1500, roiAbs=500
    // posB: avgCost=200, totalShares=5,  positionValue=null, roiAbs=null
    // totalInvested = 100×10 + 200×5 = 1000 + 1000 = 2000
    // currentValue  = 1500  (posB contributes nothing)
    // totalPnL      = 500   (only posA)
    // pnlCostBasis  = 100×10 = 1000  (only posA has roiAbs)
    // totalPnLPct   = 500/1000 × 100 = 50
    const posA = position({
      ticker: "AAPL",
      avgCost: 100,
      totalShares: 10,
      positionValue: 1500,
      roiAbs: 500,
      roiPct: 50,
      currency: "USD",
    });
    const posB = position({
      ticker: "GOOGL",
      avgCost: 200,
      totalShares: 5,
      currentPrice: null,
      positionValue: null,
      roiAbs: null,
      roiPct: null,
      weightPct: null,
      currency: "USD",
    });

    const summary = computePortfolioSummary([posA, posB]);

    expect(summary.totalInvested).toBe(2000);
    expect(summary.currentValue).toBe(1500);
    expect(summary.totalPnL).toBe(500);
    expect(summary.totalPnLPct).toBe(50);
    expect(summary.currency).toBe("USD");
    expect(summary.excludedCount).toBe(0);
  });

  it("multi-currency position excluded from P&L but included in value totals", () => {
    // posA: USD, avgCost=100, totalShares=10, positionValue=1500, roiAbs=500
    // posB: MULTI, avgCost=200, totalShares=5, positionValue=1000, roiAbs=null
    // totalInvested = 100×10 + 200×5 = 2000
    // currentValue  = 1500 + 1000 = 2500
    // totalPnL      = 500  (posB excluded because roiAbs is null)
    // pnlCostBasis  = 100×10 = 1000
    // totalPnLPct   = 500/1000 × 100 = 50
    // currencies from non-multi positions = {"USD"} → currency = "USD"
    // excludedCount = 1
    const posA = position({
      ticker: "AAPL",
      avgCost: 100,
      totalShares: 10,
      positionValue: 1500,
      roiAbs: 500,
      currency: "USD",
      hasMultipleCurrencies: false,
    });
    const posB = position({
      ticker: "MSFT",
      avgCost: 200,
      totalShares: 5,
      positionValue: 1000,
      roiAbs: null,
      roiPct: null,
      currency: "MULTI",
      hasMultipleCurrencies: true,
    });

    const summary = computePortfolioSummary([posA, posB]);

    expect(summary.totalInvested).toBe(2000);
    expect(summary.currentValue).toBe(2500);
    expect(summary.totalPnL).toBe(500);
    expect(summary.totalPnLPct).toBe(50);
    expect(summary.currency).toBe("USD");
    expect(summary.excludedCount).toBe(1);
  });

  it("no valued positions — currentValue, totalPnL, totalPnLPct are null", () => {
    const p = position({
      currentPrice: null,
      positionValue: null,
      roiAbs: null,
      roiPct: null,
      weightPct: null,
    });

    const summary = computePortfolioSummary([p]);

    expect(summary.currentValue).toBeNull();
    expect(summary.totalPnL).toBeNull();
    expect(summary.totalPnLPct).toBeNull();
  });

  it("two different currencies — currency field is null", () => {
    const posA = position({ ticker: "AAPL", currency: "USD", hasMultipleCurrencies: false });
    const posB = position({ ticker: "PKOB", currency: "PLN", hasMultipleCurrencies: false });

    const summary = computePortfolioSummary([posA, posB]);

    expect(summary.currency).toBeNull();
  });

  it("empty positions array", () => {
    const summary = computePortfolioSummary([]);

    expect(summary.positionCount).toBe(0);
    expect(summary.totalInvested).toBe(0);
    expect(summary.currentValue).toBeNull();
    expect(summary.totalPnL).toBeNull();
    expect(summary.totalPnLPct).toBeNull();
    expect(summary.currency).toBeNull();
    expect(summary.excludedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computePortfolioSummary — cash parameter
// ---------------------------------------------------------------------------

describe("computePortfolioSummary — cash parameter", () => {
  it("deposit raises currentValue by exactly the cash balance over equity-only value", () => {
    // equity: 10sh @ $100 cost, price $150 → equityValue = 1500
    // cashBalance = 500
    // currentValue = 1500 + 500 = 2000
    // totalInvested = 100 × 10 = 1000 (equity only, unchanged)
    const pos = position({ avgCost: 100, totalShares: 10, positionValue: 1500 });
    const summary = computePortfolioSummary([pos], 500);

    expect(summary.currentValue).toBe(2000);
    expect(summary.totalInvested).toBe(1000);
  });

  it("net withdrawal (negative cash) lowers currentValue accordingly", () => {
    // equity: positionValue = 1500
    // cashBalance = -200 (net withdrawal exceeds deposits)
    // currentValue = 1500 + (-200) = 1300
    const pos = position({ positionValue: 1500 });
    const summary = computePortfolioSummary([pos], -200);

    expect(summary.currentValue).toBe(1300);
  });

  it("cash-only: currentValue equals cashBalance, currency falls back to cashCurrency, ROI fields at no-equity values", () => {
    // no equity positions, cashBalance = 1000, cashCurrency = "USD"
    // currentValue = 1000, currency = "USD"
    // totalInvested = 0, totalPnL = null, totalPnLPct = null
    const summary = computePortfolioSummary([], 1000, "USD");

    expect(summary.currentValue).toBe(1000);
    expect(summary.currency).toBe("USD");
    expect(summary.totalInvested).toBe(0);
    expect(summary.totalPnL).toBeNull();
    expect(summary.totalPnLPct).toBeNull();
  });

  it("no equity prices and zero cash — currentValue remains null", () => {
    // position with no price, cashBalance = 0
    // equityValue = null, cashBalance = 0 → currentValue = null
    const pos = position({ currentPrice: null, positionValue: null, roiAbs: null, roiPct: null, weightPct: null });
    const summary = computePortfolioSummary([pos], 0);

    expect(summary.currentValue).toBeNull();
  });

  it("ROI isolation: totalInvested, totalPnL, totalPnLPct are identical with and without cash", () => {
    // equity: 10sh @ $100, positionValue = 1500, roiAbs = 500
    // totalInvested = 1000, totalPnL = 500, totalPnLPct = 50
    const pos = position({ avgCost: 100, totalShares: 10, positionValue: 1500, roiAbs: 500, roiPct: 50 });
    const withoutCash = computePortfolioSummary([pos]);
    const withCash = computePortfolioSummary([pos], 2000, "USD");

    expect(withCash.totalInvested).toBe(withoutCash.totalInvested);
    expect(withCash.totalPnL).toBe(withoutCash.totalPnL);
    expect(withCash.totalPnLPct).toBe(withoutCash.totalPnLPct);
  });

  it("backward-compat: no-arg call returns same result as explicit zero-cash call", () => {
    const pos = position({ avgCost: 100, totalShares: 10, positionValue: 1500, roiAbs: 500, roiPct: 50 });
    const noArgResult = computePortfolioSummary([pos]);
    const zeroArgResult = computePortfolioSummary([pos], 0, null);

    expect(noArgResult).toEqual(zeroArgResult);
  });

  it("mixed-currency equity with cashCurrency set — currency is null, not cashCurrency", () => {
    // equityCurrency is null (two different currencies) → fall back to positionCount === 0 branch
    // positionCount is 2, so branch returns null, not cashCurrency
    const posA = position({ ticker: "AAPL", currency: "USD", hasMultipleCurrencies: false });
    const posB = position({ ticker: "PKOB", currency: "PLN", hasMultipleCurrencies: false });

    const summary = computePortfolioSummary([posA, posB], 1000, "USD");

    expect(summary.currency).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeCashBalance
// ---------------------------------------------------------------------------

describe("computeCashBalance", () => {
  it("deposits only — sums all deposit amounts", () => {
    const txns = [
      txn({ transaction_type: "cash_deposit", purchase_price: 500 }),
      txn({ transaction_type: "cash_deposit", purchase_price: 300 }),
    ];
    expect(computeCashBalance(txns)).toBe(800);
  });

  it("deposit + withdrawal — nets correctly", () => {
    const txns = [
      txn({ transaction_type: "cash_deposit", purchase_price: 1000 }),
      txn({ transaction_type: "cash_withdrawal", purchase_price: 200 }),
    ];
    expect(computeCashBalance(txns)).toBe(800);
  });

  it("withdrawal exceeding deposits — returns negative balance", () => {
    const txns = [
      txn({ transaction_type: "cash_deposit", purchase_price: 100 }),
      txn({ transaction_type: "cash_withdrawal", purchase_price: 300 }),
    ];
    expect(computeCashBalance(txns)).toBe(-200);
  });

  it("no cash rows — returns 0", () => {
    const txns = [
      txn({ transaction_type: "equity", purchase_price: 500 }),
      txn({ transaction_type: "equity", purchase_price: 200 }),
    ];
    expect(computeCashBalance(txns)).toBe(0);
  });

  it("empty array — returns 0", () => {
    expect(computeCashBalance([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computePositions — cash row exclusion
// ---------------------------------------------------------------------------

describe("computePositions — cash row exclusion", () => {
  it("cash_deposit rows are excluded from positions", () => {
    const txns = [
      txn({ ticker: "AAPL", transaction_type: "equity", purchase_price: 100, shares: 10 }),
      txn({ ticker: "CASH", transaction_type: "cash_deposit", purchase_price: 500, shares: 1 }),
    ];
    const positions = computePositions(txns, { AAPL: priceData(150) });
    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("AAPL");
  });

  it("cash_withdrawal rows are excluded from positions", () => {
    const txns = [
      txn({ ticker: "AAPL", transaction_type: "equity", purchase_price: 100, shares: 10 }),
      txn({ ticker: "CASH", transaction_type: "cash_withdrawal", purchase_price: 200, shares: 1 }),
    ];
    const positions = computePositions(txns, { AAPL: priceData(150) });
    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe("AAPL");
  });

  it("only cash rows — returns empty positions array", () => {
    const txns = [
      txn({ ticker: "CASH", transaction_type: "cash_deposit", purchase_price: 1000, shares: 1 }),
      txn({ ticker: "CASH", transaction_type: "cash_withdrawal", purchase_price: 200, shares: 1 }),
    ];
    expect(computePositions(txns, {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeSectorAllocation
// ---------------------------------------------------------------------------

describe("computeSectorAllocation", () => {
  it("two sectors — values and percentages match position values, sorted descending", () => {
    // XOM  (Energy):     positionValue = 1000  ← inserted first (ascending order)
    // AAPL (Technology): positionValue = 2000
    // total = 3000 → Technology 66.667%, Energy 33.333%
    // Without sort the Map insertion order would yield [Energy, Technology] — wrong
    const positions = [
      position({ ticker: "XOM", positionValue: 1000 }),
      position({ ticker: "AAPL", positionValue: 2000 }),
    ];
    const sectors = { XOM: "Energy", AAPL: "Technology" };

    const slices = computeSectorAllocation(positions, sectors);

    expect(slices).toHaveLength(2);
    expect(slices[0].sector).toBe("Technology");
    expect(slices[0].value).toBe(2000);
    expect(slices[0].percentage).toBeCloseTo((2000 / 3000) * 100, 10);
    expect(slices[1].sector).toBe("Energy");
    expect(slices[1].value).toBe(1000);
    expect(slices[1].percentage).toBeCloseTo((1000 / 3000) * 100, 10);
    const pctSum = slices.reduce((s, sl) => s + sl.percentage, 0);
    expect(pctSum).toBeCloseTo(100, 10);
  });

  it("ticker absent from sectors map falls back to Other", () => {
    const positions = [
      position({ ticker: "AAPL", positionValue: 1000 }),
      position({ ticker: "UNKNOWN", positionValue: 500 }),
    ];
    const sectors = { AAPL: "Technology" };

    const slices = computeSectorAllocation(positions, sectors);

    expect(slices).toHaveLength(2);
    const other = slices.find((s) => s.sector === "Other");
    expect(other).toBeDefined();
    expect(other?.value).toBe(500);
  });

  it("Other is pinned to end even when it is not the smallest sector", () => {
    // After descending sort: Technology(3000), Other(2000), Energy(1000)
    // Other at index 1 > 0 → splice and push to end → [Technology, Energy, Other]
    const positions = [
      position({ ticker: "AAPL", positionValue: 3000 }),
      position({ ticker: "UNKNOWN", positionValue: 2000 }),
      position({ ticker: "XOM", positionValue: 1000 }),
    ];
    const sectors = { AAPL: "Technology", XOM: "Energy" };

    const slices = computeSectorAllocation(positions, sectors);

    expect(slices).toHaveLength(3);
    expect(slices[0].sector).toBe("Technology");
    expect(slices[1].sector).toBe("Energy");
    expect(slices[2].sector).toBe("Other");
  });

  it("positions without a current price are excluded from allocation", () => {
    // GOOGL is in a different sector so the mutation (filter removed) would add a
    // zero-value "Energy" slice, changing length from 1 to 2 and killing the mutant
    const positions = [
      position({ ticker: "AAPL", positionValue: 1000 }),
      position({ ticker: "GOOGL", positionValue: null }),
    ];
    const sectors = { AAPL: "Technology", GOOGL: "Energy" };

    const slices = computeSectorAllocation(positions, sectors);

    expect(slices).toHaveLength(1);
    expect(slices[0].sector).toBe("Technology");
    expect(slices[0].value).toBe(1000);
  });

  it("all positions unpriced — returns empty array", () => {
    const positions = [position({ ticker: "AAPL", positionValue: null })];
    const sectors = { AAPL: "Technology" };

    expect(computeSectorAllocation(positions, sectors)).toEqual([]);
  });

  it("empty positions array — returns empty array", () => {
    expect(computeSectorAllocation([], {})).toEqual([]);
  });
});
