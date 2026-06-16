import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { fetchQuote } from "@/lib/finnhub";

// Declare before vi.mock so the getter can close over it.
// vi.mock is hoisted before imports at runtime; the getter resolves mockApiKey
// lazily at each call, so by the time any test runs the variable is initialized.
let mockApiKey: string | undefined = "test-key";

vi.mock("astro:env/server", () => ({
  get FINNHUB_API_KEY() {
    return mockApiKey;
  },
}));

describe("fetchQuote", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
  });

  afterEach(() => {
    mockFetch.mockReset();
    mockApiKey = "test-key";
    vi.useRealTimers();
  });

  it("valid quote with dp — returns { price, changePct }", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: 123.45, dp: 1.23 }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toEqual({ price: 123.45, changePct: 1.23 });
  });

  it("dp absent — changePct is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: 123.45 }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toEqual({ price: 123.45, changePct: null });
  });

  it("dp === 0 — changePct is 0 (valid flat day, not coerced to null)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: 123.45, dp: 0 }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toEqual({ price: 123.45, changePct: 0 });
  });

  it("dp is non-finite (Infinity) — changePct is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: 123.45, dp: Infinity }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toEqual({ price: 123.45, changePct: null });
  });

  it("c === 0 — returns null (named guard at finnhub.ts:53)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: 0 }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toBeNull();
  });

  it("falsy c (undefined) — returns null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: undefined }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toBeNull();
  });

  it("non-OK response — returns null", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const result = await fetchQuote("AAPL");

    expect(result).toBeNull();
  });

  it("missing API key — returns null and does not call fetch", async () => {
    mockApiKey = undefined;

    const result = await fetchQuote("AAPL");

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetch throws — returns null (caught by try/catch)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchQuote("AAPL");

    expect(result).toBeNull();
  });

  it("AbortController fires at 2500ms — returns null", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("signal is aborted without reason", "AbortError"));
        });
      });
    });

    const promise = fetchQuote("AAPL");
    await vi.advanceTimersByTimeAsync(2500);
    const result = await promise;

    expect(result).toBeNull();
  });
});
