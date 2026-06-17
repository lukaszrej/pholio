import type { SupabaseClient } from "@supabase/supabase-js";
import pLimit from "p-limit";
import { fetchProfile } from "@/lib/finnhub";

const SECTOR_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function refreshSectorsForTickers(
  tickers: string[],
  supabase: SupabaseClient,
): Promise<Record<string, { sector: string | null; name: string | null }>> {
  const result: Record<string, { sector: string | null; name: string | null }> = {};
  if (tickers.length === 0) return result;

  const { data: cachedRows, error: cacheErr } = await supabase
    .from("sectors")
    .select("ticker, sector, name, fetched_at")
    .in("ticker", tickers);
  // eslint-disable-next-line no-console
  if (cacheErr) console.error("[sectors] cache read failed", cacheErr.message);

  const cacheMap = new Map<string, { sector: string; name: string | null; fetched_at: string }>();
  for (const row of (cachedRows ?? []) as {
    ticker: string;
    sector: string;
    name: string | null;
    fetched_at: string;
  }[]) {
    cacheMap.set(row.ticker, { sector: row.sector, name: row.name ?? null, fetched_at: row.fetched_at });
  }

  const limit = pLimit(10);
  await Promise.allSettled(
    tickers.map((ticker) =>
      limit(async () => {
        const cached = cacheMap.get(ticker);
        if (cached && Date.now() - new Date(cached.fetched_at).getTime() < SECTOR_TTL_MS) {
          result[ticker] = { sector: cached.sector, name: cached.name };
          return;
        }

        const profile = await fetchProfile(ticker);
        if (profile !== null) {
          const fetched_at = new Date().toISOString();
          const sector = profile.sector ?? "Other";
          const { error: upsertErr } = await supabase
            .from("sectors")
            .upsert({ ticker, sector, name: profile.name, fetched_at });
          // eslint-disable-next-line no-console
          if (upsertErr) console.error("[sectors] upsert failed", ticker, upsertErr.message);
          result[ticker] = { sector, name: profile.name };
        } else if (cached) {
          result[ticker] = { sector: cached.sector, name: cached.name };
        }
      }),
    ),
  );

  return result;
}
