import { FINNHUB_API_KEY } from "astro:env/server";

export async function fetchQuote(ticker: string): Promise<number | null> {
  if (!FINNHUB_API_KEY) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 2500);

  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_API_KEY}`,
      { signal: controller.signal },
    );

    if (!response.ok) return null;

    const data = (await response.json()) as { c: number };

    if (!data.c || data.c === 0) return null;

    return data.c;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
