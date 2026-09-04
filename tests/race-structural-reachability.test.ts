/**
 * R4-G3b §5.2.9 / §15.3 · the `race.structural` reachability guard, as a COMMITTED test.
 *
 * `src/race/race.structural.ts` sits in the race parser's own directory, and the generators' server
 * entry reaches dnd5e's parsers, schemas, codecs and `src/srd/`. If any file in that reachable set
 * ever imported (or otherwise named) `race.structural`, the shared constant would be pulled into the
 * generators' bundle and `GEN_BUNDLE_SHA` would move for a change that belongs only to the PC engine
 * and the plugin. The guard that ruled this out at Tasks 6 and 12 was a shell grep run by hand; this
 * file is that grep, executable and in the suite.
 *
 * The walk is Node `fs` only (no shell), over the four reachable shapes named by the spec.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../src");

/** Every `.ts` file under `dir`, recursively, as a path relative to `src/`. */
function walkTs(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walkTs(path.join(dir, e.name), r));
    else if (e.name.endsWith(".ts")) out.push(r);
  }
  return out;
}

/** The four reachable shapes (spec §15.3): `src/schemas/**`, `src/srd/**`, and any `*.parser.ts` /
 *  `*.codec.ts` anywhere under `src/`. `src/srd/` holds only data today (zero `.ts` files, measured
 *  2026-09-04); it is walked anyway so a future module there is covered on the day it lands. Note
 *  `src/data-srd/` is a DIFFERENT directory and is deliberately not matched by the `srd/` prefix. */
const REACHABLE = (rel: string): boolean =>
  rel.startsWith("schemas/") || rel.startsWith("srd/") || rel.endsWith(".parser.ts") || rel.endsWith(".codec.ts");

/** The predicate under test, applied to ONE file: does its text name `race.structural`? */
const namesRaceStructural = (rel: string): boolean =>
  readFileSync(path.join(SRC, rel), "utf8").includes("race.structural");

const REACHABLE_FILES = walkTs(SRC).filter(REACHABLE);

describe("race.structural stays out of the generators' reachable graph (R4-G3b §15.3)", () => {
  it("the walk actually collects the reachable set (a vacuous guard would pass silently)", () => {
    expect(REACHABLE_FILES.length).toBeGreaterThan(30);
    expect(REACHABLE_FILES).toContain("schemas/feature-alias.ts");
    expect(REACHABLE_FILES).toContain("race/race.parser.ts");
    expect(REACHABLE_FILES).toContain("race/race.codec.ts");
    // The module the guard protects is itself outside the walk: it is neither a
    // schema, nor under `src/srd/`, nor a parser or codec by name.
    expect(REACHABLE_FILES).not.toContain("race/race.structural.ts");
  });

  it("no schema, no `src/srd` module, no parser and no codec names `race.structural`", () => {
    expect(REACHABLE_FILES.filter(namesRaceStructural)).toEqual([]);
  });

  it("POSITIVE CONTROL · the same predicate finds it in the PC-engine module that does import it", () => {
    // Proves the predicate reads real bytes: `src/pc/pc.additional-spells.ts` imports
    // `RACE_STRUCTURAL_PSEUDO` from `../race/race.structural`, and the PC engine is precisely the
    // half of the tree the generators' entry does NOT reach.
    expect(namesRaceStructural("pc/pc.additional-spells.ts")).toBe(true);
    expect(REACHABLE("pc/pc.additional-spells.ts")).toBe(false);
  });
});
