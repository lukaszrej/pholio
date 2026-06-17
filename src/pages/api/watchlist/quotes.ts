import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { refreshPricesForTickers } from "@/lib/prices";
import { refreshSectorsForTickers } from "@/lib/sectors";
import type { PriceData } from "@/lib/portfolio";

const JSON_HEADERS = { "Content-Type": "application/json" };
const MAX_TICKERS = 25;

interface ProfileData {
  sector: string | null;
  name: string | null;
}

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const reqUrl = new URL(context.request.url);
  const raw = reqUrl.searchParams.get("tickers") ?? "";
  const tickers = [
    ...new Set(
      raw
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter((t) => t.length > 0),
    ),
  ].slice(0, MAX_TICKERS);

  if (tickers.length === 0) {
    return new Response(JSON.stringify({ error: "tickers query param is required" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const [prices, profiles] = await Promise.all([
    refreshPricesForTickers(tickers, supabase),
    refreshSectorsForTickers(tickers, supabase),
  ]);

  // Cast to include undefined so missing-ticker checks are valid at compile time
  const pricesMap = prices as Record<string, PriceData | undefined>;
  const profilesMap = profiles as Record<string, ProfileData | undefined>;

  const data: Record<
    string,
    {
      ticker: string;
      name: string;
      c: number;
      d: number | null;
      dp: number | null;
      h: number | null;
      l: number | null;
      o: number | null;
      pc: number | null;
    }
  > = {};

  for (const ticker of tickers) {
    const price = pricesMap[ticker];
    if (!price) continue;

    const profile = profilesMap[ticker];
    data[ticker] = {
      ticker,
      name: profile?.name ?? ticker,
      c: price.price,
      d: price.changeAbs,
      dp: price.changePct,
      h: price.high,
      l: price.low,
      o: price.open,
      pc: price.prevClose,
    };
  }

  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: JSON_HEADERS,
  });
};
