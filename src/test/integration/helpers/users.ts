import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface TestUser {
  client: SupabaseClient;
  userId: string;
  portfolioId: string;
  transactionId: string;
  // Hand-known seed values for IDOR oracle comparison (snake_case = DB column names)
  transactionSeed: {
    ticker: string;
    purchase_price: number;
    purchase_date: string;
    currency: string;
    shares: number;
  };
}

export interface Fixture {
  userA: TestUser;
  userB: TestUser;
  teardown: () => Promise<void>;
}

const TEST_PASSWORD = "TestPass123!";

export async function buildFixture(): Promise<Fixture> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY must be set in .env.test");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.test from: npx supabase status");
  }

  // Admin client — fixture setup/teardown only; never used in assertions
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const userAEmail = `integration-user-a-${tag}@test.invalid`;
  const userBEmail = `integration-user-b-${tag}@test.invalid`;

  // Create confirmed users so no email-confirmation round-trip is needed.
  // Supabase admin.createUser returns a discriminated union: when error is null, user is non-null.
  const { data: createA, error: errA } = await admin.auth.admin.createUser({
    email: userAEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (errA) throw new Error(`Failed to create User A: ${errA.message}`);

  const { data: createB, error: errB } = await admin.auth.admin.createUser({
    email: userBEmail,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (errB) throw new Error(`Failed to create User B: ${errB.message}`);

  const userAId = createA.user.id;
  const userBId = createB.user.id;

  // Sign in with each user's anon-key client — all assertions use these clients so RLS applies
  const clientA = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErrA } = await clientA.auth.signInWithPassword({
    email: userAEmail,
    password: TEST_PASSWORD,
  });
  if (signInErrA) throw new Error(`Sign-in User A failed: ${signInErrA.message}`);

  const clientB = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErrB } = await clientB.auth.signInWithPassword({
    email: userBEmail,
    password: TEST_PASSWORD,
  });
  if (signInErrB) throw new Error(`Sign-in User B failed: ${signInErrB.message}`);

  // Seed one portfolio per user using their authenticated clients (RLS enforces ownership)
  const { data: portfolioA, error: pErrA } = await clientA
    .from("portfolios")
    .insert({ name: "Portfolio A", user_id: userAId })
    .select("id")
    .single();
  if (pErrA) throw new Error(`Seed portfolio A failed: ${pErrA.message}`);

  const { data: portfolioB, error: pErrB } = await clientB
    .from("portfolios")
    .insert({ name: "Portfolio B", user_id: userBId })
    .select("id")
    .single();
  if (pErrB) throw new Error(`Seed portfolio B failed: ${pErrB.message}`);

  // Seed one transaction per user — hand-known values are the #4 IDOR oracle.
  // portfolio_id is required (NOT NULL FK added in migration 20260613000001).
  const txSeedA = {
    ticker: "AAPL",
    purchase_price: 100.5,
    purchase_date: "2026-01-01",
    currency: "USD",
    shares: 10.0,
    user_id: userAId,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    portfolio_id: portfolioA.id,
  };
  const txSeedB = {
    ticker: "MSFT",
    purchase_price: 200.75,
    purchase_date: "2026-01-02",
    currency: "USD",
    shares: 5.0,
    user_id: userBId,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    portfolio_id: portfolioB.id,
  };

  const { data: txA, error: txErrA } = await clientA.from("transactions").insert(txSeedA).select("id").single();
  if (txErrA) throw new Error(`Seed transaction A failed: ${txErrA.message}`);

  const { data: txB, error: txErrB } = await clientB.from("transactions").insert(txSeedB).select("id").single();
  if (txErrB) throw new Error(`Seed transaction B failed: ${txErrB.message}`);

  async function teardown(): Promise<void> {
    // Deleting a user cascades to their portfolios and transactions (ON DELETE CASCADE)
    await Promise.allSettled([admin.auth.admin.deleteUser(userAId), admin.auth.admin.deleteUser(userBId)]);
  }

  return {
    userA: {
      client: clientA,
      userId: userAId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      portfolioId: portfolioA.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      transactionId: txA.id,
      transactionSeed: {
        ticker: txSeedA.ticker,
        purchase_price: txSeedA.purchase_price,
        purchase_date: txSeedA.purchase_date,
        currency: txSeedA.currency,
        shares: txSeedA.shares,
      },
    },
    userB: {
      client: clientB,
      userId: userBId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      portfolioId: portfolioB.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      transactionId: txB.id,
      transactionSeed: {
        ticker: txSeedB.ticker,
        purchase_price: txSeedB.purchase_price,
        purchase_date: txSeedB.purchase_date,
        currency: txSeedB.currency,
        shares: txSeedB.shares,
      },
    },
    teardown,
  };
}
