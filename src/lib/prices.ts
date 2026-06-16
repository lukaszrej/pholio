import type { SupabaseClient } from "@supabase/supabase-js";
import pLimit from "p-limit";
import { fetchQuote } from "@/lib/finnhub";
import type { PriceData } from "@/lib/portfolio";

export async function refreshPricesForTickers(
  tickers: string[],
  supabase: SupabaseClient,
): Promise<Record<string, PriceData>> {
  const prices: Record<string, PriceData> = {};
  if (tickers.length === 0) return prices;

  const today = new Date().toISOString().split("T")[0];

  const { data: cachedRows } = await supabase.from("prices").select("*").in("ticker", tickers);
  const cacheMap = new Map<string, { price: number; fetched_at: string; change_pct: number | null }>();
  for (const row of (cachedRows ?? []) as {
    ticker: string;
    price: number;
    fetched_at: string;
    change_pct: number | null;
  }[]) {
    cacheMap.set(row.ticker, { price: row.price, fetched_at: row.fetched_at, change_pct: row.change_pct ?? null });
  }

  const limit = pLimit(10);
  await Promise.allSettled(
    tickers.map((ticker) =>
      limit(async () => {
        const cached = cacheMap.get(ticker);
        if (cached?.fetched_at.split("T")[0] === today) {
          prices[ticker] = {
            price: cached.price,
            fetched_at: cached.fetched_at,
            is_fresh: true,
            changePct: cached.change_pct,
          };
          return;
        }

        const quote = await fetchQuote(ticker);
        if (quote !== null) {
          const fetched_at = new Date().toISOString();
          const { error: upsertErr } = await supabase
            .from("prices")
            .upsert({ ticker, price: quote.price, fetched_at, change_pct: quote.changePct });
          // eslint-disable-next-line no-console
          if (upsertErr) console.error("[prices] upsert failed", ticker, upsertErr.message);
          prices[ticker] = { price: quote.price, fetched_at, is_fresh: true, changePct: quote.changePct };
        } else if (cached) {
          prices[ticker] = {
            price: cached.price,
            fetched_at: cached.fetched_at,
            is_fresh: false,
            changePct: cached.change_pct,
          };
        }
      }),
    ),
  );

  return prices;
}
