import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { fetchQuote, fetchProfile } from "@/lib/finnhub";

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
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mockFetch.mockReset();
    mockApiKey = "test-key";
    vi.useRealTimers();
  });

  it("valid quote with all OHLC fields — returns full shape", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: 123.45, dp: 1.23, d: 1.5, h: 125.0, l: 121.0, o: 122.0, pc: 121.95 }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toEqual({
      price: 123.45,
      changePct: 1.23,
      changeAbs: 1.5,
      high: 125.0,
      low: 121.0,
      open: 122.0,
      prevClose: 121.95,
    });
  });

  it("valid quote with dp — returns { price, changePct } with null OHLC when absent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: 123.45, dp: 1.23 }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toEqual({
      price: 123.45,
      changePct: 1.23,
      changeAbs: null,
      high: null,
      low: null,
      open: null,
      prevClose: null,
    });
  });

  it("dp absent — changePct is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: 123.45 }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toEqual({
      price: 123.45,
      changePct: null,
      changeAbs: null,
      high: null,
      low: null,
      open: null,
      prevClose: null,
    });
  });

  it("dp === 0 — changePct is 0 (valid flat day, not coerced to null)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: 123.45, dp: 0 }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toEqual({
      price: 123.45,
      changePct: 0,
      changeAbs: null,
      high: null,
      low: null,
      open: null,
      prevClose: null,
    });
  });

  it("dp is non-finite (Infinity) — changePct is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: 123.45, dp: Infinity }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toEqual({
      price: 123.45,
      changePct: null,
      changeAbs: null,
      high: null,
      low: null,
      open: null,
      prevClose: null,
    });
  });

  it("OHLC fields non-finite — each becomes null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: 100, dp: 1, d: Infinity, h: NaN, l: "bad", o: null, pc: 99 }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toEqual({
      price: 100,
      changePct: 1,
      changeAbs: null,
      high: null,
      low: null,
      open: null,
      prevClose: 99,
    });
  });

  it("c === 0 — returns null (Finnhub no-data guard)", async () => {
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

describe("fetchProfile", () => {
  const mockFetch = vi.fn();
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mockFetch.mockReset();
    mockApiKey = "test-key";
    vi.useRealTimers();
  });

  it("valid profile — returns { sector, name }", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ finnhubIndustry: "Technology", name: "Apple Inc" }),
    });

    const result = await fetchProfile("AAPL");

    expect(result).toEqual({ sector: "Technology", name: "Apple Inc" });
  });

  it("blank sector — sector is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ finnhubIndustry: "  ", name: "Some Corp" }),
    });

    const result = await fetchProfile("AAPL");

    expect(result).toEqual({ sector: null, name: "Some Corp" });
  });

  it("absent fields — both null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await fetchProfile("AAPL");

    expect(result).toEqual({ sector: null, name: null });
  });

  it("non-OK response — returns null", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const result = await fetchProfile("AAPL");

    expect(result).toBeNull();
  });

  it("missing API key — returns null and does not call fetch", async () => {
    mockApiKey = undefined;

    const result = await fetchProfile("AAPL");

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetch throws — returns null", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await fetchProfile("AAPL");

    expect(result).toBeNull();
  });
});
