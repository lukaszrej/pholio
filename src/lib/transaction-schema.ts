import { z } from "zod";

export const CURRENCIES = ["PLN", "USD", "EUR", "GBP", "CHF", "CAD", "AUD", "JPY", "DKK", "NOK", "SEK"] as const;

export const transactionSchema = z.object({
  ticker: z
    .string()
    .min(1, "Ticker is required")
    .transform((v) => v.trim().toUpperCase()),
  purchase_price: z.coerce.number().positive("Purchase price must be positive"),
  purchase_date: z.string().min(1, "Purchase date is required"),
  currency: z.enum(CURRENCIES),
  shares: z.coerce.number().positive("Shares must be positive"),
});

export type TransactionFormValues = z.infer<typeof transactionSchema>;
