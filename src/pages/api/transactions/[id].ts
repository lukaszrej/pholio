import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { transactionSchema } from "@/lib/transaction-schema";
import type { Transaction } from "@/types/transaction";

const JSON_HEADERS = { "Content-Type": "application/json" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PUT: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const id = context.params.id;
  if (!id || !UUID_RE.test(id)) {
    return new Response(JSON.stringify({ error: "Invalid transaction ID" }), {
      status: 400,
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

  // RLS (auth.uid() = user_id) scopes this update to the authenticated user's rows.
  const { data: updatedRow, error: dbError } = (await supabase
    .from("transactions")
    .update(result.data)
    .eq("id", id)
    .select()
    .single()) as { data: Transaction | null; error: { message: string; code?: string } | null };

  if (dbError) {
    if (dbError.code === "PGRST116") {
      // .single() raises PGRST116 (not null) when no row matches — this is the not-found path
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }
    // eslint-disable-next-line no-console
    console.error("[api/transactions/[id]] PUT DB error", dbError.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  return new Response(JSON.stringify({ data: updatedRow }), {
    status: 200,
    headers: JSON_HEADERS,
  });
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const id = context.params.id;
  if (!id || !UUID_RE.test(id)) {
    return new Response(JSON.stringify({ error: "Invalid transaction ID" }), {
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

  // RLS (auth.uid() = user_id) scopes this delete to the authenticated user's rows.
  const { error: dbError } = (await supabase.from("transactions").delete().eq("id", id).select("id").single()) as {
    data: { id: string } | null;
    error: { message: string; code?: string } | null;
  };

  if (dbError) {
    if (dbError.code === "PGRST116") {
      // .single() raises PGRST116 (not null) when no row matches — this is the not-found path
      return new Response(JSON.stringify({ error: "Transaction not found" }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }
    // eslint-disable-next-line no-console
    console.error("[api/transactions/[id]] DELETE DB error", dbError.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: JSON_HEADERS,
  });
};
