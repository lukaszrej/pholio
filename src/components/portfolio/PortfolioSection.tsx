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
  type SectorSlice,
} from "@/lib/portfolio";
import PortfolioSummaryCard from "@/components/portfolio/PortfolioSummaryCard";
import SectorAllocationChart from "@/components/portfolio/SectorAllocationChart";
import { Button } from "@/components/ui/button";
import { formatShares, formatSigned, formatNum, pnlClass } from "@/lib/format";

type SortKey =
  | "totalShares"
  | "avgCost"
  | "currentPrice"
  | "costBasis"
  | "positionValue"
  | "roiAbs"
  | "roiPct"
  | "weightPct";

const SECTOR_COLORS: Partial<Record<string, string>> = {
  Technology: "#0a86d8",
  Financials: "#7c3aed",
  Healthcare: "#0a9d6e",
  Energy: "#d9890b",
  "Consumer Discretionary": "#c41230",
  Industrials: "#3B82F6",
  "Communication Services": "#8B5CF6",
  Materials: "#EC4899",
  Utilities: "#14B8A6",
  "Real Estate": "#84CC16",
  Other: "#A89E90",
};
const FALLBACK_PALETTE = [
  "#0a86d8",
  "#7c3aed",
  "#0a9d6e",
  "#d9890b",
  "#c41230",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#84CC16",
];

