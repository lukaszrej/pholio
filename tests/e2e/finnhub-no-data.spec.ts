import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Named after test-plan.md Risk #6 ("Finnhub returns {c: 0} ... zero price
// written to cache — user sees $0 current price and wildly wrong ROI with no
// warning"). Modeled on tests/e2e/seed.spec.ts and
// tests/e2e/finnhub-fallback.spec.ts's getByRole / unique-data / full
// lifecycle pattern.
//
// This covers the *no-cache* branch of Risk #6, which is distinct from what
// finnhub-fallback.spec.ts (Risk #5) already proves: that test seeds a stale
// cache row and shows the fallback-to-cached-price path. This test seeds NO
// row at all, so refreshPricesForTickers() takes its other branch — quote
// fetch fails and there is no `cached` entry, so nothing is written to the
// result or the `prices` table, and the position must render as "no data",
// never $0.
//
// Real vs mocked: no network mocking. dashboard.astro calls Finnhub
// server-side (src/lib/finnhub.ts via src/lib/prices.ts), so browser-level
// page.route() can't intercept it. Instead this test exploits a real, stable
// Finnhub behavior: an unrecognized ticker symbol reliably returns `{c: 0}`,
// which fetchQuote() already treats as "no data" and returns null.
test("brand-new ticker with no Finnhub data shows no-data marker, not $0, and writes no cache row", async ({
  page,
}) => {
  const ticker = `NODATA${Date.now()}`;
  const portfolioName = `E2E No-Data Portfolio ${Date.now()}`;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.test).");
  }
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Precondition: no price row exists yet for this brand-new ticker.
  const { count: preCount } = await admin
    .from("prices")
    .select("*", { count: "exact", head: true })
    .eq("ticker", ticker);
  expect(preCount).toBe(0);

  await page.goto("/dashboard");
  // DashboardView is a client:load React island — wait for its bundle to
  // finish loading and hydrating before the first interaction, or an early
  // click lands on inert server-rendered markup.
  await page.waitForLoadState("networkidle");

  // Setup: an isolated portfolio for this run only.
  await page.getByRole("button", { name: "+ Add portfolio" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill(portfolioName);
  const createResponse = page.waitForResponse(
    (r) => r.url().includes("/api/portfolios") && r.request().method() === "POST",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  const { data: portfolio } = (await (await createResponse).json()) as { data: { id: string } };
  await expect(page.getByRole("button", { name: portfolioName })).toBeVisible();

  // Action: record a purchase for the fake ticker.
  await page.getByRole("button", { name: "Add transaction" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByLabel("Ticker").fill(ticker);
  await addDialog.getByLabel("Purchase date").fill("2024-01-15");
  await addDialog.getByLabel("Purchase price").fill("42.5");
  await addDialog.getByLabel("Shares").fill("10");
  await addDialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(addDialog).not.toBeVisible();

  // dashboard.astro computes prices server-side per request; the client
  // never re-fetches prices after adding a transaction (DashboardView holds
  // `prices` in state seeded once from server props), so a reload is
  // required to force the real refreshPricesForTickers() run against the
  // newly-added ticker, which has no cache row at all.
  await page.reload();
  await page.waitForLoadState("networkidle");

  // activeTab is plain client React state (DashboardView.tsx), not persisted
  // across a reload — it always comes back up as "all", which renders the
  // card-grid summary view, not the row/cell table. Switch back to this
  // portfolio's own tab to reach the table.
  await page.getByRole("button", { name: portfolioName }).click();

  // Assertion: the dashboard did not crash, and the holdings row shows the
  // no-data marker ("—") for price, market value and P&L — never $0 — the
  // signal src/components/portfolio/PortfolioSection.tsx's
  // formatCurrentPrice() and the positionValue/roiAbs cells use for a null
  // currentPrice.
  const row = page.getByRole("row", { name: new RegExp(ticker) });
  await expect(row).toBeVisible();
  const cells = row.getByRole("cell");
  await expect(cells.nth(2)).toHaveText("—"); // "Last" (current price) column
  await expect(cells.nth(5)).toHaveText("—"); // "Mkt value" column
  await expect(cells.nth(6)).toHaveText("—"); // "P&L" column

  // Load-bearing data-layer assertion: no row was ever written to `prices`
  // for this ticker — the guard doesn't just hide a written zero, it
  // prevents the write entirely.
  const { count: postCount } = await admin
    .from("prices")
    .select("*", { count: "exact", head: true })
    .eq("ticker", ticker);
  expect(postCount).toBe(0);

  // Cleanup: delete the transaction through the UI (required first —
  // portfolio_id is ON DELETE RESTRICT), then the portfolio.
  await row.click();
  const lotsDialog = page.getByRole("dialog", { name: `${ticker} — Lots` });
  await lotsDialog.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog", { name: "Delete transaction" }).getByRole("button", { name: "Delete" }).click();
  await expect(lotsDialog).not.toBeVisible();

  // The dialog closing reflects the browser-side fetch resolving, but the
  // portfolio-delete endpoint's own transaction count check can observe the
  // DB fractionally later. Poll the real precondition (no transactions left)
  // instead of assuming UI state and DB state are synchronized.
  await expect
    .poll(async () => {
      const { count } = await admin
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .eq("portfolio_id", portfolio.id);
      return count;
    })
    .toBe(0);

  // page.request runs from Node, not the browser, so it sends no Origin
  // header by default — Astro's cross-site check rejects state-changing
  // requests without one, so it must be set explicitly here.
  const deleteResponse = await page.request.delete(`/api/portfolios/${portfolio.id}`, {
    headers: { origin: "http://localhost:4610" },
  });
  expect(deleteResponse.status(), await deleteResponse.text()).toBe(200);
  await page.reload();
  await expect(page.getByRole("button", { name: portfolioName })).not.toBeVisible();

  // Defensive cleanup: no row should exist per the assertion above, but
  // delete unconditionally so a future assertion failure can't leak state
  // into other test runs.
  await admin.from("prices").delete().eq("ticker", ticker);
});
