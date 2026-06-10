import { useState, useMemo, Fragment } from "react";
import type { Transaction } from "@/types/transaction";
import { computePositions, type PriceData, type PortfolioPosition } from "@/lib/portfolio";
import AddTransactionForm from "@/components/transactions/AddTransactionForm";
import { Button } from "@/components/ui/button";
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
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface Props {
  initialTransactions: Transaction[];
  initialPrices: Record<string, PriceData>;
  userEmail?: string;
}

function formatCurrentPrice(pos: PortfolioPosition): string {
  if (pos.currentPrice === null) return "—";
  const price = pos.currentPrice.toFixed(2);
  if (!pos.isFresh && pos.priceDate) {
    const date = new Date(pos.priceDate).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
    return `${price} ⚠ ${date}`;
  }
  return price;
}

function roiClass(value: number | null): string {
  if (value === null) return "text-blue-100/40";
  return value >= 0 ? "text-emerald-400" : "text-red-400";
}

function formatSigned(value: number | null, decimals = 2): string {
  if (value === null) return "—";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}`;
}

export default function DashboardView({ initialTransactions, initialPrices, userEmail }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [prices] = useState(initialPrices); // prices are server-fetched once; new tickers show — until next page load
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const positions = useMemo(() => computePositions(transactions, prices), [transactions, prices]);

  function handleAddSuccess(transaction: Transaction) {
    setTransactions((prev) => [transaction, ...prev]);
    setIsDialogOpen(false);
  }

  function toggleExpanded(ticker: string) {
    setExpandedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) {
        next.delete(ticker);
      } else {
        next.add(ticker);
      }
      return next;
    });
  }

  function handleEditSuccess(updated: Transaction) {
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditingTransaction(null);
  }

  async function handleDeleteConfirm() {
    if (!deletingTransaction) return;
    setIsDeleteLoading(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/transactions/${deletingTransaction.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({ error: "Unexpected error" }))) as {
          error?: string;
        };
        setDeleteError(json.error ?? "Unexpected error");
        return;
      }
      setTransactions((prev) => prev.filter((t) => t.id !== deletingTransaction.id));
      setDeletingTransaction(null);
    } catch {
      setDeleteError("Network error. Please check your connection and try again.");
    } finally {
      setIsDeleteLoading(false);
    }
  }

  return (
    <div className="bg-cosmic min-h-screen p-6 text-white">
      {/* Toolbar */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-3xl font-bold text-transparent">
          Portfolio
        </h1>
        <div className="flex items-center gap-3">
          {userEmail && <span className="text-sm text-blue-100/60">{userEmail}</span>}
          <form method="POST" action="/api/auth/signout">
            <button
              type="submit"
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Portfolio table or empty state */}
      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-20 text-center backdrop-blur-xl">
          <p className="text-blue-100/60">No transactions yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-blue-100/60">
                <th className="px-4 py-3 font-medium">Ticker</th>
                <th className="px-4 py-3 font-medium">Shares</th>
                <th className="px-4 py-3 font-medium">Avg. Cost</th>
                <th className="px-4 py-3 font-medium">Current Price</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Unrealized P&amp;L %</th>
                <th className="px-4 py-3 font-medium">Unrealized P&amp;L</th>
                <th className="w-8 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <Fragment key={pos.ticker}>
                  <tr
                    className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5"
                    onClick={() => {
                      toggleExpanded(pos.ticker);
                    }}
                  >
                    <td className="px-4 py-3 font-semibold">{pos.ticker}</td>
                    <td className="px-4 py-3">{pos.totalShares.toFixed(4)}</td>
                    <td className="px-4 py-3">
                      {pos.avgCost.toFixed(2)}
                      {!pos.hasMultipleCurrencies && <span className="ml-1 text-blue-100/50">{pos.currency}</span>}
                    </td>
                    <td className="px-4 py-3">{formatCurrentPrice(pos)}</td>
                    <td className="px-4 py-3">{pos.positionValue !== null ? pos.positionValue.toFixed(2) : "—"}</td>
                    <td className={`px-4 py-3 ${roiClass(pos.roiPct)}`}>
                      {formatSigned(pos.roiPct)}
                      {pos.roiPct !== null && "%"}
                    </td>
                    <td className={`px-4 py-3 ${roiClass(pos.roiAbs)}`}>
                      {pos.roiAbs !== null ? `${formatSigned(pos.roiAbs)} ${pos.currency}` : "—"}
                    </td>
                    <td className="px-2 py-3 text-blue-100/40">
                      {expandedTickers.has(pos.ticker) ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </td>
                  </tr>
                  {expandedTickers.has(pos.ticker) && (
                    <tr key={`${pos.ticker}-txns`}>
                      <td colSpan={8} className="bg-white/[0.03] px-6 pt-1 pb-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-blue-100/40">
                              <th className="py-1 text-left font-normal">Date</th>
                              <th className="py-1 text-left font-normal">Shares</th>
                              <th className="py-1 text-left font-normal">Price</th>
                              <th className="py-1 text-left font-normal">Currency</th>
                              <th></th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {transactions
                              .filter((t) => t.ticker.toUpperCase() === pos.ticker)
                              .sort((a, b) => a.purchase_date.localeCompare(b.purchase_date))
                              .map((t) => (
                                <tr key={t.id} className="border-t border-white/5">
                                  <td className="py-1.5">{t.purchase_date}</td>
                                  <td className="py-1.5">{t.shares.toFixed(4)}</td>
                                  <td className="py-1.5">{t.purchase_price.toFixed(2)}</td>
                                  <td className="py-1.5">{t.currency}</td>
                                  <td className="py-1.5">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingTransaction(t);
                                      }}
                                    >
                                      Edit
                                    </Button>
                                  </td>
                                  <td className="py-1.5">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-400 hover:text-red-400"
                                      onClick={() => {
                                        setDeleteError(null);
                                        setDeletingTransaction(t);
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add transaction button — always below the table/empty state */}
      <div className="mt-4">
        <Button
          className="bg-emerald-500 text-white hover:bg-emerald-600"
          onClick={() => {
            setIsDialogOpen(true);
          }}
        >
          Add transaction
        </Button>
      </div>

      {/* Add transaction dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add transaction</DialogTitle>
          </DialogHeader>
          <AddTransactionForm
            onSuccess={handleAddSuccess}
            onCancel={() => {
              setIsDialogOpen(false);
            }}
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
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deletingTransaction !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleteLoading) setDeletingTransaction(null);
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
            <p className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleteLoading}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleteLoading}>
              {isDeleteLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isDeleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
