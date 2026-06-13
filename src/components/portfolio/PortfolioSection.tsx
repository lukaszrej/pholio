import { useState, useMemo, useCallback } from "react";
import { Pencil, Trash2, ChevronRight, ArrowUpDown, ChevronUp, ChevronDown, Plus } from "lucide-react";
import type { Portfolio } from "@/types/portfolio";
import type { Transaction } from "@/types/transaction";
import {
  computePositions,
  computePortfolioSummary,
  computeSectorAllocation,
  type PriceData,
  type PortfolioPosition,
} from "@/lib/portfolio";
import PortfolioSummaryCard from "@/components/portfolio/PortfolioSummaryCard";
import SectorAllocationChart from "@/components/portfolio/SectorAllocationChart";
import { Button } from "@/components/ui/button";
import { formatShares, formatSigned, pnlClass } from "@/lib/format";

type SortKey =
  | "totalShares"
  | "avgCost"
  | "currentPrice"
  | "costBasis"
  | "positionValue"
  | "roiAbs"
  | "roiPct"
  | "weightPct";

function sortIcon(key: Exclude<SortKey, "weightPct">, sortKey: SortKey, sortDir: "asc" | "desc") {
  if (sortKey !== key) return <ArrowUpDown className="ml-1 inline size-3 text-gray-400" />;
  return sortDir === "desc" ? (
    <ChevronDown className="ml-1 inline size-3" />
  ) : (
    <ChevronUp className="ml-1 inline size-3" />
  );
}

function formatCurrentPrice(pos: PortfolioPosition): string {
  if (pos.currentPrice === null) return "—";
  return pos.currentPrice.toFixed(2);
}

