import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Keep the cache inside the project: worktrees share node_modules via a junction.
  cacheDir: ".vitest-cache",
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { include: ["src/**/*.test.ts", "scripts/**/*.test.ts"], testTimeout: 20000 },
});
