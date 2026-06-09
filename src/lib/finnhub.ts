import { FINNHUB_API_KEY } from "astro:env/server";

export async function fetchQuote(ticker: string): Promise<number | null> {
  if (!FINNHUB_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 2500);

  try {
    // token in query string — Finnhub requires this form; do not log this URL
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_API_KEY}`,
      { signal: controller.signal },
    );

    if (!response.ok) return null;

    const json: unknown = await response.json();
    if (typeof json !== "object" || json === null) return null;
    const data = json as { c: number };
    if (!data.c || data.c === 0) return null; // c === 0 means no market data for this symbol

    return data.c;
  } catch (e) {
    console.error("[finnhub] fetchQuote failed", ticker, e);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
