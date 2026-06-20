ALTER TABLE public.transactions
  ADD COLUMN transaction_type TEXT NOT NULL DEFAULT 'equity'
    CHECK (transaction_type IN ('equity', 'cash_deposit', 'cash_withdrawal'));
