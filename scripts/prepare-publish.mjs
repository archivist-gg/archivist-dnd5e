import { execSync } from "child_process";
import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (c) => execSync(c, { cwd: root, stdio: "inherit" });
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

// 1. clean
rmSync(path.join(root, "dist"), { recursive: true, force: true });
rmSync(path.join(root, ".pack"), { recursive: true, force: true });
// 2. generate (dnd5e only — no-op if script absent)
if (pkg.scripts?.generate) run("npm run generate");
// 3. esbuild .js
run("node scripts/esbuild-dist.mjs");
// 4. declaration emit (non-incremental)
run("npx tsc -p tsconfig.dts.json");
// 5. fix .d.ts extensions
run("node scripts/fix-dts-extensions.mjs");
// 6. assemble .pack/
const pack = path.join(root, ".pack");
mkdirSync(pack, { recursive: true });
cpSync(path.join(root, "dist"), path.join(pack, "dist"), { recursive: true });
for (const f of ["LICENSE", "README.md"]) cpSync(path.join(root, f), path.join(pack, f));
// dnd5e attribution (present only in dnd5e)
for (const f of ["LICENSES/SRD.md", "src/data-srd/ATTRIBUTION.md"]) {
  if (existsSync(path.join(root, f))) { mkdirSync(path.join(pack, path.dirname(f)), { recursive: true }); cpSync(path.join(root, f), path.join(pack, f)); }
}
// generated publish manifest
const deps = { ...pkg.dependencies };
if (deps["@archivist/core"]?.startsWith("file:")) {
  const coreVer = JSON.parse(readFileSync(path.resolve(root, "../archivist-core/package.json"), "utf8")).version;
  deps["@archivist/core"] = `^${coreVer}`;
}
const files = ["dist", "LICENSE", "README.md"];
if (existsSync(path.join(root, "LICENSES/SRD.md"))) files.push("LICENSES/SRD.md", "src/data-srd/ATTRIBUTION.md");
const manifest = {
  name: pkg.name, version: pkg.version, license: pkg.license, type: "module",
  publishConfig: { access: "public" },
  types: "./dist/index.d.ts",
  exports: {
    ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
    "./*": { types: "./dist/*.d.ts", default: "./dist/*.js" },
  },
  dependencies: deps, files,
};
writeFileSync(path.join(pack, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("prepared", pack);
