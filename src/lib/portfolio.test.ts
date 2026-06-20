import { describe, it, expect, beforeEach } from "vitest";
import type { Transaction } from "@/types/transaction";
import { computePositions, computePortfolioSummary, computeCashBalance } from "@/lib/portfolio";
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
