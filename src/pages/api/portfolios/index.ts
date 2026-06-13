import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { portfolioSchema } from "@/lib/portfolio-schema";
import type { Portfolio } from "@/types/portfolio";

const JSON_HEADERS = { "Content-Type": "application/json" };

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
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

  const { data, error: dbError } = (await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: true })) as { data: Portfolio[] | null; error: { message: string } | null };

  if (dbError) {
    // eslint-disable-next-line no-console
    console.error("[api/portfolios] GET DB error", dbError.message);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  return new Response(JSON.stringify({ data: data ?? [] }), {
    status: 200,
    headers: JSON_HEADERS,
  });
};

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

  const { data: insertedRow, error: dbError } = (await supabase
    .from("portfolios")
    .insert([{ user_id: context.locals.user.id, name: result.data.name }])
    .select()
    .single()) as { data: Portfolio | null; error: { message: string; code?: string } | null };

  if (dbError) {
    const isConstraintViolation = dbError.code?.startsWith("23");
    const status = isConstraintViolation ? 400 : 500;
    if (!isConstraintViolation) {
      // eslint-disable-next-line no-console
      console.error("[api/portfolios] POST DB error", dbError.message);
    }
    return new Response(
      JSON.stringify({ error: isConstraintViolation ? "Invalid request" : "Internal server error" }),
      {
        status,
        headers: JSON_HEADERS,
      },
    );
  }

  return new Response(JSON.stringify({ data: insertedRow }), {
    status: 201,
    headers: JSON_HEADERS,
  });
};
