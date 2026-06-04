import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const GET: APIRoute = async (context) => {
  const errorParam = context.url.searchParams.get("error");
  const desc = context.url.searchParams.get("error_description");
  if (errorParam) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(desc ?? errorParam)}`);
  }

  const code = context.url.searchParams.get("code");
  if (code) {
    const supabase = createClient(context.request.headers, context.cookies);
    if (!supabase) {
      return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
    }
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return context.redirect(`/auth/signin?error=${encodeURIComponent(error.message)}`);
    }
  }
  return context.redirect("/dashboard");
};
