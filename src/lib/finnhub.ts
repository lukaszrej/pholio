import { FINNHUB_API_KEY } from "astro:env/server";

export async function fetchProfile(ticker: string): Promise<{ sector: string | null; name: string | null } | null> {
  if (!FINNHUB_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 2500);

  try {
    const response = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}`, {
      signal: controller.signal,
      headers: { "X-Finnhub-Token": FINNHUB_API_KEY },
    });

    if (!response.ok) return null;

    const json: unknown = await response.json();
    if (typeof json !== "object" || json === null) return null;
    const data = json as { finnhubIndustry?: string; name?: string };

    const sector =
      typeof data.finnhubIndustry === "string" && data.finnhubIndustry.trim().length > 0 ? data.finnhubIndustry : null;
    const name = typeof data.name === "string" && data.name.trim().length > 0 ? data.name : null;

    return { sector, name };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[finnhub] fetchProfile failed", ticker, e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchQuote(ticker: string): Promise<{
  price: number;
  changePct: number | null;
  changeAbs: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  prevClose: number | null;
} | null> {
  if (!FINNHUB_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 2500);

  try {
    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}`, {
      signal: controller.signal,
      headers: { "X-Finnhub-Token": FINNHUB_API_KEY },
    });

    if (!response.ok) return null;

    const json: unknown = await response.json();
    if (typeof json !== "object" || json === null) return null;
    const data = json as {
      c?: unknown;
      dp?: unknown;
      d?: unknown;
      h?: unknown;
      l?: unknown;
      o?: unknown;
      pc?: unknown;
    };
    if (typeof data.c !== "number" || data.c === 0) return null; // c === 0 means no market data for this symbol

    const changePct = typeof data.dp === "number" && isFinite(data.dp) ? data.dp : null;
    const changeAbs = typeof data.d === "number" && isFinite(data.d) ? data.d : null;
    const high = typeof data.h === "number" && isFinite(data.h) ? data.h : null;
    const low = typeof data.l === "number" && isFinite(data.l) ? data.l : null;
    const open = typeof data.o === "number" && isFinite(data.o) ? data.o : null;
    const prevClose = typeof data.pc === "number" && isFinite(data.pc) ? data.pc : null;

    return { price: data.c, changePct, changeAbs, high, low, open, prevClose };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[finnhub] fetchQuote failed", ticker, e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
