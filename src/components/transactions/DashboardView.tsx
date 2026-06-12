import { useState, useMemo } from "react";
import type { Transaction } from "@/types/transaction";
import {
  computePositions,
  computePortfolioSummary,
  computeSectorAllocation,
  type PriceData,
  type PortfolioPosition,
} from "@/lib/portfolio";
import SectorAllocationChart from "@/components/portfolio/SectorAllocationChart";
import PortfolioSummaryCard from "@/components/portfolio/PortfolioSummaryCard";
import AddTransactionForm from "@/components/transactions/AddTransactionForm";
import LotsModal from "@/components/transactions/LotsModal";
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
import { ChevronRight, Loader2 } from "lucide-react";
import { formatShares, formatSigned, pnlClass } from "@/lib/format";

interface Props {
  initialTransactions: Transaction[];
  initialPrices: Record<string, PriceData>;
  initialSectors?: Record<string, string>;
  userEmail?: string;
}

function formatCurrentPrice(pos: PortfolioPosition): string {
  if (pos.currentPrice === null) return "—";
  return pos.currentPrice.toFixed(2);
}

function formatPriceDate(pos: PortfolioPosition): string {
  if (pos.priceDate === null) return "—";
  const date = new Date(pos.priceDate);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

export default function DashboardView({ initialTransactions, initialPrices, initialSectors = {}, userEmail }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [prices] = useState(initialPrices); // prices are server-fetched once; new tickers show — until next page load
  const [sectors] = useState(initialSectors);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const positions = useMemo(() => computePositions(transactions, prices), [transactions, prices]);
  const sectorSlices = useMemo(() => computeSectorAllocation(positions, sectors), [positions, sectors]);
  const portfolioSummary = useMemo(() => computePortfolioSummary(positions), [positions]);

  function handleAddSuccess(transaction: Transaction) {
    setTransactions((prev) => [transaction, ...prev]);
    setIsDialogOpen(false);
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
      // read pre-delete state before setTransactions updates the array
      const ticker = deletingTransaction.ticker.toUpperCase();
      const hasRemainingLots = transactions.some(
        (t) => t.id !== deletingTransaction.id && t.ticker.toUpperCase() === ticker,
      );
      setTransactions((prev) => prev.filter((t) => t.id !== deletingTransaction.id));
      setDeletingTransaction(null);
      if (!hasRemainingLots) setSelectedTicker(null);
    } catch {
      setDeleteError("Network error. Please check your connection and try again.");
    } finally {
      setIsDeleteLoading(false);
    }
  }

  return (
    <div className="bg-cosmic min-h-screen p-6 text-gray-900">
      {/* Toolbar */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent">
          Portfolio
        </h1>
        <div className="flex items-center gap-3">
          {userEmail && <span className="text-sm text-gray-500">{userEmail}</span>}
          <form method="POST" action="/api/auth/signout">
            <button
              type="submit"
              className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>

      {/* Portfolio table or empty state */}
      {transactions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-20 text-center">
          <p className="text-gray-500">No transactions yet</p>
        </div>
      ) : (
        <>
          <PortfolioSummaryCard summary={portfolioSummary} />
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="sticky left-0 z-20 bg-white px-4 py-3 font-medium">Ticker</th>
                  <th className="px-4 py-3 font-medium">% of net liq</th>
                  <th className="px-4 py-3 font-medium">Shares</th>
                  <th className="px-4 py-3 font-medium">Avg. Price</th>
                  <th className="px-4 py-3 font-medium">Current Price</th>
                  <th className="px-4 py-3 font-medium">Price Date</th>
                  <th className="px-4 py-3 font-medium">Cost basis</th>
                  <th className="px-4 py-3 font-medium">Market value</th>
                  <th className="px-4 py-3 font-medium">Unrealized P&amp;L</th>
                  <th className="px-4 py-3 font-medium">Unrealized P&amp;L %</th>
                  <th className="w-8 px-2 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => (
                  <tr
                    key={pos.ticker}
                    className="group cursor-pointer border-b border-gray-100 transition-colors hover:bg-gray-50"
                    onClick={() => {
                      setSelectedTicker(pos.ticker);
                    }}
                  >
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 font-semibold group-hover:bg-gray-50">
                      {pos.ticker}
                    </td>
                    <td className="px-4 py-3">{pos.weightPct !== null ? `${pos.weightPct.toFixed(2)}%` : "—"}</td>
                    <td className="px-4 py-3">{formatShares(pos.totalShares)}</td>
                    <td className="px-4 py-3">
                      {pos.avgCost.toFixed(2)}
                      {!pos.hasMultipleCurrencies && <span className="ml-1 text-gray-500">{pos.currency}</span>}
                    </td>
                    <td className={!pos.isFresh ? "px-4 py-3 text-gray-400" : "px-4 py-3"}>
                      {formatCurrentPrice(pos)}
                    </td>
                    <td className={!pos.isFresh ? "px-4 py-3 text-gray-400" : "px-4 py-3"}>{formatPriceDate(pos)}</td>
                    <td className="px-4 py-3">{pos.costBasis.toFixed(2)}</td>
                    <td className="px-4 py-3">{pos.positionValue !== null ? pos.positionValue.toFixed(2) : "—"}</td>
                    <td className={`px-4 py-3 ${pnlClass(pos.roiAbs)}`}>
                      {pos.roiAbs !== null ? `${formatSigned(pos.roiAbs)} ${pos.currency}` : "—"}
                    </td>
                    <td className={`px-4 py-3 ${pnlClass(pos.roiPct)}`}>
                      {formatSigned(pos.roiPct)}
                      {pos.roiPct !== null && "%"}
                    </td>
                    <td className="px-2 py-3 text-gray-400">
                      <ChevronRight className="size-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
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

      {/* Sector Allocation Chart */}
      <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-700">Sector Allocation</h2>
        <SectorAllocationChart slices={sectorSlices} />
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

      {/* Lots modal */}
      <LotsModal
        ticker={selectedTicker ?? ""}
        open={selectedTicker !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTicker(null);
        }}
        transactions={transactions}
        onEditRequest={setEditingTransaction}
        onDeleteRequest={(t) => {
          setDeleteError(null);
          setDeletingTransaction(t);
        }}
      />

      {/* Delete confirmation dialog */}
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
