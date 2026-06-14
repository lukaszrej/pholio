import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    exclude: ["node_modules", "**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve("./src"),
      "astro:env/server": path.resolve("./src/test/stubs/astro-env-server.ts"),
    },
  },
});
