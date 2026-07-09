// Scratch-consumer publish smoke — the load-bearing proof that the prepared
// @archivist/{core,dnd5e} `.pack/` dirs work as REAL npm packages:
//   prepare-publish both -> `npm pack ./.pack` both INTO a temp dir -> install into
//   a throwaway consumer with NO sibling checkouts -> packaging asserts -> dual
//   type-resolution (skipLibCheck:false, bundler + node16) -> runtime -> self-clean.
//
// Requires NETWORK (transitive zod/js-yaml install from the registry). The dnd5e
// tarball's `@archivist/core: ^0.1.0` is satisfied by the LOCAL core tgz v0.1.0
// (both tarballs installed together — no registry trap). Leaves NO artifact in any
// repo tree (temp dir self-cleaned in `finally`; `.pack/`/`dist/` are gitignored).
import { execSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, cpSync } from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

// Derive both repo roots from this module's own location — this file lives at
// <dnd5e>/tools/publish-smoke/run-smoke.mjs, and archivist-core is a sibling of
// archivist-dnd5e. Keeps the harness portable (any clone / CI) and leaks no
// author home-path into the public tree.
const DND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CORE = path.resolve(DND, "..", "archivist-core");
const sh = (c, cwd) => execSync(c, { cwd, stdio: "inherit" });
// Use the dnd5e repo's already-installed binaries so the temp consumer needs no
// tsc/tsx of its own.
const TSC = path.join(DND, "node_modules/.bin/tsc");
const TSX = path.join(DND, "node_modules/.bin/tsx");
// `npm pack --json` emits an array of { filename, ... }; grab the packed filename.
const pick = (out) => JSON.parse(out.toString())[0].filename;

const tmp = mkdtempSync(path.join(os.tmpdir(), "pubsmoke-"));
try {
  // 1. Prepare both packages (each emits a gitignored .pack/).
  sh("npm run prepare-publish", CORE);
  sh("npm run prepare-publish", DND);

  // 2. Pack INTO tmp (never the repo roots — keeps the trees clean for the T4 gate).
  const coreTgz = pick(execSync(`npm pack ./.pack --json --pack-destination "${tmp}"`, { cwd: CORE }));
  const dndTgz = pick(execSync(`npm pack ./.pack --json --pack-destination "${tmp}"`, { cwd: DND }));

  // 3. Throwaway consumer with NO sibling checkouts; install BOTH tarballs together
  //    so core@0.1.0 (local tgz) satisfies dnd5e's `@archivist/core: ^0.1.0`.
  writeFileSync(
    path.join(tmp, "package.json"),
    JSON.stringify({ name: "smoke", private: true, type: "module" }),
  );
  sh(`npm install "${path.join(tmp, coreTgz)}" "${path.join(tmp, dndTgz)}"`, tmp);
  cpSync(path.join(DND, "tools/publish-smoke/smoke-consumer.ts"), path.join(tmp, "smoke-consumer.ts"));

  // 4. Packaging assertions — read the INSTALLED (i.e. packed) dnd5e manifest.
  const m = JSON.parse(
    readFileSync(path.join(tmp, "node_modules/@archivist/dnd5e/package.json"), "utf8"),
  );
  if (m.exports["./*"].default !== "./dist/*.js")
    throw new Error(`exports not dist-mapped: ${JSON.stringify(m.exports["./*"])}`);
  if (m.dependencies["@archivist/core"] !== "^0.1.0")
    throw new Error(`core dep not registry range: ${m.dependencies["@archivist/core"]}`);
  sh("test -f node_modules/@archivist/dnd5e/LICENSES/SRD.md", tmp); // SRD attribution shipped
  console.log("packaging asserts OK (exports=dist/*.js, core dep=^0.1.0, SRD.md shipped)");

  // 5. Dual type-resolution, skipLibCheck:false. The node16 case is the load-bearing
  //    .d.ts gate (extensionless-specifier resolution — spec §5c codemod).
  for (const mr of ["bundler", "node16"]) {
    writeFileSync(
      path.join(tmp, `tsconfig.${mr}.json`),
      JSON.stringify({
        compilerOptions: {
          // es2022 lib supplies Set/Map/Object.entries used by the packages'
          // (and zod's) shipped .d.ts; the load-bearing gate is the node16
          // extensionless-specifier resolution below, not the lib.
          target: "es2022",
          module: mr === "node16" ? "node16" : "esnext",
          moduleResolution: mr,
          skipLibCheck: false,
          noEmit: true,
          strict: true,
          types: [],
        },
        files: ["smoke-consumer.ts"],
      }),
    );
    sh(`"${TSC}" -p tsconfig.${mr}.json`, tmp);
    console.log(`type-resolution OK (moduleResolution=${mr}, skipLibCheck:false)`);
  }

  // 6. Runtime — dist-resolution + inlined SRD, executed via dnd5e's tsx.
  sh(`"${TSX}" smoke-consumer.ts`, tmp);

  console.log("PUBLISH SMOKE PASS");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