function getSectorColor(sector: string, index: number): string {
  return SECTOR_COLORS[sector] ?? FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

function SectorAllocationBar({ slices }: { slices: SectorSlice[] }) {
  if (slices.length === 0) {
    return <p style={{ fontSize: 12, color: "#A89E90" }}>No data</p>;
  }
  return (
    <>
      <div
        style={{
          display: "flex",
          height: 12,
          borderRadius: 2,
          overflow: "hidden",
          marginBottom: 18,
          boxShadow: "inset 0 0 0 1px #E6EBF5",
        }}
      >
        {slices.map((s, i) => (
          <div
            key={s.sector}
            style={{ width: `${s.percentage}%`, background: getSectorColor(s.sector, i), flexShrink: 0 }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {slices.map((s, i) => (
          <div
            key={s.sector}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 9, color: "#2E2E44" }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: getSectorColor(s.sector, i),
                  flexShrink: 0,
                }}
              />
              {s.sector}
            </span>
            <span className="font-numeric" style={{ color: "#7A6E60" }}>
              {s.percentage.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

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
  return formatNum(pos.currentPrice);
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
  compact?: boolean;
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
  compact = false,
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

  const sectionHeader = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, paddingTop: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#1A1A2E", margin: 0 }}>{portfolio.name}</h2>
      <button
        type="button"
        style={{
          background: "none",
          border: "none",
          padding: "4px",
          borderRadius: 4,
          color: "#A89E90",
          cursor: "pointer",
        }}
        onClick={() => {
          onEditPortfolio(portfolio);
        }}
        aria-label={`Rename ${portfolio.name}`}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#EFF2F8";
          e.currentTarget.style.color = "#7A6E60";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "none";
          e.currentTarget.style.color = "#A89E90";
        }}
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        style={{
          background: "none",
          border: "none",
          padding: "4px",
          borderRadius: 4,
          color: "#A89E90",
          cursor: "pointer",
        }}
        onClick={() => {
          onDeletePortfolio(portfolio.id);
        }}
        aria-label={`Delete ${portfolio.name}`}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(226,57,80,.08)";
          e.currentTarget.style.color = "#c41230";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "none";
          e.currentTarget.style.color = "#A89E90";
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  if (transactions.length === 0) {
    return (
      <div style={{ marginBottom: compact ? 24 : 0 }}>
        {compact && sectionHeader}
        <div style={{ border: "1px solid #DDE3EE", background: "#F8FAFB", padding: "48px 20px", textAlign: "center" }}>
          <p style={{ color: "#7A6E60", marginBottom: 16 }}>No positions yet</p>
          <button
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "linear-gradient(135deg, #c41230, #8b0d21)",
              color: "#fff",
              border: 0,
              borderRadius: 3,
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              fontSize: 13,
              padding: "11px 18px",
              cursor: "pointer",
              boxShadow: "0 8px 20px -8px rgba(196,18,48,.5)",
            }}
            onClick={() => {
              onAddTransaction(portfolio.id);
            }}
          >
            <Plus size={15} color="#fff" />
            Add transaction
          </button>
        </div>
      </div>
    );
  }

  /* ── COMPACT MODE: existing stacked layout with summary card ── */
  if (compact) {
    return (
      <div style={{ marginBottom: 32 }}>
        {sectionHeader}
        <PortfolioSummaryCard summary={summary} />

        <div style={{ border: "1px solid #DDE3EE", background: "#F8FAFB", boxShadow: "0 1px 2px rgba(15,24,37,.04)" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #DDE3EE", textAlign: "left" }}>
                  <th
                    style={{
                      padding: "11px 14px",
                      fontWeight: 500,
                      fontSize: 10,
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: "#7A6E60",
                      background: "#EFF2F8",
                      position: "sticky",
                      left: 0,
                      zIndex: 10,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Ticker
                  </th>
                  {(
                    [
                      "totalShares",
                      "avgCost",
                      "currentPrice",
                      "costBasis",
                      "positionValue",
                      "roiAbs",
                      "roiPct",
                    ] as const
                  ).map((k) => (
                    <th
                      key={k}
                      style={{
                        padding: "11px 14px",
                        fontWeight: 500,
                        fontSize: 10,
                        letterSpacing: ".1em",
                        textTransform: "uppercase",
                        color: "#7A6E60",
                        background: "#EFF2F8",
                        textAlign: "right",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        userSelect: "none",
                      }}
                      onClick={() => {
                        handleSortClick(k);
                      }}
                    >
                      {k === "totalShares"
                        ? "Shares"
                        : k === "avgCost"
                          ? "Avg"
                          : k === "currentPrice"
                            ? "Last"
                            : k === "costBasis"
                              ? "Cost basis"
                              : k === "positionValue"
                                ? "Mkt value"
                                : k === "roiAbs"
                                  ? "P&L"
                                  : "P&L %"}
                      {sortIcon(k, sortKey, sortDir)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPositions.map((pos) => {
                  const sIdx = sectorSlices.findIndex(
                    (s) => sectors[pos.ticker] === s.sector || (!sectors[pos.ticker] && s.sector === "Other"),
                  );
                  const dotColor = getSectorColor(sectors[pos.ticker] ?? "Other", sIdx >= 0 ? sIdx : 0);
                  return (
                    <tr
                      key={pos.ticker}
                      style={{ borderBottom: "1px solid #E6EBF5", cursor: "pointer" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#FBF4F5";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                      onClick={() => {
                        onShowLots(pos.ticker, portfolio.id);
                      }}
                    >
                      <td
                        style={{
                          padding: "10px 14px",
                          fontWeight: 600,
                          color: "#1A1A2E",
                          letterSpacing: ".02em",
                          position: "sticky",
                          left: 0,
                          background: "#F8FAFB",
                          zIndex: 10,
                        }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: dotColor,
                            marginRight: 7,
                            verticalAlign: "middle",
                          }}
                        />
                        {pos.ticker}
                      </td>
                      <td className="font-numeric" style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5 }}>
                        {formatShares(pos.totalShares)}
                      </td>
                      <td className="font-numeric" style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5 }}>
                        {formatNum(pos.avgCost)}
                      </td>
                      <td
                        className="font-numeric"
                        style={{
                          padding: "10px 14px",
                          textAlign: "right",
                          fontSize: 12.5,
                          color: !pos.isFresh ? "#A89E90" : undefined,
                        }}
                      >
                        {formatCurrentPrice(pos)}
                      </td>
                      <td className="font-numeric" style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5 }}>
                        {formatNum(pos.costBasis)}
                      </td>
                      <td
                        className="font-numeric"
                        style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5, fontWeight: 700 }}
                      >
                        {pos.positionValue !== null ? formatNum(pos.positionValue) : "—"}
                      </td>
                      <td className="font-numeric" style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5 }}>
                        {pos.roiAbs !== null ? formatSigned(pos.roiAbs) : "—"}
                      </td>
                      <td
                        className={`font-numeric ${pnlClass(pos.roiPct)}`}
                        style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5 }}
                      >
                        {formatSigned(pos.roiPct, 2, false)}
                        {pos.roiPct !== null && "%"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: "10px 14px 16px" }}>
            <Button
              style={{
                background: "linear-gradient(135deg, #c41230, #8b0d21)",
                color: "#fff",
                boxShadow: "0 8px 20px -8px rgba(196,18,48,.5)",
              }}
              onClick={() => {
                onAddTransaction(portfolio.id);
              }}
            >
              <Plus className="mr-2 size-4" />
              Add transaction
            </Button>
          </div>
          <div style={{ padding: "0 18px 24px" }}>
            <h3
              style={{
                fontSize: 10,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: "#7A6E60",
                margin: "0 0 16px",
                fontWeight: 600,
              }}
            >
              Sector Allocation
            </h3>
            <SectorAllocationChart slices={sectorSlices} />
          </div>
        </div>
      </div>
    );
  }

  /* ── FULL MODE: [holdings | sidebar] layout, no internal summary card ── */
  return (
    <div>
      {sectionHeader}

      <div className="portfolio-content">
        {/* Holdings panel */}
        <div style={{ background: "#F8FAFB", border: "1px solid #DDE3EE", overflow: "hidden" }}>
          {/* Desktop table */}
          <div className="holdings-table" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#EFF2F8", borderBottom: "1px solid #DDE3EE" }}>
                  <th
                    style={{
                      padding: "11px 14px",
                      textAlign: "left",
                      fontWeight: 500,
                      fontSize: 10,
                      letterSpacing: ".1em",
                      textTransform: "uppercase",
                      color: "#7A6E60",
                      cursor: "default",
                    }}
                  >
                    Ticker
                  </th>
                  {(
                    [
                      "totalShares",
                      "avgCost",
                      "currentPrice",
                      "costBasis",
                      "positionValue",
                      "roiAbs",
                      "roiPct",
                    ] as const
                  ).map((k) => (
                    <th
                      key={k}
                      style={{
                        padding: "11px 14px",
                        textAlign: "right",
                        fontWeight: 500,
                        fontSize: 10,
                        letterSpacing: ".1em",
                        textTransform: "uppercase",
                        color: "#7A6E60",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        userSelect: "none",
                      }}
                      onClick={() => {
                        handleSortClick(k);
                      }}
                    >
                      {k === "totalShares"
                        ? "Shares"
                        : k === "avgCost"
                          ? "Avg"
                          : k === "currentPrice"
                            ? "Last"
                            : k === "costBasis"
                              ? "Cost basis"
                              : k === "positionValue"
                                ? "Mkt value"
                                : k === "roiAbs"
                                  ? "P&L"
                                  : "P&L %"}
                      {sortIcon(k, sortKey, sortDir)}
                    </th>
                  ))}
                  <th style={{ width: 32, padding: "11px 8px", background: "#EFF2F8" }} />
                </tr>
              </thead>
              <tbody>
                {sortedPositions.map((pos) => {
                  const sIdx = sectorSlices.findIndex(
                    (s) => sectors[pos.ticker] === s.sector || (!sectors[pos.ticker] && s.sector === "Other"),
                  );
                  const dotColor = getSectorColor(sectors[pos.ticker] ?? "Other", sIdx >= 0 ? sIdx : 0);
                  return (
                    <tr
                      key={pos.ticker}
                      style={{ borderBottom: "1px solid #E6EBF5", cursor: "pointer" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#FBF4F5";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                      onClick={() => {
                        onShowLots(pos.ticker, portfolio.id);
                      }}
                    >
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1A1A2E", letterSpacing: ".02em" }}>
                        <span
                          style={{
                            display: "inline-block",
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: dotColor,
                            marginRight: 7,
                            verticalAlign: "middle",
                          }}
                        />
                        {pos.ticker}
                      </td>
                      <td className="font-numeric" style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5 }}>
                        {formatShares(pos.totalShares)}
                      </td>
                      <td className="font-numeric" style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5 }}>
                        {formatNum(pos.avgCost)}
                      </td>
                      <td
                        className="font-numeric"
                        style={{
                          padding: "10px 14px",
                          textAlign: "right",
                          fontSize: 12.5,
                          color: !pos.isFresh ? "#A89E90" : undefined,
                        }}
                      >
                        {formatCurrentPrice(pos)}
                      </td>
                      <td className="font-numeric" style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5 }}>
                        {formatNum(pos.costBasis)}
                      </td>
                      <td
                        className="font-numeric"
                        style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5, fontWeight: 700 }}
                      >
                        {pos.positionValue !== null ? formatNum(pos.positionValue) : "—"}
                      </td>
                      <td className="font-numeric" style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5 }}>
                        {pos.roiAbs !== null ? `${formatSigned(pos.roiAbs)} ${pos.currency}` : "—"}
                      </td>
                      <td
                        className={`font-numeric ${pnlClass(pos.roiPct)}`}
                        style={{ padding: "10px 14px", textAlign: "right", fontSize: 12.5 }}
                      >
                        {formatSigned(pos.roiPct, 2, false)}
                        {pos.roiPct !== null && "%"}
                      </td>
                      <td style={{ padding: "10px 8px", color: "#A89E90" }}>
                        <ChevronRight size={14} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <div className="holdings-list">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "13px 14px",
                borderBottom: "1px solid #DDE3EE",
              }}
            >
              <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "#1A1A2E" }}>{portfolio.name}</h3>
              <span className="font-numeric" style={{ fontSize: 11, color: "#7A6E60" }}>
                {positions.length} positions
              </span>
            </div>
            {sortedPositions.map((pos) => {
              const sIdx = sectorSlices.findIndex(
                (s) => sectors[pos.ticker] === s.sector || (!sectors[pos.ticker] && s.sector === "Other"),
              );
              const dotColor = getSectorColor(sectors[pos.ticker] ?? "Other", sIdx >= 0 ? sIdx : 0);
              return (
                <div
                  key={pos.ticker}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderBottom: "1px solid #E6EBF5",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    onShowLots(pos.ticker, portfolio.id);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#FBF4F5";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: ".02em", color: "#1A1A2E" }}>
                        {pos.ticker}
                      </div>
                      <div className="font-numeric" style={{ fontSize: 11, color: "#7A6E60", marginTop: 2 }}>
                        {formatShares(pos.totalShares)} sh · avg {formatNum(pos.avgCost)}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    <div className="font-numeric" style={{ fontSize: 13.5, fontWeight: 600, color: "#1A1A2E" }}>
                      {pos.positionValue !== null ? formatNum(pos.positionValue) : "—"}
                    </div>
                    {pos.roiPct !== null && (
                      <span
                        className="font-numeric"
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "1px 7px",
                          borderRadius: 20,
                          background: pos.roiPct >= 0 ? "rgba(10,157,110,.12)" : "rgba(196,18,48,.10)",
                          color: pos.roiPct >= 0 ? "#0a9d6e" : "#c41230",
                        }}
                      >
                        {formatSigned(pos.roiPct, 2, false)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ background: "#F8FAFB", border: "1px solid #DDE3EE", padding: "16px 18px" }}>
          <h3
            style={{
              fontSize: 10,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "#7A6E60",
              margin: "0 0 16px",
              fontWeight: 600,
            }}
          >
            Sector Allocation
          </h3>
          <SectorAllocationBar slices={sectorSlices} />

          {/* Desktop CTA */}
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              justifyContent: "center",
              width: "100%",
              background: "linear-gradient(135deg, #c41230, #8b0d21)",
              color: "#fff",
              border: 0,
              borderRadius: 3,
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              fontSize: 13,
              padding: 11,
              cursor: "pointer",
              marginTop: 18,
              boxShadow: "0 8px 20px -8px rgba(196,18,48,.5)",
              transition: "filter .2s, transform .1s, box-shadow .2s",
            }}
            onClick={() => {
              onAddTransaction(portfolio.id);
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = "brightness(1.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "none";
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "translateY(1px)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "none";
            }}
          >
            <Plus size={15} color="#fff" strokeWidth={2.4} />
            Add transaction
          </button>
        </div>
      </div>
    </div>
  );
}
