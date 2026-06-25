import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/prices", () => ({
  refreshPricesForTickers: vi.fn(),
}));

vi.mock("@/lib/sectors", () => ({
  refreshSectorsForTickers: vi.fn(),
}));

import { GET } from "@/pages/api/watchlist/quotes";
import { createClient } from "@/lib/supabase";
import { refreshPricesForTickers } from "@/lib/prices";
import { refreshSectorsForTickers } from "@/lib/sectors";

const mockCreateClient = vi.mocked(createClient);
const mockRefreshPrices = vi.mocked(refreshPricesForTickers);
const mockRefreshSectors = vi.mocked(refreshSectorsForTickers);

interface QuoteEntry {
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

const FRESH_PRICE = {
  fetched_at: "2026-06-17T10:00:00.000Z",
  is_fresh: true,
  changePct: 1.23,
  changeAbs: 2.45,
  high: 201.0,
  low: 198.0,
  open: 199.0,
  prevClose: 198.05,
};

type GetContext = Parameters<typeof GET>[0];

function makeContext(tickersParam: string | null, user: unknown = { id: "user-1" }): GetContext {
  const url =
    tickersParam !== null
      ? `http://localhost/api/watchlist/quotes?tickers=${tickersParam}`
      : "http://localhost/api/watchlist/quotes";
  return {
    request: new Request(url),
    cookies: { set: vi.fn() },
    locals: { user },
  } as unknown as GetContext;
}

describe("GET /api/watchlist/quotes", () => {
  const mockSupabase = {} as SupabaseClient;

  beforeEach(() => {
    vi.resetAllMocks();
    mockCreateClient.mockReturnValue(mockSupabase);
    mockRefreshPrices.mockResolvedValue({});
    mockRefreshSectors.mockResolvedValue({});
  });

  describe("Auth gating", () => {
    it("(a) no user → 401 Unauthorized", async () => {
      const ctx = makeContext("AAPL", null);

      const res = await GET(ctx);

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Unauthorized");
    });
  });

  describe("Input validation", () => {
    it("(b) empty tickers param → 400", async () => {
      const res = await GET(makeContext(""));
      expect(res.status).toBe(400);
    });

    it("(c) tickers param absent → 400", async () => {
      const res = await GET(makeContext(null));
      expect(res.status).toBe(400);
    });

    it("(d) only whitespace tickers → 400", async () => {
      const res = await GET(makeContext("  , ,  "));
      expect(res.status).toBe(400);
    });
  });

  describe("Batch success shape", () => {
    it("(e) 200 with full c,d,dp,h,l,o,pc,name shape for resolved tickers", async () => {
      mockRefreshPrices.mockResolvedValue({
        AAPL: { price: 200.5, ...FRESH_PRICE },
        NVDA: {
          price: 900.0,
          ...FRESH_PRICE,
          changePct: 0.5,
          changeAbs: 4.5,
          high: 905.0,
          low: 895.0,
          open: 896.0,
          prevClose: 895.5,
        },
      });
      mockRefreshSectors.mockResolvedValue({
        AAPL: { sector: "Technology", name: "Apple Inc" },
        NVDA: { sector: "Technology", name: "NVIDIA Corporation" },
      });

      const res = await GET(makeContext("AAPL,NVDA"));

      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Record<string, QuoteEntry> };
      expect(Object.keys(body.data)).toEqual(expect.arrayContaining(["AAPL", "NVDA"]));

      const aapl = body.data.AAPL;
      expect(aapl.ticker).toBe("AAPL");
      expect(aapl.name).toBe("Apple Inc");
      expect(aapl.c).toBe(200.5);
      expect(aapl.d).toBe(2.45);
      expect(aapl.dp).toBe(1.23);
      expect(aapl.h).toBe(201.0);
      expect(aapl.l).toBe(198.0);
      expect(aapl.o).toBe(199.0);
      expect(aapl.pc).toBe(198.05);
    });

    it("(f) ticker symbols are normalised to uppercase", async () => {
      mockRefreshPrices.mockResolvedValue({
        AAPL: { price: 200.5, ...FRESH_PRICE },
      });
      mockRefreshSectors.mockResolvedValue({
        AAPL: { sector: "Technology", name: "Apple Inc" },
      });

      const res = await GET(makeContext("aapl"));

      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Record<string, QuoteEntry> };
      expect(body.data.AAPL).toBeDefined();
    });
  });

  describe("Partial-failure tolerance", () => {
    it("(g) unresolvable ticker absent from response; valid siblings remain", async () => {
      mockRefreshPrices.mockResolvedValue({
        AAPL: { price: 200.5, ...FRESH_PRICE },
        // ZZZZ absent — failed to resolve
      });
      mockRefreshSectors.mockResolvedValue({
        AAPL: { sector: "Technology", name: "Apple Inc" },
      });

      const res = await GET(makeContext("AAPL,ZZZZ"));

      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: Record<string, QuoteEntry | undefined> };
      expect(body.data.AAPL).toBeDefined();
      expect(body.data.ZZZZ).toBeUndefined();
    });

    it("(h) name falls back to ticker symbol when profile unavailable", async () => {
      mockRefreshPrices.mockResolvedValue({
        AAPL: {
          price: 200.5,
          ...FRESH_PRICE,
          changePct: null,
          changeAbs: null,
          high: null,
          low: null,
          open: null,
          prevClose: null,
        },
      });
      mockRefreshSectors.mockResolvedValue({});

      const res = await GET(makeContext("AAPL"));

      const body = (await res.json()) as { data: Record<string, QuoteEntry> };
      expect(body.data.AAPL.name).toBe("AAPL");
    });
  });

  describe("Error handling", () => {
    it("(i) supabase client unavailable → 500", async () => {
      mockCreateClient.mockReturnValue(null);

      const res = await GET(makeContext("AAPL"));

      expect(res.status).toBe(500);
    });
  });

  describe("Input cap", () => {
    it("(j) more than 25 distinct tickers are silently capped — only first 25 forwarded upstream", async () => {
      const allTickers = Array.from({ length: 26 }, (_, i) => `T${i + 1}`);
      mockRefreshPrices.mockResolvedValue({});
      mockRefreshSectors.mockResolvedValue({});

      await GET(makeContext(allTickers.join(",")));

      const [calledTickers] = mockRefreshPrices.mock.calls[0];
      expect(calledTickers).toHaveLength(25);
      expect(calledTickers).toEqual(allTickers.slice(0, 25));
    });
  });
});
