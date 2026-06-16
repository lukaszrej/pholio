import { useState } from "react";
import type { PortfolioPosition } from "@/lib/portfolio";
import type { Portfolio } from "@/types/portfolio";
import { formatNum } from "@/lib/format";

function fmtValue(n: number | null): string {
  if (n === null) return "—";
  if (n >= 10000) return "$" + (n / 1000).toFixed(1) + "K";
  return "$" + formatNum(n);
}

interface TickerCardProps {
  pos: PortfolioPosition;
  sector: string;
  onClick?: () => void;
}

export function TickerCard({ pos, sector, onClick }: TickerCardProps) {
  const [hovered, setHovered] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const gain = pos.roiPct !== null && pos.roiPct >= 0;
  const alloc = pos.weightPct ?? 0;

  function handleClick() {
    if (!onClick || flashing) return;
    setFlashing(true);
    setTimeout(() => {
      setFlashing(false);
      onClick();
    }, 350);
  }

  const borderColor = flashing ? "#c41230" : hovered ? "rgba(196,18,48,.25)" : "#DDE3EE";
  const boxShadow = flashing
    ? "0 4px 16px -6px rgba(196,18,48,.3), inset 0 -2px 0 #c41230"
    : hovered
      ? "0 4px 16px -6px rgba(196,18,48,.15)"
      : "0 1px 3px rgba(26,26,46,.04)";

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
      style={{
        background: "#F8FAFB",
        border: `1px solid ${borderColor}`,
        borderRadius: 4,
        padding: "14px 15px 12px",
        display: "flex",
        flexDirection: "column",
        cursor: onClick ? "pointer" : "default",
        transition: "border-color .16s, box-shadow .16s",
        userSelect: "none",
        boxShadow,
      }}
    >
      {/* Top row: ticker + PnL badge */}
      <div
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6, marginBottom: 3 }}
      >
        <span
          style={{
            fontFamily: "var(--font-numeric)",
            fontWeight: 700,
            fontSize: 14.5,
            letterSpacing: ".02em",
            color: "#1A1A2E",
            lineHeight: 1,
          }}
        >
          {pos.ticker}
        </span>
        {pos.roiPct !== null && (
          <span
            style={{
              fontFamily: "var(--font-numeric)",
              fontSize: 11.5,
              fontWeight: 600,
              padding: "2px 7px",
              borderRadius: 3,
              whiteSpace: "nowrap",
              flexShrink: 0,
              lineHeight: 1.6,
              color: gain ? "#0a9d6e" : "#c41230",
              background: gain ? "rgba(10,157,110,.12)" : "rgba(196,18,48,.10)",
            }}
          >
            {gain ? "▲" : "▼"}&nbsp;{gain ? "+" : ""}
            {Math.abs(pos.roiPct).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Sector label */}
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "#7A6E60",
          marginBottom: 12,
        }}
      >
        {sector}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "#E6EBF5", margin: "0 -15px", marginBottom: 12 }} />

      {/* Bottom row: market value + allocation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-numeric)",
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "-.01em",
              color: "#1A1A2E",
              lineHeight: 1,
            }}
          >
            {fmtValue(pos.positionValue)}
          </div>
          <div
            style={{
              fontSize: 9.5,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "#7A6E60",
              marginTop: 4,
            }}
          >
            Mkt Value
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontFamily: "var(--font-numeric)",
              fontSize: 15,
              fontWeight: 600,
              color: "#1A1A2E",
              lineHeight: 1,
            }}
          >
            {alloc.toFixed(1)}%
          </div>
          <div
            style={{
              fontSize: 9.5,
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "#7A6E60",
              marginTop: 4,
            }}
          >
            Allocation
          </div>
          <div
            style={{
              marginTop: 7,
              height: 2,
              width: 54,
              background: "#DDE3EE",
              borderRadius: 1,
              overflow: "hidden",
              marginLeft: "auto",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(alloc, 100)}%`,
                background: "#c41230",
                borderRadius: 1,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface CardSectionProps {
  portfolio: Portfolio;
  positions: PortfolioPosition[];
  sectors: Record<string, string>;
  onAddTransaction: (portfolioId: string) => void;
  onNavigate?: () => void;
}

export default function CardSection({ portfolio, positions, sectors, onAddTransaction, onNavigate }: CardSectionProps) {
  if (positions.length === 0) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          paddingBottom: 9,
          borderBottom: "1px solid #DDE3EE",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "#7A6E60",
          }}
        >
          {portfolio.name}{" "}
          <span style={{ fontFamily: "var(--font-numeric)", fontWeight: 400, color: "#A89E90" }}>
            {positions.length} position{positions.length !== 1 ? "s" : ""}
          </span>
        </span>
        <button
          onClick={() => {
            onAddTransaction(portfolio.id);
          }}
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 11,
            fontWeight: 500,
            color: "#c41230",
            background: "transparent",
            border: "1px solid #c41230",
            borderRadius: 3,
            padding: "3px 11px",
            cursor: "pointer",
            opacity: 0.85,
          }}
        >
          + Add
        </button>
      </div>

      {/* Card grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(188px, 1fr))",
          gap: 10,
        }}
      >
        {positions.map((pos) => (
          <TickerCard key={pos.ticker} pos={pos} sector={sectors[pos.ticker] ?? "Other"} onClick={onNavigate} />
        ))}
      </div>
    </div>
  );
}
