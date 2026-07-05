import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    // Per Task 0: native self-reference is PRIMARY across tsc/esbuild/vitest.
    // `@archivist/dnd5e/*` resolves via this package's own `exports` map, and
    // `@archivist/core` via the `file:../archivist-core` dep symlink. These
    // regex aliases are the documented fallback — keep them COMMENTED unless a
    // self/core import fails to resolve under vitest.
    // alias: [
    //   { find: /^@archivist\/dnd5e$/, replacement: path.resolve(__dirname, "src/index.ts") },
    //   { find: /^@archivist\/dnd5e\/(.*)$/, replacement: path.resolve(__dirname, "src/$1") },
    //   { find: /^@archivist\/core$/, replacement: path.resolve(__dirname, "../archivist-core/src/index.ts") },
    //   { find: /^@archivist\/core\/(.*)$/, replacement: path.resolve(__dirname, "../archivist-core/src/$1") },
    // ],
  },
  assetsInclude: ["**/*.md"],
});
