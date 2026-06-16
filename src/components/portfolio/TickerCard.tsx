import { useState } from "react";
import type { PortfolioPosition } from "@/lib/portfolio";
import type { Portfolio } from "@/types/portfolio";
import { formatNum } from "@/lib/format";

type CardSize = "xl" | "lg" | "md" | "sm";

function heatBg(roiPct: number | null): string {
  if (roiPct === null) return "#F8FAFB";
  const intensity = Math.min(Math.abs(roiPct) / 14, 1);
  const alpha = (0.035 + intensity * 0.095).toFixed(3);
  return roiPct >= 0 ? `rgba(10,157,110,${alpha})` : `rgba(196,18,48,${alpha})`;
}

function getSize(weightPct: number): CardSize {
  if (weightPct >= 24) return "xl";
  if (weightPct >= 14) return "lg";
  if (weightPct >= 7) return "md";
  return "sm";
}

const SPANS: Record<CardSize, { col: number; row: number }> = {
  xl: { col: 3, row: 2 },
  lg: { col: 2, row: 2 },
  md: { col: 2, row: 1 },
  sm: { col: 1, row: 1 },
};

function fmtMktValue(n: number | null): string {
  if (n === null) return "—";
  return n >= 10000 ? "$" + (n / 1000).toFixed(1) + "K" : "$" + n.toFixed(0);
}

interface TickerCardProps {
  pos: PortfolioPosition;
  sector: string;
  size?: CardSize;
  onClick?: () => void;
}

export function TickerCard({ pos, sector, size = "sm", onClick }: TickerCardProps) {
  const [hovered, setHovered] = useState(false);
  const gain = pos.roiPct !== null && pos.roiPct >= 0;
  const alloc = pos.weightPct ?? 0;
  const isXL = size === "xl";
  const isBig = size === "xl" || size === "lg";
  const isMD = size === "md";

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
      style={{
        background: heatBg(pos.roiPct),
        border: `1px solid ${hovered ? (gain ? "rgba(10,157,110,.35)" : "rgba(196,18,48,.35)") : "#DDE3EE"}`,
        borderRadius: 5,
        padding: isXL ? "18px 20px" : isBig ? "14px 16px" : isMD ? "11px 14px" : "10px 12px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        boxSizing: "border-box",
        cursor: onClick ? "pointer" : "default",
        overflow: "hidden",
        boxShadow: hovered ? "0 4px 16px rgba(0,0,0,.09)" : "0 1px 3px rgba(0,0,0,.05)",
        transition: "box-shadow .18s, border-color .18s",
        userSelect: "none",
      }}
    >
      {/* Top: ticker + P&L badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-numeric)",
              fontWeight: 700,
              letterSpacing: ".03em",
              fontSize: isXL ? 20 : isBig ? 15 : isMD ? 13 : 12,
              color: "#1A1A2E",
              lineHeight: 1,
            }}
          >
            {pos.ticker}
          </div>
          {isBig && (
            <div
              style={{
                fontSize: 9.5,
                color: "#7A6E60",
                marginTop: 3,
                textTransform: "uppercase",
                letterSpacing: ".09em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {sector}
            </div>
          )}
        </div>
        {pos.roiPct !== null && (
          <span
            style={{
              fontFamily: "var(--font-numeric)",
              fontSize: isXL ? 12 : 10.5,
              fontWeight: 600,
              padding: isXL ? "3px 8px" : "2px 6px",
              borderRadius: 3,
              whiteSpace: "nowrap",
              flexShrink: 0,
              lineHeight: 1.6,
              color: gain ? "#0a9d6e" : "#c41230",
              background: gain ? "rgba(10,157,110,.12)" : "rgba(196,18,48,.10)",
            }}
          >
            {gain ? "▲" : "▼"} {Math.abs(pos.roiPct).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Large size: current price prominently */}
      {isBig && (
        <div style={{ marginTop: 6 }}>
          <div
            style={{
              fontFamily: "var(--font-numeric)",
              fontVariantNumeric: "tabular-nums",
              fontSize: isXL ? 30 : 22,
              fontWeight: 600,
              color: "#1A1A2E",
              letterSpacing: "-.02em",
              lineHeight: 1,
            }}
          >
            {pos.currentPrice !== null ? "$" + formatNum(pos.currentPrice) : "—"}
          </div>
          {isXL && pos.roiAbs !== null && (
            <div
              style={{
                fontFamily: "var(--font-numeric)",
                fontSize: 13,
                color: gain ? "#0a9d6e" : "#c41230",
                marginTop: 5,
              }}
            >
              {gain ? "+" : "−"}${formatNum(Math.abs(pos.roiAbs))}
            </div>
          )}
        </div>
      )}

      {/* Bottom: value + allocation */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginTop: isBig ? 10 : 6,
          gap: 4,
        }}
      >
        <div>
          {!isBig && (
            <div
              style={{
                fontFamily: "var(--font-numeric)",
                fontVariantNumeric: "tabular-nums",
                fontSize: isMD ? 12 : 11,
                fontWeight: 600,
                color: "#1A1A2E",
              }}
            >
              {pos.currentPrice !== null ? "$" + formatNum(pos.currentPrice) : "—"}
            </div>
          )}
          {isBig && (
            <div>
              <div style={{ fontFamily: "var(--font-numeric)", fontSize: 12, fontWeight: 600, color: "#1A1A2E" }}>
                {fmtMktValue(pos.positionValue)}
              </div>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: ".08em",
                  textTransform: "uppercase",
                  color: "#7A6E60",
                  marginTop: 2,
                }}
              >
                Mkt Value
              </div>
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-numeric)",
              fontVariantNumeric: "tabular-nums",
              fontSize: isBig ? 14 : 11,
              fontWeight: 600,
              color: "#1A1A2E",
            }}
          >
            {alloc.toFixed(1)}%
          </div>
          {isBig && (
            <div
              style={{
                marginTop: 5,
                height: 3,
                width: 52,
                background: "#DDE3EE",
                borderRadius: 2,
                overflow: "hidden",
                marginLeft: "auto",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(alloc * 2.5, 100)}%`,
                  background: gain ? "#0a9d6e" : "#c41230",
                  borderRadius: 2,
                }}
              />
            </div>
          )}
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

  const sorted = [...positions].sort((a, b) => (b.weightPct ?? 0) - (a.weightPct ?? 0));

  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          paddingBottom: 10,
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
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "1";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = "0.85";
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gridAutoRows: "92px",
          gap: 8,
        }}
      >
        {sorted.map((pos) => {
          const size = getSize(pos.weightPct ?? 0);
          const { col, row } = SPANS[size];
          return (
            <div key={pos.ticker} style={{ gridColumn: `span ${col}`, gridRow: `span ${row}` }}>
              <TickerCard pos={pos} sector={sectors[pos.ticker] ?? "Other"} size={size} onClick={onNavigate} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
