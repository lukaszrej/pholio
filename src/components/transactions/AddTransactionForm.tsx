import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2 } from "lucide-react";
import { transactionSchema, CURRENCIES, type TransactionFormValues } from "@/lib/transaction-schema";
import type { Transaction } from "@/types/transaction";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface Props {
  onSuccess: (transaction: Transaction) => void;
  onCancel: () => void;
  transaction?: Transaction;
}

export default function AddTransactionForm({ onSuccess, onCancel, transaction }: Props) {
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema) as Resolver<TransactionFormValues>,
    defaultValues: transaction
      ? {
          ticker: transaction.ticker,
          purchase_date: transaction.purchase_date,
          purchase_price: transaction.purchase_price,
          currency: transaction.currency,
          shares: transaction.shares,
        }
      : {
          ticker: "",
          purchase_date: "",
          currency: "USD",
        },
  });

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit(values: TransactionFormValues) {
    const url = transaction ? `/api/transactions/${transaction.id}` : "/api/transactions";
    const method = transaction ? "PUT" : "POST";
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
    } catch {
      setError("root", { message: "Network error. Please check your connection and try again." });
      return;
    }

    if (!response.ok) {
      const json = (await response.json().catch(() => ({ error: "Unexpected error" }))) as {
        error?: string;
      };
      setError("root", { message: json.error ?? "Unexpected error" });
      return;
    }

    const json = (await response.json()) as { data: Transaction | null };
    if (!json.data) {
      setError("root", { message: "Unexpected server error" });
      return;
    }
    onSuccess(json.data);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {/* Ticker */}
      <div className="space-y-1">
        <Label htmlFor="ticker">Ticker</Label>
        <Input
          id="ticker"
          type="text"
          placeholder="AAPL"
          {...register("ticker")}
          aria-invalid={!!errors.ticker}
          disabled={!!transaction}
        />
        {errors.ticker && (
          <p className="flex items-center gap-1 text-xs text-red-400">
            <CircleAlert className="size-3" />
            {errors.ticker.message}
          </p>
        )}
      </div>

      {/* Purchase date */}
      <div className="space-y-1">
        <Label htmlFor="purchase_date">Purchase date</Label>
        <Input id="purchase_date" type="date" {...register("purchase_date")} aria-invalid={!!errors.purchase_date} />
        {errors.purchase_date && (
          <p className="flex items-center gap-1 text-xs text-red-400">
            <CircleAlert className="size-3" />
            {errors.purchase_date.message}
          </p>
        )}
      </div>

      {/* Purchase price */}
      <div className="space-y-1">
        <Label htmlFor="purchase_price">Purchase price</Label>
        <Input
          id="purchase_price"
          type="number"
          step="0.0001"
          min="0"
          placeholder="0.00"
          {...register("purchase_price")}
          aria-invalid={!!errors.purchase_price}
        />
        {errors.purchase_price && (
          <p className="flex items-center gap-1 text-xs text-red-400">
            <CircleAlert className="size-3" />
            {errors.purchase_price.message}
          </p>
        )}
      </div>

      {/* Shares */}
      <div className="space-y-1">
        <Label htmlFor="shares">Shares</Label>
        <Input
          id="shares"
          type="number"
          step="0.0001"
          min="0"
          placeholder="0.0000"
          {...register("shares")}
          aria-invalid={!!errors.shares}
        />
        {errors.shares && (
          <p className="flex items-center gap-1 text-xs text-red-400">
            <CircleAlert className="size-3" />
            {errors.shares.message}
          </p>
        )}
      </div>

      {/* Currency */}
      <div className="space-y-1">
        <Label htmlFor="currency">Currency</Label>
        <Controller
          control={control}
          name="currency"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="currency" className="w-full" aria-invalid={!!errors.currency}>
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.currency && (
          <p className="flex items-center gap-1 text-xs text-red-400">
            <CircleAlert className="size-3" />
            {errors.currency.message}
          </p>
        )}
      </div>

      {/* Server-level error banner */}
      {errors.root && (
        <p className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <CircleAlert className="size-4 shrink-0" />
          {errors.root.message}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {isSubmitting ? (transaction ? "Saving..." : "Adding...") : transaction ? "Save changes" : "Add transaction"}
        </Button>
      </div>
    </form>
  );
}
