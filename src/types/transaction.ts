import { CURRENCIES } from "@/lib/transaction-schema";

export type Currency = (typeof CURRENCIES)[number];

export type TransactionType = "equity" | "cash_deposit" | "cash_withdrawal";

export interface Transaction {
  id: string;
  user_id: string;
  ticker: string;
  purchase_price: number;
  purchase_date: string;
  currency: Currency;
  shares: number;
  portfolio_id: string;
  transaction_type: TransactionType;
  created_at: string;
  updated_at: string;
}

export type NewTransaction = Omit<Transaction, "id" | "user_id" | "created_at" | "updated_at">;

export type UpdateTransaction = Partial<NewTransaction>;
