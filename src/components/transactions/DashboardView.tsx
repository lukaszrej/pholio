import { useState, useMemo, useRef, useLayoutEffect, useEffect, useCallback } from "react";
import { formatNum } from "@/lib/format";
import type { Transaction } from "@/types/transaction";
import type { Portfolio } from "@/types/portfolio";
import { computePositions, computePortfolioSummary, type PriceData, type PortfolioPosition } from "@/lib/portfolio";
import PortfolioSummaryCard from "@/components/portfolio/PortfolioSummaryCard";
import PortfolioSection from "@/components/portfolio/PortfolioSection";
import AddTransactionForm from "@/components/transactions/AddTransactionForm";
import LotsModal from "@/components/transactions/LotsModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, TrendingUp, User } from "lucide-react";

interface Props {
  initialTransactions: Transaction[];
  initialPrices: Record<string, PriceData>;
  initialSectors?: Record<string, string>;
  initialPortfolios: Portfolio[];
  userEmail?: string;
}

/* ── Ticker Tape ── */
function TickerTape({ positions }: { positions: PortfolioPosition[] }) {
  const items = positions.filter(
    (p): p is PortfolioPosition & { currentPrice: number; roiPct: number } =>
      p.currentPrice !== null && p.roiPct !== null,
  );
  if (items.length === 0) return null;

  const doubled = [...items, ...items];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 34,
        padding: "0 22px",
        borderBottom: "1px solid #dde4ee",
        overflow: "hidden",
        whiteSpace: "nowrap",
        background: "#fff",
        boxShadow: "0 1px 0 rgba(15,24,37,.03)",
      }}
    >
      <div style={{ display: "flex", gap: 34, animation: "ticker-slide 80s linear infinite" }}>
        {doubled.map((p, i) => (
          <span
            key={i}
            className="font-numeric"
            style={{ fontSize: 12, color: "#5e6e85", display: "inline-flex", gap: 8, alignItems: "center" }}
          >
            <b style={{ color: "#0f1825", fontWeight: 600 }}>{p.ticker}</b>
            {formatNum(p.currentPrice)}
            <span style={{ color: p.roiPct >= 0 ? "#0a9d6e" : "#e23950" }}>
              {p.roiPct >= 0 ? "▲" : "▼"} {formatNum(Math.abs(p.roiPct))}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Nav Tabs ── */
interface NavTabsProps {
  portfolios: Portfolio[];
  activeTab: string;
  positionCounts: Record<string, number>;
  onTabChange: (tab: string) => void;
}

function tabBtnStyle(isActive: boolean): React.CSSProperties {
  return {
    appearance: "none" as const,
    background: "none",
    border: 0,
    color: isActive ? "#0f1825" : "#5e6e85",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    fontWeight: 500,
    padding: "11px 16px",
    letterSpacing: ".01em",
    display: "inline-flex",
    gap: 8,
    alignItems: "center",
    justifyContent: "center" as const,
    whiteSpace: "nowrap" as const,
    transition: "color .22s",
    flexShrink: 0,
  };
}

function NavTabs({ portfolios, activeTab, positionCounts, onTabChange }: NavTabsProps) {
  const navRef = useRef<HTMLElement>(null);
  const [inkStyle, setInkStyle] = useState({ width: 0, x: 0 });

  const updateInk = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const activeBtn = nav.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (!activeBtn) return;
    setInkStyle({ width: activeBtn.offsetWidth, x: activeBtn.offsetLeft });
  }, []);

  useLayoutEffect(() => {
    requestAnimationFrame(updateInk);
  }, [activeTab, portfolios.length, updateInk]);

  useEffect(() => {
    window.addEventListener("resize", updateInk);
    return () => {
      window.removeEventListener("resize", updateInk);
    };
  }, [updateInk]);

  const handleClick = useCallback(
    (tabId: string, btn: HTMLButtonElement) => {
      onTabChange(tabId);
      const nav = navRef.current;
      if (nav) {
        const scrollLeft = Math.max(0, btn.offsetLeft - nav.clientWidth / 2 + btn.offsetWidth / 2);
        nav.scrollTo({ left: scrollLeft, behavior: "smooth" });
      }
    },
    [onTabChange],
  );

  return (
    <nav
      ref={navRef}
      className="pholio-tabs"
      style={{
        position: "relative",
        display: "flex",
        gap: 4,
        overflowX: "auto",
        scrollbarWidth: "none",
        width: "100%",
      }}
    >
      <button
        data-active={String(activeTab === "all")}
        style={tabBtnStyle(activeTab === "all")}
        onClick={(e) => {
          handleClick("all", e.currentTarget);
        }}
      >
        Dashboard
      </button>

      {portfolios.map((p) => {
        const isActive = activeTab === p.id;
        const count = positionCounts[p.id] ?? 0;
        return (
          <button
            key={p.id}
            data-active={String(isActive)}
            style={tabBtnStyle(isActive)}
            onClick={(e) => {
              handleClick(p.id, e.currentTarget);
            }}
          >
            {p.name}
            {count > 0 && (
              <span
                className="font-numeric"
                style={{
                  fontSize: 11,
                  padding: "1px 7px",
                  borderRadius: 2,
                  color: isActive ? "#fff" : "#93a1b5",
                  background: isActive ? "#0a86d8" : "#f4f7fb",
                  border: `1px solid ${isActive ? "#0a86d8" : "#eaeff6"}`,
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}

      <span
        style={{
          position: "absolute",
          bottom: -1,
          height: 2,
          background: "#0a86d8",
          borderRadius: 2,
          boxShadow: "0 0 10px rgba(10,134,216,.7)",
          width: inkStyle.width,
          transform: `translateX(${inkStyle.x}px)`,
          transition: "transform .34s cubic-bezier(.65,0,.35,1), width .34s cubic-bezier(.65,0,.35,1)",
          pointerEvents: "none",
        }}
      />
    </nav>
  );
}

/* ── Dashboard View ── */
export default function DashboardView({
  initialTransactions,
  initialPrices,
  initialSectors = {},
  initialPortfolios,
  userEmail,
}: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [prices] = useState(initialPrices);
  const [sectors] = useState(initialSectors);
  const [portfolios, setPortfolios] = useState<Portfolio[]>(initialPortfolios);
  const [activeTab, setActiveTab] = useState<string>("all");

  // Transaction dialogs
  const [addTransactionPortfolioId, setAddTransactionPortfolioId] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Lots modal
  const [lotsContext, setLotsContext] = useState<{ ticker: string; portfolioId: string } | null>(null);

  // Portfolio CRUD dialogs
  const [isAddPortfolioDialogOpen, setIsAddPortfolioDialogOpen] = useState(false);
  const [addPortfolioName, setAddPortfolioName] = useState("");
  const [isAddPortfolioLoading, setIsAddPortfolioLoading] = useState(false);
  const [addPortfolioError, setAddPortfolioError] = useState<string | null>(null);

  const [editPortfolio, setEditPortfolio] = useState<Portfolio | null>(null);
  const [editPortfolioName, setEditPortfolioName] = useState("");
  const [isEditPortfolioLoading, setIsEditPortfolioLoading] = useState(false);
  const [editPortfolioError, setEditPortfolioError] = useState<string | null>(null);

  const [deletingPortfolio, setDeletingPortfolio] = useState<{ id: string; name: string } | null>(null);
  const [isDeletePortfolioLoading, setIsDeletePortfolioLoading] = useState(false);
  const [deletePortfolioError, setDeletePortfolioError] = useState<string | null>(null);

  // Mobile profile modal
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const allPositions = useMemo(() => computePositions(transactions, prices), [transactions, prices]);
  const combinedSummary = useMemo(() => computePortfolioSummary(allPositions), [allPositions]);

  const txByPortfolio = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const arr = map.get(t.portfolio_id) ?? [];
      arr.push(t);
      map.set(t.portfolio_id, arr);
    }
    return map;
  }, [transactions]);

  const portfolioPositionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of portfolios) {
      const txns = txByPortfolio.get(p.id) ?? [];
      counts[p.id] = computePositions(txns, prices).length;
    }
    return counts;
  }, [portfolios, txByPortfolio, prices]);

  const activePortfolio = portfolios.find((p) => p.id === activeTab);

  const activeSummary = useMemo(() => {
    if (activeTab === "all") return combinedSummary;
    const txns = txByPortfolio.get(activeTab) ?? [];
    const pos = computePositions(txns, prices);
    return computePortfolioSummary(pos);
  }, [activeTab, combinedSummary, txByPortfolio, prices]);

  function handleAddSuccess(transaction: Transaction) {
    setTransactions((prev) => [transaction, ...prev]);
    setAddTransactionPortfolioId(null);
  }

  function handleEditSuccess(updated: Transaction) {
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditingTransaction(null);
  }

  async function handleDeleteTransactionConfirm() {
    if (!deletingTransaction) return;
    setIsDeleteLoading(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/transactions/${deletingTransaction.id}`, { method: "DELETE" });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({ error: "Unexpected error" }))) as { error?: string };
        setDeleteError(json.error ?? "Unexpected error");
        return;
      }
      const ticker = deletingTransaction.ticker.toUpperCase();
      const portfolioId = deletingTransaction.portfolio_id;
      const hasRemainingLots = transactions.some(
        (t) => t.id !== deletingTransaction.id && t.ticker.toUpperCase() === ticker && t.portfolio_id === portfolioId,
      );
      setTransactions((prev) => prev.filter((t) => t.id !== deletingTransaction.id));
      setDeletingTransaction(null);
      if (
        !hasRemainingLots &&
        lotsContext !== null &&
        lotsContext.ticker.toUpperCase() === ticker &&
        lotsContext.portfolioId === portfolioId
      ) {
        setLotsContext(null);
      }
    } catch {
      setDeleteError("Network error. Please check your connection and try again.");
    } finally {
      setIsDeleteLoading(false);
    }
  }

  async function handleAddPortfolioSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsAddPortfolioLoading(true);
    setAddPortfolioError(null);
    try {
      const response = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addPortfolioName }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({ error: "Unexpected error" }))) as { error?: string };
        setAddPortfolioError(json.error ?? "Unexpected error");
        return;
      }
      const json = (await response.json()) as { data: Portfolio };
      setPortfolios((prev) => [...prev, json.data]);
      setIsAddPortfolioDialogOpen(false);
      setAddPortfolioName("");
      setActiveTab(json.data.id);
    } catch {
      setAddPortfolioError("Network error. Please check your connection and try again.");
    } finally {
      setIsAddPortfolioLoading(false);
    }
  }

  async function handleEditPortfolioSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editPortfolio) return;
    setIsEditPortfolioLoading(true);
    setEditPortfolioError(null);
    try {
      const response = await fetch(`/api/portfolios/${editPortfolio.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editPortfolioName }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({ error: "Unexpected error" }))) as { error?: string };
        setEditPortfolioError(json.error ?? "Unexpected error");
        return;
      }
      const json = (await response.json()) as { data: Portfolio };
      setPortfolios((prev) => prev.map((p) => (p.id === json.data.id ? json.data : p)));
      setEditPortfolio(null);
      setEditPortfolioName("");
    } catch {
      setEditPortfolioError("Network error. Please check your connection and try again.");
    } finally {
      setIsEditPortfolioLoading(false);
    }
  }

  async function handleDeletePortfolioConfirm() {
    if (!deletingPortfolio) return;
    setIsDeletePortfolioLoading(true);
    setDeletePortfolioError(null);
    try {
      const response = await fetch(`/api/portfolios/${deletingPortfolio.id}`, { method: "DELETE" });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({ error: "Unexpected error" }))) as { error?: string };
        setDeletePortfolioError(json.error ?? "Unexpected error");
        return;
      }
      if (activeTab === deletingPortfolio.id) setActiveTab("all");
      setPortfolios((prev) => prev.filter((p) => p.id !== deletingPortfolio.id));
      setTransactions((prev) => prev.filter((t) => t.portfolio_id !== deletingPortfolio.id));
      if (lotsContext?.portfolioId === deletingPortfolio.id) setLotsContext(null);
      setDeletingPortfolio(null);
    } catch {
      setDeletePortfolioError("Network error. Please check your connection and try again.");
    } finally {
      setIsDeletePortfolioLoading(false);
    }
  }

  const openAddPortfolio = useCallback(() => {
    setAddPortfolioName("");
    setAddPortfolioError(null);
    setIsAddPortfolioDialogOpen(true);
  }, []);

  const mobileCtaPortfolioId = activePortfolio?.id ?? portfolios[0]?.id;

  return (
    <div style={{ background: "#eef1f6", minHeight: "100vh" }}>
      {/* Ticker tape */}
      <TickerTape positions={allPositions} />

      {/* Constrained content — 16px side padding keeps everything visually the same width */}
      <div style={{ maxWidth: 1152, margin: "0 auto", padding: "0 16px" }}>
        {/* White app bar: header + nav share one white background */}
        <div style={{ background: "#fff", paddingInline: 18 }}>
          {/* Header */}
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "18px 0 0",
              background: "#fff",
            }}
          >
            {/* Brand */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 3,
                  flexShrink: 0,
                  background: "linear-gradient(135deg, #0a86d8, #4f46e5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 6px 16px -6px rgba(10,134,216,.6)",
                }}
              >
                <TrendingUp size={16} color="#fff" strokeWidth={2.4} />
              </span>
              <span style={{ fontWeight: 700, fontSize: 22, letterSpacing: "-.02em", color: "#0f1825" }}>
                Phol<span style={{ color: "#0a86d8" }}>io</span>
              </span>
            </div>

            {/* Desktop: email + add portfolio + sign out */}
            <div className="hidden items-center gap-3 sm:flex" style={{ color: "#5e6e85", fontSize: 12 }}>
              {userEmail && <span className="font-numeric">{userEmail}</span>}
              <button
                onClick={openAddPortfolio}
                style={{
                  border: "1px solid #dde4ee",
                  padding: "6px 12px",
                  borderRadius: 3,
                  color: "#0f1825",
                  background: "#fff",
                  fontFamily: "var(--font-numeric)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  transition: "border-color .2s, color .2s, box-shadow .2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#0a86d8";
                  e.currentTarget.style.color = "#0a86d8";
                  e.currentTarget.style.boxShadow = "0 2px 10px -4px rgba(10,134,216,.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#dde4ee";
                  e.currentTarget.style.color = "#0f1825";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                + Add portfolio
              </button>
              <form method="POST" action="/api/auth/signout">
                <button
                  type="submit"
                  style={{
                    border: "1px solid #dde4ee",
                    padding: "6px 12px",
                    borderRadius: 3,
                    color: "#5e6e85",
                    background: "#fff",
                    fontFamily: "var(--font-sans)",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  Sign out
                </button>
              </form>
            </div>

            {/* Mobile: avatar icon */}
            <button
              className="flex sm:hidden"
              onClick={() => {
                setIsProfileModalOpen(true);
              }}
              style={{
                width: 44,
                height: 44,
                border: "1px solid #dde4ee",
                borderRadius: 6,
                background: "#fff",
                alignItems: "center",
                justifyContent: "center",
                color: "#5e6e85",
                cursor: "pointer",
              }}
            >
              <User size={17} />
            </button>
          </header>

          {/* Nav tabs */}
          <div style={{ borderBottom: "1px solid #dde4ee" }}>
            <NavTabs
              portfolios={portfolios}
              activeTab={activeTab}
              positionCounts={portfolioPositionCounts}
              onTabChange={setActiveTab}
            />
          </div>
        </div>

        {/* Main content */}
        <main style={{ padding: "22px 0", paddingBottom: portfolios.length > 0 ? 88 : 40 }}>
          {portfolios.length === 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid #dde4ee",
                background: "#fff",
                padding: "80px 20px",
                textAlign: "center",
              }}
            >
              <p style={{ color: "#5e6e85", marginBottom: 16 }}>No portfolios yet.</p>
              <button
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "linear-gradient(135deg, #0a86d8, #4f46e5)",
                  color: "#fff",
                  border: 0,
                  borderRadius: 3,
                  fontFamily: "var(--font-sans)",
                  fontWeight: 600,
                  fontSize: 13,
                  padding: "11px 18px",
                  cursor: "pointer",
                  boxShadow: "0 8px 20px -8px rgba(10,134,216,.7)",
                }}
                onClick={openAddPortfolio}
              >
                <Plus size={15} color="#fff" />
                Create your first portfolio
              </button>
            </div>
          ) : (
            <>
              {/* Summary strip */}
              <PortfolioSummaryCard summary={activeSummary} />

              {activeTab === "all"
                ? /* All portfolios — stacked compact sections */
                  portfolios.map((p) => (
                    <PortfolioSection
                      key={p.id}
                      compact
                      portfolio={p}
                      transactions={txByPortfolio.get(p.id) ?? []}
                      prices={prices}
                      sectors={sectors}
                      onAddTransaction={(id) => {
                        setAddTransactionPortfolioId(id);
                      }}
                      onEditPortfolio={(portfolio) => {
                        setEditPortfolio(portfolio);
                        setEditPortfolioName(portfolio.name);
                        setEditPortfolioError(null);
                      }}
                      onDeletePortfolio={(id) => {
                        setDeletingPortfolio({ id, name: portfolios.find((port) => port.id === id)?.name ?? "" });
                      }}
                      onShowLots={(ticker, portfolioId) => {
                        setLotsContext({ ticker, portfolioId });
                      }}
                    />
                  ))
                : /* Single portfolio — full sidebar layout */
                  activePortfolio && (
                    <PortfolioSection
                      portfolio={activePortfolio}
                      transactions={txByPortfolio.get(activePortfolio.id) ?? []}
                      prices={prices}
                      sectors={sectors}
                      onAddTransaction={(id) => {
                        setAddTransactionPortfolioId(id);
                      }}
                      onEditPortfolio={(portfolio) => {
                        setEditPortfolio(portfolio);
                        setEditPortfolioName(portfolio.name);
                        setEditPortfolioError(null);
                      }}
                      onDeletePortfolio={(id) => {
                        setDeletingPortfolio({ id, name: portfolios.find((port) => port.id === id)?.name ?? "" });
                      }}
                      onShowLots={(ticker, portfolioId) => {
                        setLotsContext({ ticker, portfolioId });
                      }}
                    />
                  )}
            </>
          )}
        </main>

        {/* Mobile sticky CTA */}
        {portfolios.length > 0 && (
          <div className="mobile-cta-bar">
            <button
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifyContent: "center",
                width: "100%",
                background: "linear-gradient(135deg, #0a86d8, #4f46e5)",
                color: "#fff",
                border: 0,
                borderRadius: 3,
                fontFamily: "var(--font-sans)",
                fontWeight: 600,
                fontSize: 13,
                padding: 11,
                cursor: "pointer",
                boxShadow: "0 8px 20px -8px rgba(10,134,216,.7)",
              }}
              onClick={() => {
                setAddTransactionPortfolioId(mobileCtaPortfolioId);
              }}
            >
              <Plus size={16} color="#fff" strokeWidth={2.4} />
              Add transaction
            </button>
          </div>
        )}
      </div>

      {/* Lots modal */}
      <LotsModal
        ticker={lotsContext?.ticker ?? ""}
        open={lotsContext !== null}
        onOpenChange={(open) => {
          if (!open) setLotsContext(null);
        }}
        transactions={lotsContext ? (txByPortfolio.get(lotsContext.portfolioId) ?? []) : []}
        onEditRequest={setEditingTransaction}
        onDeleteRequest={(t) => {
          setDeleteError(null);
          setDeletingTransaction(t);
        }}
      />

      {/* Add transaction dialog */}
      <Dialog
        open={addTransactionPortfolioId !== null}
        onOpenChange={(open) => {
          if (!open) setAddTransactionPortfolioId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add transaction</DialogTitle>
          </DialogHeader>
          <AddTransactionForm
            onSuccess={handleAddSuccess}
            onCancel={() => {
              setAddTransactionPortfolioId(null);
            }}
            portfolios={portfolios}
            defaultPortfolioId={addTransactionPortfolioId ?? undefined}
          />
        </DialogContent>
      </Dialog>

      {/* Edit transaction dialog */}
      <Dialog
        open={editingTransaction !== null}
        onOpenChange={(open) => {
          if (!open) setEditingTransaction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit transaction</DialogTitle>
          </DialogHeader>
          <AddTransactionForm
            transaction={editingTransaction ?? undefined}
            onSuccess={handleEditSuccess}
            onCancel={() => {
              setEditingTransaction(null);
            }}
            portfolios={portfolios}
          />
        </DialogContent>
      </Dialog>

      {/* Delete transaction dialog */}
      <AlertDialog
        open={deletingTransaction !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleteLoading) {
            setDeletingTransaction(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete transaction</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the {deletingTransaction?.ticker} transaction from{" "}
              {deletingTransaction?.purchase_date}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p className="flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleteLoading}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDeleteTransactionConfirm} disabled={isDeleteLoading}>
              {isDeleteLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isDeleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add portfolio dialog */}
      <Dialog
        open={isAddPortfolioDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddPortfolioDialogOpen(false);
            setAddPortfolioError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add portfolio</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddPortfolioSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="portfolio-name">Name</Label>
              <Input
                id="portfolio-name"
                type="text"
                placeholder="e.g. Regular Investing"
                value={addPortfolioName}
                onChange={(e) => {
                  setAddPortfolioName(e.target.value);
                }}
                maxLength={100}
                required
              />
            </div>
            {addPortfolioError && (
              <p className="flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {addPortfolioError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddPortfolioDialogOpen(false);
                }}
                disabled={isAddPortfolioLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isAddPortfolioLoading}>
                {isAddPortfolioLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isAddPortfolioLoading ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename portfolio dialog */}
      <Dialog
        open={editPortfolio !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditPortfolio(null);
            setEditPortfolioName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename portfolio</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditPortfolioSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="edit-portfolio-name">Name</Label>
              <Input
                id="edit-portfolio-name"
                type="text"
                value={editPortfolioName}
                onChange={(e) => {
                  setEditPortfolioName(e.target.value);
                }}
                maxLength={100}
                required
              />
            </div>
            {editPortfolioError && (
              <p className="flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {editPortfolioError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditPortfolio(null);
                }}
                disabled={isEditPortfolioLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isEditPortfolioLoading}>
                {isEditPortfolioLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
                {isEditPortfolioLoading ? "Saving..." : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete portfolio dialog */}
      <AlertDialog
        open={deletingPortfolio !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletePortfolioLoading) {
            setDeletingPortfolio(null);
            setDeletePortfolioError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete portfolio</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingPortfolio?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletePortfolioError && (
            <p className="flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {deletePortfolioError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletePortfolioLoading}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDeletePortfolioConfirm} disabled={isDeletePortfolioLoading}>
              {isDeletePortfolioLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isDeletePortfolioLoading ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mobile: profile modal */}
      <Dialog
        open={isProfileModalOpen}
        onOpenChange={(open) => {
          setIsProfileModalOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Account</DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {userEmail && (
              <span style={{ fontSize: 13, color: "#5e6e85", fontFamily: "var(--font-numeric)" }}>{userEmail}</span>
            )}
            <button
              onClick={() => {
                openAddPortfolio();
                setIsProfileModalOpen(false);
              }}
              style={{
                width: "100%",
                border: "1px solid #dde4ee",
                padding: "6px 12px",
                borderRadius: 3,
                color: "#0f1825",
                background: "#fff",
                fontFamily: "var(--font-numeric)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontSize: 12,
                transition: "border-color .2s, color .2s, box-shadow .2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#0a86d8";
                e.currentTarget.style.color = "#0a86d8";
                e.currentTarget.style.boxShadow = "0 2px 10px -4px rgba(10,134,216,.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#dde4ee";
                e.currentTarget.style.color = "#0f1825";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              + Add portfolio
            </button>
            <form method="POST" action="/api/auth/signout">
              <button
                type="submit"
                style={{
                  width: "100%",
                  border: "1px solid #dc2626",
                  padding: "6px 12px",
                  borderRadius: 3,
                  color: "#fff",
                  background: "#dc2626",
                  fontFamily: "var(--font-sans)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