function formatPriceDate(pos: PortfolioPosition): string {
  if (pos.priceDate === null) return "—";
  const date = new Date(pos.priceDate);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

interface Props {
  portfolio: Portfolio;
  transactions: Transaction[];
  prices: Record<string, PriceData>;
  sectors: Record<string, string>;
  onAddTransaction: (portfolioId: string) => void;
  onEditPortfolio: (portfolio: Portfolio) => void;
  onDeletePortfolio: (portfolioId: string) => void;
  onShowLots: (ticker: string, portfolioId: string) => void;
}

export default function PortfolioSection({
  portfolio,
  transactions,
  prices,
  sectors,
  onAddTransaction,
  onEditPortfolio,
  onDeletePortfolio,
  onShowLots,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("weightPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const positions = useMemo(() => computePositions(transactions, prices), [transactions, prices]);
  const summary = useMemo(() => computePortfolioSummary(positions), [positions]);
  const sectorSlices = useMemo(() => computeSectorAllocation(positions, sectors), [positions, sectors]);

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [positions, sortKey, sortDir]);

  const handleSortClick = useCallback(
    (key: Exclude<SortKey, "weightPct">): void => {
      if (key === sortKey) {
        setSortDir(sortDir === "desc" ? "asc" : "desc");
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey, sortDir],
  );

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-xl font-semibold text-gray-800">{portfolio.name}</h2>
        <button
          type="button"
          className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          onClick={() => {
            onEditPortfolio(portfolio);
          }}
          aria-label={`Rename ${portfolio.name}`}
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
          onClick={() => {
            onDeletePortfolio(portfolio.id);
          }}
          aria-label={`Delete ${portfolio.name}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-gray-500">No positions yet</p>
          </div>
          <div className="border-t border-gray-100 px-5 py-4">
            <Button
              className="bg-emerald-500 text-white hover:bg-emerald-600"
              onClick={() => {
                onAddTransaction(portfolio.id);
              }}
            >
              Add transaction
            </Button>
          </div>
        </div>
      ) : (
        <>
          <PortfolioSummaryCard summary={summary} />

          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            {/* Positions table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="sticky left-0 z-20 bg-white px-4 py-3 font-medium">Ticker</th>
                    <th className="px-4 py-3 font-medium">% of net liq</th>
                    <th
                      className="cursor-pointer px-4 py-3 font-medium select-none"
                      onClick={() => {
                        handleSortClick("totalShares");
                      }}
                    >
                      Shares{sortIcon("totalShares", sortKey, sortDir)}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-medium select-none"
                      onClick={() => {
                        handleSortClick("avgCost");
                      }}
                    >
                      Avg. Price{sortIcon("avgCost", sortKey, sortDir)}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-medium select-none"
                      onClick={() => {
                        handleSortClick("currentPrice");
                      }}
                    >
                      Current Price{sortIcon("currentPrice", sortKey, sortDir)}
                    </th>
                    <th className="px-4 py-3 font-medium">Price Date</th>
                    <th
                      className="cursor-pointer px-4 py-3 font-medium select-none"
                      onClick={() => {
                        handleSortClick("costBasis");
                      }}
                    >
                      Cost basis{sortIcon("costBasis", sortKey, sortDir)}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-medium select-none"
                      onClick={() => {
                        handleSortClick("positionValue");
                      }}
                    >
                      Market value{sortIcon("positionValue", sortKey, sortDir)}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-medium select-none"
                      onClick={() => {
                        handleSortClick("roiAbs");
                      }}
                    >
                      Unrealized P&amp;L{sortIcon("roiAbs", sortKey, sortDir)}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 font-medium select-none"
                      onClick={() => {
                        handleSortClick("roiPct");
                      }}
                    >
                      Unrealized P&amp;L %{sortIcon("roiPct", sortKey, sortDir)}
                    </th>
                    <th className="w-8 px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPositions.map((pos) => (
                    <tr
                      key={pos.ticker}
                      className="group cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50"
                      onClick={() => {
                        onShowLots(pos.ticker, portfolio.id);
                      }}
                    >
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold group-hover:bg-gray-50">
                        {pos.ticker}
                      </td>
                      <td className="px-4 py-3">{pos.weightPct !== null ? `${pos.weightPct.toFixed(2)}%` : "—"}</td>
                      <td className="px-4 py-3">{formatShares(pos.totalShares)}</td>
                      <td className="px-4 py-3">
                        {pos.avgCost.toFixed(2)}
                        {!pos.hasMultipleCurrencies && <span className="ml-1 text-gray-500">{pos.currency}</span>}
                      </td>
                      <td className={!pos.isFresh ? "px-4 py-3 text-gray-400" : "px-4 py-3"}>
                        {formatCurrentPrice(pos)}
                      </td>
                      <td className={!pos.isFresh ? "px-4 py-3 text-gray-400" : "px-4 py-3"}>{formatPriceDate(pos)}</td>
                      <td className="px-4 py-3">{pos.costBasis.toFixed(2)}</td>
                      <td className="px-4 py-3">{pos.positionValue !== null ? pos.positionValue.toFixed(2) : "—"}</td>
                      <td className={`px-4 py-3 ${pnlClass(pos.roiAbs)}`}>
                        {pos.roiAbs !== null ? `${formatSigned(pos.roiAbs)} ${pos.currency}` : "—"}
                      </td>
                      <td className={`px-4 py-3 ${pnlClass(pos.roiPct)}`}>
                        {formatSigned(pos.roiPct)}
                        {pos.roiPct !== null && "%"}
                      </td>
                      <td className="px-2 py-3 text-gray-400">
                        <ChevronRight className="size-4" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add transaction */}
            <div className="px-4 pt-2 pb-5">
              <Button
                className="bg-gradient-to-r from-blue-600 to-violet-600 font-medium text-white shadow-sm transition-all duration-200 hover:from-blue-500 hover:to-violet-500 hover:shadow-md"
                onClick={() => {
                  onAddTransaction(portfolio.id);
                }}
              >
                <Plus className="mr-2 size-4" />
                Add transaction
              </Button>
            </div>

            {/* Sector chart */}
            <div className="p-5 pb-8">
              <h3 className="mb-4 text-base font-semibold text-gray-700">Sector Allocation</h3>
              <SectorAllocationChart slices={sectorSlices} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
