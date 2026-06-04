export type Currency = 'PLN' | 'USD' | 'EUR' | 'GBP' | 'CHF' | 'CAD' | 'AUD' | 'JPY' | 'DKK' | 'NOK' | 'SEK';

export interface Transaction {
  id: string;
  user_id: string;
  ticker: string;
  purchase_price: number;
  purchase_date: string;
  currency: Currency;
  shares: number;
  created_at: string;
  updated_at: string;
}

export type NewTransaction = Omit<Transaction, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export type UpdateTransaction = Partial<NewTransaction>;
