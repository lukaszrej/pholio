import { useState, useMemo } from "react";
import type { Transaction } from "@/types/transaction";
import { computePositions, type PriceData, type PortfolioPosition } from "@/lib/portfolio";
import AddTransactionForm from "@/components/transactions/AddTransactionForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

  const positions = useMemo(() => computePositions(transactions, prices), [transactions, prices]);

  function handleSuccess(transaction: Transaction) {
    setTransactions((prev) => [transaction, ...prev]);
    setIsDialogOpen(false);
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
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => (
                <tr key={pos.ticker} className="border-b border-white/5 transition-colors hover:bg-white/5">
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
                </tr>
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
            onSuccess={handleSuccess}
            onCancel={() => {
              setIsDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
