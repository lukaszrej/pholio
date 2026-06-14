import type { PortfolioSummary } from "@/lib/portfolio";
import { formatSigned } from "@/lib/format";

interface Props {
  summary: PortfolioSummary;
  title?: string;
}

function pnlColor(value: number | null): string {
  if (value === null) return "#5e6e85";
  return value >= 0 ? "#0a9d6e" : "#e23950";
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
            color: "#5e6e85",
            marginBottom: 9,
          }}
        >
          Total Invested
        </div>
        <div
          className="font-numeric"
          style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.01em", color: "#0f1825" }}
        >
          {totalInvested.toFixed(2)}
          {cur && <small style={{ fontSize: 12, color: "#5e6e85", fontWeight: 400, marginLeft: 6 }}>{cur}</small>}
        </div>
      </div>

      <div className="summary-cell">
        <div
          style={{
            fontSize: 10,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "#5e6e85",
            marginBottom: 9,
          }}
        >
          Market Value
        </div>
        <div
          className="font-numeric"
          style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-.01em", color: "#0f1825" }}
        >
          {currentValue !== null ? currentValue.toFixed(2) : "—"}
          {cur && currentValue !== null && (
            <small style={{ fontSize: 12, color: "#5e6e85", fontWeight: 400, marginLeft: 6 }}>{cur}</small>
          )}
        </div>
      </div>

      <div className="summary-cell">
        <div
          style={{
            fontSize: 10,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "#5e6e85",
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
          <p style={{ marginTop: 4, fontSize: 11, color: "#93a1b5" }}>
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
            color: "#5e6e85",
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
