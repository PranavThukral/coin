import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Keep the cache inside the project: worktrees share node_modules via a junction.
  cacheDir: ".vitest-cache",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Tests run outside the React Server runtime, where "server-only" throws.
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts", "eval/**/*.test.ts"],
    testTimeout: 20000,
  },
});
