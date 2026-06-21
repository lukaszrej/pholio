import { useState } from "react";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2 } from "lucide-react";
import { transactionSchema, CURRENCIES, type TransactionFormValues } from "@/lib/transaction-schema";
import type { Transaction } from "@/types/transaction";
import type { Portfolio } from "@/types/portfolio";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

type Mode = "stock" | "cash";
type CashDirection = "deposit" | "withdrawal";

function deriveModeFromTransaction(t?: Transaction): Mode {
  if (!t) return "stock";
  return t.transaction_type === "equity" ? "stock" : "cash";
}

function deriveDirectionFromTransaction(t?: Transaction): CashDirection {
  if (!t) return "deposit";
  return t.transaction_type === "cash_withdrawal" ? "withdrawal" : "deposit";
}

interface Props {
  onSuccess: (transaction: Transaction) => void;
  onCancel: () => void;
  transaction?: Transaction;
  portfolios: Portfolio[];
  defaultPortfolioId?: string;
}

export default function AddTransactionForm({
  onSuccess,
  onCancel,
  transaction,
  portfolios,
  defaultPortfolioId,
}: Props) {
  const [mode, setMode] = useState<Mode>(() => deriveModeFromTransaction(transaction));
  const [cashDirection, setCashDirection] = useState<CashDirection>(() => deriveDirectionFromTransaction(transaction));

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema) as Resolver<TransactionFormValues>,
    defaultValues: transaction
      ? {
          ticker: transaction.ticker,
          purchase_date: transaction.purchase_date,
          purchase_price: transaction.purchase_price,
          currency: transaction.currency,
          shares: transaction.shares,
          portfolio_id: transaction.portfolio_id,
          transaction_type: transaction.transaction_type,
        }
      : {
          ticker: "",
          purchase_date: "",
          currency: "USD",
          portfolio_id: defaultPortfolioId ?? portfolios.at(0)?.id ?? "",
          transaction_type: "equity",
        },
  });

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  function switchMode(next: Mode) {
    if (next === "cash") {
      setValue("ticker", "CASH", { shouldValidate: false });
      setValue("shares", 1, { shouldValidate: false });
    } else {
      setValue("ticker", "", { shouldValidate: false });
      // shares and purchase_price reset to undefined so the user must re-enter them
      setValue("shares", undefined as unknown as number, { shouldValidate: false });
      setValue("purchase_price", undefined as unknown as number, { shouldValidate: false });
    }
    setMode(next);
  }

  async function onSubmit(values: TransactionFormValues) {
    // transaction_type is always overridden here from mode/cashDirection;
    // the RHF field value is not authoritative in Cash mode.
    const payload: TransactionFormValues =
      mode === "cash"
        ? {
            ...values,
            ticker: "CASH",
            shares: 1,
            transaction_type: cashDirection === "deposit" ? "cash_deposit" : "cash_withdrawal",
          }
        : { ...values, transaction_type: "equity" };

    const url = transaction ? `/api/transactions/${transaction.id}` : "/api/transactions";
    const method = transaction ? "PUT" : "POST";
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

    const json = (await response.json().catch(() => ({ data: null }))) as { data: Transaction | null };
    if (!json.data) {
      setError("root", { message: "Unexpected server error" });
      return;
    }
    onSuccess(json.data);
  }

  const isCash = mode === "cash";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {/* Mode toggle */}
      <div className="border-border flex overflow-hidden rounded-md border">
        <button
          type="button"
          onClick={() => {
            switchMode("stock");
          }}
          disabled={isSubmitting}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            !isCash ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          Stock
        </button>
        <button
          type="button"
          onClick={() => {
            switchMode("cash");
          }}
          disabled={isSubmitting}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            isCash ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
          }`}
        >
          Cash
        </button>
      </div>

      {/* Portfolio */}
      <div className="space-y-1">
        <Label htmlFor="portfolio_id">Portfolio</Label>
        <Controller
          control={control}
          name="portfolio_id"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="portfolio_id" className="w-full" aria-invalid={!!errors.portfolio_id}>
                <SelectValue placeholder="Select portfolio" />
              </SelectTrigger>
              <SelectContent>
                {portfolios.map((portfolio) => (
                  <SelectItem key={portfolio.id} value={portfolio.id}>
                    {portfolio.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.portfolio_id && (
          <p className="flex items-center gap-1 text-xs text-red-400">
            <CircleAlert className="size-3" />
            {errors.portfolio_id.message}
          </p>
        )}
      </div>

      {/* Stock-only: Ticker */}
      {!isCash && (
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
      )}

      {/* Purchase date */}
      <div className="space-y-1">
        <Label htmlFor="purchase_date">{isCash ? "Date" : "Purchase date"}</Label>
        <Input id="purchase_date" type="date" {...register("purchase_date")} aria-invalid={!!errors.purchase_date} />
        {errors.purchase_date && (
          <p className="flex items-center gap-1 text-xs text-red-400">
            <CircleAlert className="size-3" />
            {errors.purchase_date.message}
          </p>
        )}
      </div>

      {/* Cash-only: Deposit/Withdrawal toggle */}
      {isCash && (
        <div className="space-y-1">
          <Label>Type</Label>
          <div className="border-border flex overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => {
                setCashDirection("deposit");
              }}
              disabled={isSubmitting}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                cashDirection === "deposit"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => {
                setCashDirection("withdrawal");
              }}
              disabled={isSubmitting}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                cashDirection === "withdrawal"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              Withdrawal
            </button>
          </div>
        </div>
      )}

      {/* Purchase price (Stock) / Amount (Cash) */}
      <div className="space-y-1">
        <Label htmlFor="purchase_price">{isCash ? "Amount" : "Purchase price"}</Label>
        <Input
          id="purchase_price"
          type="number"
          step={isCash ? "0.01" : "0.0001"}
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

      {/* Stock-only: Shares */}
      {!isCash && (
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
      )}

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
