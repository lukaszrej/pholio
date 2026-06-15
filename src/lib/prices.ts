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
  const cacheMap = new Map<string, { price: number; fetched_at: string }>();
  for (const row of (cachedRows ?? []) as { ticker: string; price: number; fetched_at: string }[]) {
    cacheMap.set(row.ticker, { price: row.price, fetched_at: row.fetched_at });
  }

  const limit = pLimit(10);
  await Promise.allSettled(
    tickers.map((ticker) =>
      limit(async () => {
        const cached = cacheMap.get(ticker);
        if (cached?.fetched_at.split("T")[0] === today) {
          prices[ticker] = { price: cached.price, fetched_at: cached.fetched_at, is_fresh: true };
          return;
        }

        const quote = await fetchQuote(ticker);
        if (quote !== null) {
          const fetched_at = new Date().toISOString();
          const { error: upsertErr } = await supabase.from("prices").upsert({ ticker, price: quote, fetched_at });
          // eslint-disable-next-line no-console
          if (upsertErr) console.error("[prices] upsert failed", ticker, upsertErr.message);
          prices[ticker] = { price: quote, fetched_at, is_fresh: true };
        } else if (cached) {
          prices[ticker] = { price: cached.price, fetched_at: cached.fetched_at, is_fresh: false };
        }
      }),
    ),
  );

  return prices;
}
