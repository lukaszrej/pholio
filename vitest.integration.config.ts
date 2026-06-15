import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

// Load .env.test explicitly — Vite's automatic env injection does not populate process.env
// for non-VITE_-prefixed vars in the Node test runner; we inject them via the `env` option.
const env = loadEnv("test", process.cwd(), "");

export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    globals: true,
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["src/test/integration/setup.ts"],
    env,
  },
  resolve: {
    alias: {
      "@": path.resolve("./src"),
      "astro:env/server": path.resolve("./src/test/stubs/astro-env-server.ts"),
      "astro:middleware": path.resolve("./src/test/stubs/astro-middleware.ts"),
    },
  },
});
