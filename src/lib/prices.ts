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

  const { data: cachedRows, error: cacheErr } = await supabase
    .from("prices")
    .select("ticker, price, fetched_at, change_pct, change_abs, high, low, open, prev_close")
    .in("ticker", tickers);
  // eslint-disable-next-line no-console
  if (cacheErr) console.error("[prices] cache read failed", cacheErr.message);
  const cacheMap = new Map<
    string,
    {
      price: number;
      fetched_at: string;
      change_pct: number | null;
      change_abs: number | null;
      high: number | null;
      low: number | null;
      open: number | null;
      prev_close: number | null;
    }
  >();
  for (const row of (cachedRows ?? []) as {
    ticker: string;
    price: number;
    fetched_at: string;
    change_pct: number | null;
    change_abs: number | null;
    high: number | null;
    low: number | null;
    open: number | null;
    prev_close: number | null;
  }[]) {
    cacheMap.set(row.ticker, {
      price: row.price,
      fetched_at: row.fetched_at,
      change_pct: row.change_pct ?? null,
      change_abs: row.change_abs ?? null,
      high: row.high ?? null,
      low: row.low ?? null,
      open: row.open ?? null,
      prev_close: row.prev_close ?? null,
    });
  }

  const limit = pLimit(10);
  await Promise.allSettled(
    tickers.map((ticker) =>
      limit(async () => {
        const cached = cacheMap.get(ticker);
        if (cached && new Date(cached.fetched_at).toISOString().split("T")[0] === today) {
          prices[ticker] = {
            price: cached.price,
            fetched_at: cached.fetched_at,
            is_fresh: true,
            changePct: cached.change_pct,
            changeAbs: cached.change_abs,
            high: cached.high,
            low: cached.low,
            open: cached.open,
            prevClose: cached.prev_close,
          };
          return;
        }

        const quote = await fetchQuote(ticker);
        if (quote !== null) {
          const fetched_at = new Date().toISOString();
          const { error: upsertErr } = await supabase.from("prices").upsert({
            ticker,
            price: quote.price,
            fetched_at,
            change_pct: quote.changePct,
            change_abs: quote.changeAbs,
            high: quote.high,
            low: quote.low,
            open: quote.open,
            prev_close: quote.prevClose,
          });
          // eslint-disable-next-line no-console
          if (upsertErr) console.error("[prices] upsert failed", ticker, upsertErr.message);
          prices[ticker] = {
            price: quote.price,
            fetched_at,
            is_fresh: true,
            changePct: quote.changePct,
            changeAbs: quote.changeAbs,
            high: quote.high,
            low: quote.low,
            open: quote.open,
            prevClose: quote.prevClose,
          };
        } else if (cached) {
          prices[ticker] = {
            price: cached.price,
            fetched_at: cached.fetched_at,
            is_fresh: false,
            changePct: cached.change_pct,
            changeAbs: cached.change_abs,
            high: cached.high,
            low: cached.low,
            open: cached.open,
            prevClose: cached.prev_close,
          };
        }
      }),
    ),
  );

  return prices;
}
