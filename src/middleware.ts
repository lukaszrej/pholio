import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];
const PROTECTED_API_ROUTES = ["/api/"];
const PUBLIC_API_ROUTES = ["/api/auth/"];
const AUTH_PAGES = ["/auth/signin", "/auth/signup"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      context.locals.user = user ?? null;
    } catch {
      context.locals.user = null;
    }
  } else {
    context.locals.user = null;
  }

  const isPublicApi = PUBLIC_API_ROUTES.some((route) => context.url.pathname.startsWith(route));
  if (!isPublicApi && PROTECTED_API_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  if (AUTH_PAGES.some((route) => context.url.pathname.startsWith(route))) {
    if (context.locals.user) {
      return context.redirect("/dashboard");
    }
  }

  // "/" renders the landing page for visitors; authenticated users redirect to /dashboard.
  if (context.url.pathname === "/") {
    if (context.locals.user) {
      return context.redirect("/dashboard");
    }
  }

  return next();
});
