import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { portfolioSchema } from "@/lib/portfolio-schema";
import type { Portfolio } from "@/types/portfolio";

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
    return new Response(JSON.stringify({ error: "Invalid portfolio ID" }), {
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

  const result = portfolioSchema.safeParse(body);
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

  // RLS (auth.uid() = user_id) scopes this update to the authenticated user's portfolios.
  const { data: updatedRow, error: dbError } = (await supabase
    .from("portfolios")
    .update({ name: result.data.name })
    .eq("id", id)
    .select()
    .single()) as { data: Portfolio | null; error: { message: string; code?: string } | null };

  if (dbError) {
    if (dbError.code === "PGRST116") {
      return new Response(JSON.stringify({ error: "Portfolio not found" }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }
    // eslint-disable-next-line no-console
    console.error("[api/portfolios/[id]] PUT DB error", dbError.message);
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
    return new Response(JSON.stringify({ error: "Invalid portfolio ID" }), {
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

  const { count, error: countError } = await supabase
    .from("transactions")
    .select("*", { count: "exact", head: true })
    .eq("portfolio_id", id);

  if (countError) {
    // eslint-disable-next-line no-console
    console.error("[api/portfolios/[id]] DELETE count error", countError.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  if ((count ?? 0) > 0) {
    return new Response(JSON.stringify({ error: "This portfolio has transactions. Reassign or delete them first." }), {
      status: 409,
      headers: JSON_HEADERS,
    });
  }

  // RLS (auth.uid() = user_id) scopes this delete to the authenticated user's portfolios.
  const { error: dbError } = (await supabase.from("portfolios").delete().eq("id", id).select("id").single()) as {
    data: { id: string } | null;
    error: { message: string; code?: string } | null;
  };

  if (dbError) {
    if (dbError.code === "PGRST116") {
      return new Response(JSON.stringify({ error: "Portfolio not found" }), {
        status: 404,
        headers: JSON_HEADERS,
      });
    }
    if (dbError.code === "23503") {
      return new Response(
        JSON.stringify({ error: "This portfolio has transactions. Reassign or delete them first." }),
        {
          status: 409,
          headers: JSON_HEADERS,
        },
      );
    }
    // eslint-disable-next-line no-console
    console.error("[api/portfolios/[id]] DELETE DB error", dbError.message);
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
