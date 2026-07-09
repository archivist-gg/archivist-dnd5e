import esbuild from "esbuild";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

// Derive entrypoints from the committed exports map (barrel + any subpaths).
const entryPoints = Object.values(pkg.exports === undefined ? {} : pkg.exports)
  .map((v) => (typeof v === "string" ? v : v.default))
  .map((rel) => path.join(root, rel));

await esbuild.build({
  entryPoints,
  outdir: path.join(root, "dist"),
  outbase: path.join(root, "src"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2018",
  splitting: entryPoints.length > 1,
  external: ["@archivist-gg/core", "zod", "js-yaml"], // core: only js-yaml present; harmless supersets
  loader: { ".md": "text" },
  logLevel: "info",
});
