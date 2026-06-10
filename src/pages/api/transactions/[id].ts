import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { transactionSchema } from "@/lib/transaction-schema";
import type { Transaction } from "@/types/transaction";

const JSON_HEADERS = { "Content-Type": "application/json" };

export const PUT: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const id = context.params.id;

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

  const { data: updatedRow, error: dbError } = (await supabase
    .from("transactions")
    .update(result.data)
    .eq("id", id)
    .select()
    .single()) as { data: Transaction | null; error: { message: string; code?: string } | null };

  if (dbError) {
    if (dbError.code === "PGRST116") {
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

  if (updatedRow === null) {
    return new Response(JSON.stringify({ error: "Transaction not found" }), {
      status: 404,
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

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const { data, error: dbError } = (await supabase
    .from("transactions")
    .delete()
    .eq("id", id)
    .select("id")
    .single()) as { data: { id: string } | null; error: { message: string; code?: string } | null };

  if (dbError) {
    if (dbError.code === "PGRST116") {
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

  if (data === null) {
    return new Response(JSON.stringify({ error: "Transaction not found" }), {
      status: 404,
      headers: JSON_HEADERS,
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: JSON_HEADERS,
  });
};
