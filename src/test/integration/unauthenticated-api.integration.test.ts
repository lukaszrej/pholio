import { describe, it, expect } from "vitest";
import { onRequest } from "../../middleware";
import { makeContext, type SyntheticContext } from "./helpers/middleware-context";

// Invoke onRequest with a synthetic context — concentrates the cast at one call site.
async function invoke(ctx: SyntheticContext, next: unknown): Promise<Response> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (onRequest as (ctx: any, next: any) => Promise<Response>)(ctx, next);
}

describe("Risk #3 — unauthenticated API guard (middleware)", () => {
  describe("PROTECTED_API_ROUTES catch-all: no valid session → 401", () => {
    it("(a) GET /api/portfolios with no Cookie → 401 Unauthorized; next not called", async () => {
      const { context, next } = makeContext("GET", "/api/portfolios");

      const response = await invoke(context, next);

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("(b) POST /api/transactions with no Cookie → 401; next not called", async () => {
      const { context, next } = makeContext("POST", "/api/transactions");

      const response = await invoke(context, next);

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
    });

    it("(c) GET /api/portfolios with garbage Cookie → 401; next not called", async () => {
      const { context, next } = makeContext("GET", "/api/portfolios", "garbage-session=not-a-real-token");

      const response = await invoke(context, next);

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
    });

    it("(d) PUT /api/portfolios/<uuid> with no Cookie → 401 Unauthorized; next not called", async () => {
      const { context, next } = makeContext("PUT", "/api/portfolios/00000000-0000-0000-0000-000000000001");

      const response = await invoke(context, next);

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("(e) DELETE /api/portfolios/<uuid> with no Cookie → 401; next not called", async () => {
      const { context, next } = makeContext("DELETE", "/api/portfolios/00000000-0000-0000-0000-000000000001");

      const response = await invoke(context, next);

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
    });

    it("(f) PUT /api/portfolios/<uuid> with garbage Cookie → 401; next not called", async () => {
      const { context, next } = makeContext(
        "PUT",
        "/api/portfolios/00000000-0000-0000-0000-000000000001",
        "garbage-session=not-a-real-token",
      );

      const response = await invoke(context, next);

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
    });
  });

  describe("/api/watchlist/quotes — no valid session → 401", () => {
    it("(d) GET /api/watchlist/quotes with no Cookie → 401 Unauthorized; next not called", async () => {
      const { context, next } = makeContext("GET", "/api/watchlist/quotes");

      const response = await invoke(context, next);

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("(e) GET /api/watchlist/quotes with garbage Cookie → 401; next not called", async () => {
      const { context, next } = makeContext("GET", "/api/watchlist/quotes", "garbage-session=not-a-real-token");

      const response = await invoke(context, next);

      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: string };
      expect(body).toEqual({ error: "Unauthorized" });
    });
  });

  describe("PUBLIC_API_ROUTES are exempt from the 401 guard", () => {
    it("(f) GET /api/auth/callback → next IS called (not 401)", async () => {
      const { context, next } = makeContext("GET", "/api/auth/callback");

      const response = await invoke(context, next);

      expect(next).toHaveBeenCalledOnce();
      expect(response.status).not.toBe(401);
    });
  });
});
