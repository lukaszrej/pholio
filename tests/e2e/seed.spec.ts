import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Seed test — the model every generated E2E test in this project is built
// from. See CLAUDE.md's E2E hard rules and .claude/skills/10x-e2e for the
// conventions this demonstrates:
//   - getByRole as the default locator (never CSS/XPath/DOM structure)
//   - waiting for state (toBeVisible / not.toBeVisible), never page.waitForTimeout()
//   - a unique identifier (timestamp) in test data so parallel/re-runs don't collide
//   - full setup -> action -> assertion -> cleanup in one independent test
//
// Named after test-plan.md Risk #1 ("Position aggregation returns wrong
// weighted-average cost ... user sees incorrect profit/loss"). This test
// covers the weighted-average-cost half of that risk, which is derivable
// purely from transaction data; the ROI half also depends on the live
// Finnhub price and belongs in a mocked-network E2E test, not this exemplar.
//
// Two lots at different prices/share counts, not one: with a single lot,
// weighted-average cost and simple average are the same number, so a bug
// that averages per-lot prices without weighting by shares would slip
// through undetected. Two lots make the two formulas diverge (120 vs 115
// below), so the assertion actually exercises the "weighted" part.
test("multiple stock purchases show correct weighted-average cost and cost basis on the dashboard", async ({
  page,
}) => {
  const portfolioName = `E2E Seed Portfolio ${Date.now()}`;
  const ticker = `TKR${Date.now()}`;
  const lots = [
    { date: "2024-01-15", price: 100, shares: 5 },
    { date: "2024-02-20", price: 130, shares: 10 },
  ];
  // Oracle computed by hand, not by reading the app's own output:
  // weighted-avg cost = (5*100 + 10*130) / 15 = 1800 / 15 = 120
  // (a simple, unweighted average of the two prices would wrongly give 115)
  const expectedAvgCost = "120,00";
  const expectedCostBasis = "1.800,00"; // total shares (15) * weighted-avg cost (120)

  await page.goto("/dashboard");
  // DashboardView is a client:load React island — wait for its bundle to
  // finish loading and hydrating before the first interaction, or an early
  // click lands on inert server-rendered markup.
  await page.waitForLoadState("networkidle");

  // Setup: an isolated portfolio for this run only. Capture its id from the
  // create response — needed for cleanup, since (see below) the UI gives no
  // way to delete a portfolio once it has zero positions.
  await page.getByRole("button", { name: "+ Add portfolio" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill(portfolioName);
  const createResponse = page.waitForResponse(
    (r) => r.url().includes("/api/portfolios") && r.request().method() === "POST",
  );
  await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  const { data: portfolio } = (await (await createResponse).json()) as { data: { id: string } };
  await expect(page.getByRole("button", { name: portfolioName })).toBeVisible();

  // Action: record two purchases of the same ticker at different prices/share counts.
  const addDialog = page.getByRole("dialog");
  for (const lot of lots) {
    await page.getByRole("button", { name: "Add transaction" }).click();
    await addDialog.getByLabel("Ticker").fill(ticker);
    await addDialog.getByLabel("Purchase date").fill(lot.date);
    await addDialog.getByLabel("Purchase price").fill(String(lot.price));
    await addDialog.getByLabel("Shares").fill(String(lot.shares));
    await addDialog.getByRole("button", { name: "Add transaction" }).click();
    await expect(addDialog).not.toBeVisible();
  }

  // Assertion: the holdings row shows the hand-calculated avg cost and cost basis.
  const row = page.getByRole("row", { name: new RegExp(ticker) });
  await expect(row).toBeVisible();
  const cells = row.getByRole("cell");
  await expect(cells.nth(3)).toHaveText(expectedAvgCost); // "Avg" column
  await expect(cells.nth(4)).toHaveText(expectedCostBasis); // "Cost basis" column

  // Cleanup: delete both transactions through the UI (required first —
  // portfolio_id is ON DELETE RESTRICT). The lots dialog only auto-closes
  // once its last lot is gone, so delete each lot (identified by its unique
  // purchase date) in turn before expecting it to disappear.
  await row.click();
  const lotsDialog = page.getByRole("dialog", { name: `${ticker} — Lots` });
  for (const lot of lots) {
    const lotRow = lotsDialog.getByRole("row", { name: new RegExp(lot.date) });
    await lotRow.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("alertdialog", { name: "Delete transaction" }).getByRole("button", { name: "Delete" }).click();
    await expect(lotRow).not.toBeVisible();
  }
  await expect(lotsDialog).not.toBeVisible();

  // The dialog closing reflects the browser-side fetch resolving, but the
  // portfolio-delete endpoint's own transaction count check can observe the
  // DB fractionally later. Poll the real precondition (no transactions left)
  // instead of assuming UI state and DB state are synchronized.
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.test).");
  }
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
});
