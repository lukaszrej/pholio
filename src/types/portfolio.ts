export interface Portfolio {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export type NewPortfolio = Pick<Portfolio, "name">;
