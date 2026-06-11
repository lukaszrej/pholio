import type { PortfolioSummary } from "@/lib/portfolio";

interface Props {
  summary: PortfolioSummary;
}

function pnlClass(value: number | null): string {
  if (value === null) return "text-gray-400";
  return value >= 0 ? "text-emerald-600" : "text-red-600";
}

function formatSigned(value: number | null, decimals = 2): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}`;
}

export default function PortfolioSummaryCard({ summary }: Props) {
  const { positionCount, totalInvested, currentValue, totalPnL, totalPnLPct, currency } = summary;
  const currencyLabel = currency ? ` ${currency}` : "";

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-700">Portfolio Summary</h2>
        <span className="text-sm text-gray-400">
          {positionCount} {positionCount === 1 ? "position" : "positions"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Total Invested</p>
          <p className="text-xl font-semibold text-gray-800">
            {totalInvested.toFixed(2)}
            {currencyLabel}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Current Value</p>
          <p className="text-xl font-semibold text-gray-800">
            {currentValue !== null ? `${currentValue.toFixed(2)}${currencyLabel}` : "—"}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Unrealized P&amp;L</p>
          <p className={`text-xl font-semibold ${pnlClass(totalPnL)}`}>
            {totalPnL !== null ? `${formatSigned(totalPnL)}${currencyLabel}` : "—"}
            {totalPnLPct !== null && (
              <span className="ml-2 text-sm font-normal">({formatSigned(totalPnLPct)}%)</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
