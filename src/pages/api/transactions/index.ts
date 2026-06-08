import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { transactionSchema } from "@/lib/transaction-schema";
import type { Transaction } from "@/types/transaction";

const JSON_HEADERS = { "Content-Type": "application/json" };

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const result = transactionSchema.safeParse(body);
  if (!result.success) {
    return new Response(JSON.stringify({ error: result.error.issues[0].message }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const { data: insertedRow, error: dbError } = (await supabase
    .from("transactions")
    .insert([{ user_id: context.locals.user.id, ...result.data }])
    .select()
    .single()) as { data: Transaction | null; error: { message: string; code?: string } | null };

  if (dbError) {
    const status = dbError.code?.startsWith("23") ? 400 : 500;
    return new Response(JSON.stringify({ error: dbError.message }), {
      status,
      headers: JSON_HEADERS,
    });
  }

  return new Response(JSON.stringify({ data: insertedRow }), {
    status: 201,
    headers: JSON_HEADERS,
  });
};
