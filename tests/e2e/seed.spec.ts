import { test, expect } from "@playwright/test";

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
test("new stock purchase shows correct weighted-average cost and cost basis on the dashboard", async ({ page }) => {
  const portfolioName = `E2E Seed Portfolio ${Date.now()}`;
  const ticker = `TKR${Date.now()}`;
  const shares = 5;
  const price = 100;
  // Oracle computed by hand, not by reading the app's own output:
  // weighted-avg cost of a single purchase == that purchase's price.
  const expectedAvgCost = "100,00";
  const expectedCostBasis = "500,00"; // shares * price

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

  // Action: record a single stock purchase.
  await page.getByRole("button", { name: "Add transaction" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByLabel("Ticker").fill(ticker);
  await addDialog.getByLabel("Purchase date").fill("2024-01-15");
  await addDialog.getByLabel("Purchase price").fill(String(price));
  await addDialog.getByLabel("Shares").fill(String(shares));
  await addDialog.getByRole("button", { name: "Add transaction" }).click();
  await expect(addDialog).not.toBeVisible();

  // Assertion: the holdings row shows the hand-calculated avg cost and cost basis.
  const row = page.getByRole("row", { name: new RegExp(ticker) });
  await expect(row).toBeVisible();
  const cells = row.getByRole("cell");
  await expect(cells.nth(3)).toHaveText(expectedAvgCost); // "Avg" column
  await expect(cells.nth(4)).toHaveText(expectedCostBasis); // "Cost basis" column

  // Cleanup: delete the transaction through the UI (required first —
  // portfolio_id is ON DELETE RESTRICT). Once its last position is gone the
  // portfolio view drops to an empty state with no delete control, so the
  // portfolio itself is removed via the same API the UI would call.
  await row.click();
  const lotsDialog = page.getByRole("dialog", { name: `${ticker} — Lots` });
  await lotsDialog.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog", { name: "Delete transaction" }).getByRole("button", { name: "Delete" }).click();
  await expect(lotsDialog).not.toBeVisible();

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
