import type { PortfolioSummary } from "@/lib/portfolio";
import { formatSigned, pnlClass } from "@/lib/format";

interface Props {
  summary: PortfolioSummary;
}

export default function PortfolioSummaryCard({ summary }: Props) {
  const { positionCount, totalInvested, currentValue, totalPnL, totalPnLPct, currency, excludedCount } = summary;
  const currencyLabel = currency ? ` ${currency}` : "";

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-700">Portfolio Summary</h2>
        <span className="text-sm text-gray-400">
          {positionCount} {positionCount === 1 ? "position" : "positions"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div>
          <p className="mb-1 text-xs tracking-wide text-gray-500 uppercase">Total Invested</p>
          <p className="text-xl font-semibold text-gray-800">
            {totalInvested.toFixed(2)}
            {currencyLabel}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs tracking-wide text-gray-500 uppercase">Market value</p>
          <p className="text-xl font-semibold text-gray-800">
            {currentValue !== null ? `${currentValue.toFixed(2)}${currencyLabel}` : "—"}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs tracking-wide text-gray-500 uppercase">Unrealized P&amp;L</p>
          <p className={`text-xl font-semibold ${pnlClass(totalPnL)}`}>
            {totalPnL !== null ? `${formatSigned(totalPnL)}${currencyLabel}` : "—"}
            {totalPnLPct !== null && <span className="ml-2 text-sm font-normal">({formatSigned(totalPnLPct)}%)</span>}
          </p>
          {excludedCount > 0 && (
            <p className="mt-1 text-xs text-gray-400">
              Excludes {excludedCount} multi-currency {excludedCount === 1 ? "position" : "positions"}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
