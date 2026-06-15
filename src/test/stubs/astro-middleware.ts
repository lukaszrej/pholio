// Stub for astro:middleware virtual module — used by Vitest only.
// defineMiddleware is a pure type helper; return the handler unchanged at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defineMiddleware = <H extends (...args: any[]) => any>(handler: H): H => handler;
