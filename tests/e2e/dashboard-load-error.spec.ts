import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";

// A failed Supabase query for transactions or portfolios used to be logged
// and silently discarded, rendering a false "empty portfolio" 200 success
// page (see src/pages/dashboard.astro). It now sets a 500 status and shows
// a visible error banner instead.
//
// Real vs mocked: dashboard.astro's Supabase queries run server-side, so
// browser-level page.route() can't intercept them, and Supabase is an
// internal boundary this suite keeps real rather than mocked. This test
// forces a genuine PostgREST permission-denied error by revoking the
// "authenticated" role's SELECT grant on public.transactions for the
// instant of the request, restoring it immediately in a finally block.
// Trade-off: Postgres grants are role-level, not per-user, so the revoke
// briefly affects every authenticated query against this table, including
// any other spec running concurrently in another worker. The window is a
// single request/response round trip to keep that risk small.
function setTransactionsSelectGrant(action: "REVOKE" | "GRANT"): void {
  const stmt =
    action === "REVOKE"
      ? "REVOKE SELECT ON TABLE public.transactions FROM authenticated;"
      : "GRANT SELECT ON TABLE public.transactions TO authenticated;";
  execSync(`docker exec supabase_db_pholio psql -U postgres -d postgres -c "${stmt}"`, { stdio: "pipe" });
}

test("a failed Supabase query surfaces a 500 and an error banner instead of a false empty dashboard", async ({
  page,
}) => {
  setTransactionsSelectGrant("REVOKE");
  try {
    const response = await page.goto("/dashboard");
    expect(response?.status()).toBe(500);

    const banner = page.getByRole("alert").filter({ hasText: "couldn't load your dashboard data" });
    await expect(banner).toBeVisible();
  } finally {
    setTransactionsSelectGrant("GRANT");
  }
});
