import type { NextConfig } from "next";

// Agent worktrees share the main checkout's node_modules through a junction,
// which sits outside the worktree. Setting COIN_TURBOPACK_ROOT to a folder that
// contains both lets Turbopack resolve it. Unset in normal use and on Vercel.
const turbopackRoot = process.env.COIN_TURBOPACK_ROOT;

const nextConfig: NextConfig = {
  cacheComponents: true,
  // PGlite ships WASM and data files; load it from node_modules, not the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  partialPrefetching: true,
  turbopack: {
    ...(turbopackRoot ? { root: turbopackRoot } : {}),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
