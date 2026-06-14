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
  });

  it("valid quote — returns the price", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ c: 123.45 }),
    });

    const result = await fetchQuote("AAPL");

    expect(result).toBe(123.45);
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
});
