import { useMemo } from "react";
import type { ReactNode } from "react";
import type { PortfolioPosition, PortfolioSummary, PriceData } from "@/lib/portfolio";
import { formatSigned, formatNum } from "@/lib/format";

interface Props {
  summary: PortfolioSummary;
  positions: PortfolioPosition[];
  prices?: Record<string, PriceData>;
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "#6b7c96",
  fontWeight: 600,
  marginBottom: 7,
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 11.5,
  fontWeight: 500,
  color: "#6b7c96",
  background: "#eff2f8",
  border: "1px solid #dde3ee",
  borderRadius: 2,
  padding: "4px 9px",
};

function pnlColor(value: number | null): string {
  if (value === null) return "#9aaabb";
  return value >= 0 ? "#0a9d6e" : "#c41230";
}

function SecStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ps-sec-stat">
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: ".13em",
          textTransform: "uppercase",
          color: "#9aaabb",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div
        className="font-numeric"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#1a1a2e",
          letterSpacing: "-.01em",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function PortfolioSummaryCard({ summary, positions, prices }: Props) {
  const { totalInvested, currentValue, totalPnL, totalPnLPct, currency, positionCount, excludedCount } = summary;
  const cur = currency ?? "";

  const { dayPnL, dayPnLPct } = useMemo(() => {
    const priced = positions.filter(
      (p): p is PortfolioPosition & { currentPrice: number; changePct: number } =>
        p.changePct !== null && p.currentPrice !== null,
    );
    if (priced.length === 0) return { dayPnL: null, dayPnLPct: null };
    let daySum = 0;
    let prevSum = 0;
    for (const p of priced) {
      const price = p.currentPrice;
      const pct = p.changePct;
      const prev = price / (1 + pct / 100);
      daySum += (price - prev) * p.totalShares;
      prevSum += prev * p.totalShares;
    }
    return {
      dayPnL: daySum,
      dayPnLPct: prevSum > 0 ? (daySum / prevSum) * 100 : null,
    };
  }, [positions]);

  const { dayLow, dayHigh } = useMemo(() => {
    if (!prices) return { dayLow: null, dayHigh: null };
    let lowSum = 0;
    let highSum = 0;
    let hasData = false;
    for (const p of positions) {
      const pd = prices[p.ticker] as PriceData | undefined;
      if (pd?.low != null && pd.high != null) {
        lowSum += pd.low * p.totalShares;
        highSum += pd.high * p.totalShares;
        hasData = true;
      }
    }
    return hasData ? { dayLow: lowSum, dayHigh: highSum } : { dayLow: null, dayHigh: null };
  }, [positions, prices]);

  const winners = positions.filter((p) => p.changePct !== null && p.changePct > 0).length;
  const losers = positions.filter((p) => p.changePct !== null && p.changePct < 0).length;
  const isLive = positions.some((p) => p.isFresh);

  return (
    <div style={{ background: "#f8fafb", border: "1px solid #dde3ee", marginBottom: 1 }}>
      {/* Tier 1: primary numbers */}
      <div className="ps-primary">
        {/* Portfolio value */}
        <div className="ps-main-value">
          <div className="ps-main-label">Portfolio value</div>
          <div className="font-numeric ps-main-number">
            {currentValue !== null ? formatNum(currentValue) : "—"}
            {cur && currentValue !== null && (
              <span style={{ fontSize: 14, fontWeight: 400, color: "#6b7c96", marginLeft: 6 }}>{cur}</span>
            )}
          </div>
        </div>

        {/* Today's P&L + Cost basis — two-col grid on mobile, contents on desktop */}
        <div className="ps-two-col">
          <div className="ps-day">
            <div style={labelStyle}>Today&apos;s P&amp;L</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <span className="font-numeric ps-day-value" style={{ color: pnlColor(dayPnL) }}>
                {dayPnL !== null ? (
                  <>
                    <span style={{ fontSize: "0.7em", transform: "translateY(-2px)", display: "inline-block" }}>
                      {dayPnL >= 0 ? "▲" : "▼"}
                    </span>{" "}
                    {formatNum(Math.abs(dayPnL))}
                  </>
                ) : (
                  "—"
                )}
              </span>
              {dayPnLPct !== null && (
                <span className="font-numeric ps-day-pct" style={{ color: pnlColor(dayPnLPct) }}>
                  {formatSigned(dayPnLPct)}%
                </span>
              )}
            </div>
          </div>

          <div className="ps-basis">
            <div style={labelStyle}>Cost basis</div>
            <div className="font-numeric ps-basis-value">{formatNum(totalInvested)}</div>
          </div>
        </div>

        {/* Meta pills */}
        <div className="ps-meta">
          <span style={pillStyle}>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            {positionCount} position{positionCount !== 1 ? "s" : ""}
          </span>
          {isLive && (
            <span style={pillStyle}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#0a9d6e",
                  boxShadow: "0 0 0 2.5px rgba(10,157,110,.10)",
                  flexShrink: 0,
                }}
              />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Tier 2: secondary stats strip */}
      <div className="ps-secondary">
        <SecStat label="Unrealized P&L">
          <span className="font-numeric" style={{ color: pnlColor(totalPnL) }}>
            {totalPnL !== null ? formatSigned(totalPnL) : "—"}
          </span>
          {totalPnLPct !== null && (
            <span
              className="font-numeric"
              style={{ fontSize: 11, fontWeight: 500, color: pnlColor(totalPnLPct), marginLeft: 6 }}
            >
              {formatSigned(totalPnLPct)}%
            </span>
          )}
        </SecStat>

        <SecStat label="Total return">
          <span className="font-numeric" style={{ color: pnlColor(totalPnLPct) }}>
            {totalPnLPct !== null ? `${formatSigned(totalPnLPct)}%` : "—"}
          </span>
        </SecStat>

        <SecStat label="Return multiple">
          <span className="font-numeric">{totalPnLPct !== null ? `${formatNum(1 + totalPnLPct / 100, 2)}×` : "—"}</span>
        </SecStat>

        <SecStat label="Day's range">
          {dayLow !== null ? (
            <>
              <span className="font-numeric" style={{ color: "#6b7c96" }}>
                {formatNum(dayLow)}
              </span>
              <span style={{ color: "#9aaabb", fontFamily: "var(--font-sans)", margin: "0 8px", fontSize: 11 }}>–</span>
              <span className="font-numeric">{formatNum(dayHigh)}</span>
            </>
          ) : (
            <span style={{ color: "#9aaabb" }}>—</span>
          )}
        </SecStat>

        <SecStat label="Winners / Losers">
          <span className="font-numeric" style={{ color: "#0a9d6e" }}>
            {winners}
          </span>
          <span style={{ color: "#dde3ee", fontFamily: "var(--font-sans)", fontWeight: 300, margin: "0 4px" }}>/</span>
          <span className="font-numeric" style={{ color: "#c41230" }}>
            {losers}
          </span>
        </SecStat>
      </div>

      {excludedCount > 0 && (
        <div className="ps-excluded">
          Excludes {excludedCount} multi-currency {excludedCount === 1 ? "position" : "positions"}.
        </div>
      )}
    </div>
  );
}
