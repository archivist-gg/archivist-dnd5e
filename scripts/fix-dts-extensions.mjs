// Rewrites extensionless RELATIVE specifiers in emitted .d.ts to node16-resolvable form.
// Handles: import/export ... from "./x"; export * from "./x"; inline import("./x").
// Filesystem-aware: file -> "./x.js"; directory -> "./x/index.js". Leaves bare (@archivist-gg/*, zod) untouched.
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith(".d.ts") ? [p] : [];
  });
}
function resolveSpec(fileDir, spec) {
  if (!spec.startsWith(".")) return spec;               // bare specifier -> leave
  if (/\.(js|json)$/.test(spec)) return spec;           // already extensioned
  const abs = path.resolve(fileDir, spec);
  if (existsSync(abs + ".js")) return spec + ".js";     // sibling file
  if (existsSync(abs) && statSync(abs).isDirectory()) return spec.replace(/\/?$/, "/index.js");
  if (existsSync(abs + ".d.ts")) return spec + ".js";   // decl-only sibling (js co-emitted)
  return spec + ".js";                                  // default: assume file
}
const SPEC_RE = /(from\s*|import\s*\(\s*)(["'])(\.[^"']*)\2/g;
for (const file of walk(distDir)) {
  const dir = path.dirname(file);
  const out = readFileSync(file, "utf8").replace(SPEC_RE, (m, kw, q, spec) => `${kw}${q}${resolveSpec(dir, spec)}${q}`);
  writeFileSync(file, out);
}
