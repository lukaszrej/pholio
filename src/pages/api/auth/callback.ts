import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");
  if (code) {
    const supabase = createClient(context.request.headers, context.cookies);
    if (supabase) {
      await supabase.auth.exchangeCodeForSession(code);
    }
  }
  return context.redirect("/dashboard");
};
