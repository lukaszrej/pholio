import type { Transaction } from "@/types/transaction";

export interface SectorSlice {
  sector: string;
  value: number;
  percentage: number;
}

export function computeSectorAllocation(
  positions: PortfolioPosition[],
  sectors: Record<string, string>,
): SectorSlice[] {
  const valued = positions.filter((p): p is PortfolioPosition & { positionValue: number } => p.positionValue !== null);
  const sectorTotals = new Map<string, number>();

  for (const pos of valued) {
    const sector = sectors[pos.ticker] ?? "Other";
    sectorTotals.set(sector, (sectorTotals.get(sector) ?? 0) + pos.positionValue);
  }

  const total = [...sectorTotals.values()].reduce((sum, v) => sum + v, 0);
  if (total === 0) return [];

  const slices: SectorSlice[] = [...sectorTotals.entries()].map(([sector, value]) => ({
    sector,
    value,
    percentage: (value / total) * 100,
  }));

  slices.sort((a, b) => b.value - a.value);

  const otherIdx = slices.findIndex((s) => s.sector === "Other");
  if (otherIdx > 0) {
    const [other] = slices.splice(otherIdx, 1);
    slices.push(other);
  }

  return slices;
}

export interface PriceData {
  price: number;
  fetched_at: string;
  is_fresh: boolean;
}

export interface PortfolioPosition {
  ticker: string;
  totalShares: number;
  avgCost: number;
  currency: string;
  hasMultipleCurrencies: boolean;
  currentPrice: number | null;
  isFresh: boolean;
  priceDate: string | null;
  positionValue: number | null;
  roiPct: number | null;
  roiAbs: number | null;
}

export function computePositions(transactions: Transaction[], prices: Record<string, PriceData>): PortfolioPosition[] {
  const groups = new Map<string, Transaction[]>();

  for (const t of transactions) {
    const ticker = t.ticker.toUpperCase();
    const existing = groups.get(ticker);
    if (existing) {
      existing.push(t);
    } else {
      groups.set(ticker, [t]);
    }
  }

  return [...groups.entries()].map(([ticker, txns]) => {
    const totalShares = txns.reduce((sum, t) => sum + t.shares, 0);
    const weightedSum = txns.reduce((sum, t) => sum + t.shares * t.purchase_price, 0);
    const avgCost = totalShares > 0 ? weightedSum / totalShares : 0;
    const hasMultipleCurrencies = new Set(txns.map((t) => t.currency)).size > 1;
    const currency = hasMultipleCurrencies ? "MULTI" : txns[0].currency;

    const priceEntry = prices[ticker] as PriceData | undefined;
    const currentPrice = priceEntry?.price ?? null;
    const isFresh = priceEntry?.is_fresh ?? false;
    const priceDate = priceEntry?.fetched_at ?? null;
    const positionValue = currentPrice != null ? currentPrice * totalShares : null;
    const roiAbs = !hasMultipleCurrencies && currentPrice != null ? (currentPrice - avgCost) * totalShares : null;
    const roiPct = !hasMultipleCurrencies && currentPrice != null ? ((currentPrice - avgCost) / avgCost) * 100 : null;

    return {
      ticker,
      totalShares,
      avgCost,
      currency,
      hasMultipleCurrencies,
      currentPrice,
      isFresh,
      priceDate,
      positionValue,
      roiAbs,
      roiPct,
    };
  });
}
