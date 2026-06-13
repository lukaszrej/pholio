import { useState, useMemo } from "react";
import type { Transaction } from "@/types/transaction";
import type { Portfolio } from "@/types/portfolio";
import { computePositions, computePortfolioSummary, type PriceData } from "@/lib/portfolio";
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
import { Loader2, Plus } from "lucide-react";

interface Props {
  initialTransactions: Transaction[];
  initialPrices: Record<string, PriceData>;
  initialSectors?: Record<string, string>;
  initialPortfolios: Portfolio[];
  userEmail?: string;
}

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

  return (
    <div className="bg-cosmic min-h-screen p-6 text-gray-900">
      {/* Toolbar */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent">
          Portfolio
        </h1>
        <div className="flex items-center gap-3">
          {userEmail && <span className="text-sm text-gray-500">{userEmail}</span>}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAddPortfolioName("");
              setAddPortfolioError(null);
              setIsAddPortfolioDialogOpen(true);
            }}
          >
            <Plus className="mr-1 size-4" />
            Add portfolio
          </Button>
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

      {portfolios.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white py-20 text-center">
          <p className="mb-4 text-gray-500">No portfolios yet.</p>
          <Button
            className="bg-emerald-500 text-white hover:bg-emerald-600"
            onClick={() => {
              setAddPortfolioName("");
              setAddPortfolioError(null);
              setIsAddPortfolioDialogOpen(true);
            }}
          >
            Create your first portfolio
          </Button>
        </div>
      ) : (
        <>
          {/* Combined summary */}
          <PortfolioSummaryCard summary={combinedSummary} title="All Portfolios" />

          {/* Per-portfolio sections */}
          {portfolios.map((p) => (
            <PortfolioSection
              key={p.id}
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
          ))}
        </>
      )}

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
    </div>
  );
}
