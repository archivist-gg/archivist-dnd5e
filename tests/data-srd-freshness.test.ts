import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("data-srd index is fresh", () => {
  it("committed index.generated.ts matches a fresh regenerate", () => {
    const root = path.resolve(__dirname, "..");
    // regenerate into the working tree, then compare against the COMMITTED version
    execFileSync("node", ["scripts/generate-srd-md-index.mjs"], { cwd: root });
    const fresh = readFileSync(path.join(root, "src/data-srd/index.generated.ts"), "utf8");
    const committed = execFileSync("git", ["show", "HEAD:src/data-srd/index.generated.ts"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(fresh).toBe(committed);
  });
});
