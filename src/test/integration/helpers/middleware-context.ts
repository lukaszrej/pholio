import { vi } from "vitest";

// Minimal Astro middleware context shape — only fields read by src/middleware.ts are provided.
export interface SyntheticContext {
  request: Request;
  cookies: { set: ReturnType<typeof vi.fn> };
  url: URL;
  locals: Record<string, unknown>;
  redirect: (path: string) => Response;
}

// Build a synthetic middleware context and a fresh next spy for each test case.
export function makeContext(
  method: string,
  pathname: string,
  cookieHeader?: string,
): { context: SyntheticContext; next: ReturnType<typeof vi.fn> } {
  const headers = new Headers();
  if (cookieHeader) {
    headers.set("Cookie", cookieHeader);
  }

  return {
    context: {
      request: new Request(`http://localhost${pathname}`, { method, headers }),
      cookies: { set: vi.fn() },
      url: new URL(`http://localhost${pathname}`),
      locals: {},
      redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
    },
    next: vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
  };
}
