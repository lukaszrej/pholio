import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Named after test-plan.md Risk #5 ("Finnhub outage: dashboard crashes or
// shows zero/stale price without the required fallback indicator"). Modeled
// on tests/e2e/seed.spec.ts's getByRole / unique-data / full lifecycle
// pattern.
//
// Real vs mocked: no network mocking. dashboard.astro calls Finnhub
// server-side (src/lib/finnhub.ts via src/lib/prices.ts), so browser-level
// page.route() can't intercept it. Instead this test exploits a real, stable
// Finnhub behavior: an unrecognized ticker symbol reliably returns `{c: 0}`,
// which fetchQuote() already treats as "no data" and returns null — the same
// code path a genuine outage takes. Seeding a stale cache row for that ticker
// forces refreshPricesForTickers() down its "quote fetch failed, fall back to
// cached price" branch deterministically, with no flakiness from mocking a
// server-side call.
test("stale cached price is shown with fallback styling when Finnhub has no data for the ticker", async ({ page }) => {
  const ticker = `ZZNOTAREALTICKER${Date.now()}`;
  const portfolioName = `E2E Fallback Portfolio ${Date.now()}`;
  // Oracle computed by hand: formatNum(42.5) -> "42.50" -> Polish format -> "42,50"
  const expectedDisplayPrice = "42,50";

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.test).");
  }
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Setup: a stale cache row (fetched_at well in the past) so
  // refreshPricesForTickers attempts a live re-fetch this run, hits the real
  // Finnhub "no data" response for this made-up ticker, and must fall back to
  // this cached price instead of crashing or showing a wrong/zero price.
  const { error: seedErr } = await admin
    .from("prices")
    .insert({ ticker, price: 42.5, fetched_at: "2020-01-01T00:00:00.000Z" });
  expect(seedErr).toBeNull();

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
  // newly-added ticker and its seeded stale cache row.
  await page.reload();
  await page.waitForLoadState("networkidle");

  // activeTab is plain client React state (DashboardView.tsx), not persisted
  // across a reload — it always comes back up as "all", which renders the
  // card-grid summary view, not the row/cell table. Switch back to this
  // portfolio's own tab to reach the table that has the fallback styling.
  await page.getByRole("button", { name: portfolioName }).click();

  // Assertion: the dashboard did not crash, and the holdings row shows the
  // cached price (not $0, not blank) with the stale-price fallback styling —
  // the only signal this app has for "Finnhub had no data this render."
  const row = page.getByRole("row", { name: new RegExp(ticker) });
  await expect(row).toBeVisible();
  const priceCell = row.getByRole("cell").nth(2); // "Last" (current price) column
  await expect(priceCell).toHaveText(expectedDisplayPrice);
  await expect(priceCell).toHaveCSS("color", "rgb(168, 158, 144)"); // #A89E90 stale-price indicator

  // Cleanup: delete the transaction through the UI (required first —
  // portfolio_id is ON DELETE RESTRICT), then the portfolio, then the seeded
  // price row.
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

  const deleteResponse = await page.request.delete(`/api/portfolios/${portfolio.id}`, {
    headers: { origin: "http://localhost:4610" },
  });
  expect(deleteResponse.status(), await deleteResponse.text()).toBe(200);
  await page.reload();
  await expect(page.getByRole("button", { name: portfolioName })).not.toBeVisible();

  await admin.from("prices").delete().eq("ticker", ticker);
});
