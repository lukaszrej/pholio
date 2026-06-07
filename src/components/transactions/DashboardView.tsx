import { useState } from "react";
import type { Transaction } from "@/types/transaction";
import AddTransactionForm from "@/components/transactions/AddTransactionForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  initialTransactions: Transaction[];
  userEmail?: string;
}

export default function DashboardView({ initialTransactions, userEmail }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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

      {/* Transaction table or empty state */}
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
                <th className="px-4 py-3 font-medium">Purchase Price</th>
                <th className="px-4 py-3 font-medium">Currency</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-white/5 transition-colors hover:bg-white/5">
                  <td className="px-4 py-3 font-semibold">{t.ticker.toUpperCase()}</td>
                  <td className="px-4 py-3">{t.shares.toFixed(4)}</td>
                  <td className="px-4 py-3">{t.purchase_price.toFixed(2)}</td>
                  <td className="px-4 py-3">{t.currency}</td>
                  <td className="px-4 py-3 text-blue-100/70">{t.purchase_date}</td>
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
