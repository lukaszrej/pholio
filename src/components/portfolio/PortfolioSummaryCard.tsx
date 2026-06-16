import type { PortfolioSummary } from "@/lib/portfolio";
import { formatSigned, formatNum } from "@/lib/format";

interface Props {
  summary: PortfolioSummary;
}

function pnlColor(value: number | null): string {
  if (value === null) return "#7A6E60";
  return value >= 0 ? "#0a9d6e" : "#c41230";
}

export default function PortfolioSummaryCard({ summary }: Props) {
  const { totalInvested, currentValue, totalPnL, totalPnLPct, currency, excludedCount } = summary;
  const cur = currency ?? "";

  return (
    <div className="summary-grid">
      <div className="summary-cell">
        <div
          style={{
            fontSize: 10,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "#7A6E60",
            marginBottom: 9,
          }}
        >
          Total Invested
        </div>
        <div
          className="font-numeric"
          style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.01em", color: "#1A1A2E" }}
        >
          {formatNum(totalInvested)}
          {cur && <small style={{ fontSize: 12, color: "#7A6E60", fontWeight: 400, marginLeft: 6 }}>{cur}</small>}
        </div>
      </div>

      <div className="summary-cell">
        <div
          style={{
            fontSize: 10,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "#7A6E60",
            marginBottom: 9,
          }}
        >
          Market Value
        </div>
        <div
          className="font-numeric"
          style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.01em", color: "#1A1A2E" }}
        >
          {currentValue !== null ? formatNum(currentValue) : "—"}
          {cur && currentValue !== null && (
            <small style={{ fontSize: 12, color: "#7A6E60", fontWeight: 400, marginLeft: 6 }}>{cur}</small>
          )}
        </div>
      </div>

      <div className="summary-cell">
        <div
          style={{
            fontSize: 10,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "#7A6E60",
            marginBottom: 9,
          }}
        >
          Unrealized P&amp;L
        </div>
        <div
          className="font-numeric"
          style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.01em", color: pnlColor(totalPnL) }}
        >
          {totalPnL !== null ? formatSigned(totalPnL) : "—"}
          {cur && totalPnL !== null && <small style={{ fontSize: 12, fontWeight: 400, marginLeft: 6 }}>{cur}</small>}
        </div>
        {excludedCount > 0 && (
          <p style={{ marginTop: 4, fontSize: 11, color: "#A89E90" }}>
            Excludes {excludedCount} multi-currency {excludedCount === 1 ? "position" : "positions"}.
          </p>
        )}
      </div>

      <div className="summary-cell">
        <div
          style={{
            fontSize: 10,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "#7A6E60",
            marginBottom: 9,
          }}
        >
          P&amp;L %
        </div>
        <div
          className="font-numeric"
          style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.01em", color: pnlColor(totalPnLPct) }}
        >
          {totalPnLPct !== null ? `${formatSigned(totalPnLPct)}%` : "—"}
        </div>
      </div>
    </div>
  );
}
