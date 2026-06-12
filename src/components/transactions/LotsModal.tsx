import type { Transaction } from "@/types/transaction";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatShares } from "@/lib/format";

interface Props {
  ticker: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Transaction[];
  onEditRequest: (t: Transaction) => void;
  onDeleteRequest: (t: Transaction) => void;
}

export default function LotsModal({ ticker, open, onOpenChange, transactions, onEditRequest, onDeleteRequest }: Props) {
  const lots = transactions
    .filter((t) => t.ticker.toUpperCase() === ticker.toUpperCase())
    .sort((a, b) => a.purchase_date.localeCompare(b.purchase_date));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ticker} — Lots</DialogTitle>
        </DialogHeader>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400">
              <th className="py-1 text-left font-normal">Date</th>
              <th className="py-1 text-left font-normal">Shares</th>
              <th className="py-1 text-left font-normal">Price</th>
              <th className="py-1 text-left font-normal">Currency</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lots.map((t) => (
              <tr key={t.id} className="border-t border-gray-100">
                <td className="py-1.5">{t.purchase_date}</td>
                <td className="py-1.5">{formatShares(t.shares)}</td>
                <td className="py-1.5">{t.purchase_price.toFixed(2)}</td>
                <td className="py-1.5">{t.currency}</td>
                <td className="py-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onEditRequest(t);
                    }}
                  >
                    Edit
                  </Button>
                </td>
                <td className="py-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-600"
                    onClick={() => {
                      onDeleteRequest(t);
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
