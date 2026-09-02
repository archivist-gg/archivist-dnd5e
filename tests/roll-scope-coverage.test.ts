/**
 * R4-G3a §6.1 / §16 · the coverage FLOOR of the shipped scope normaliser, re-derived from the
 * measured corpus rather than trusted from the design-time prototype.
 *
 * `tests/fixtures/roll-scopes-152.json` is the 152 check/save `roll-modifier` sites that FOLD
 * today (the design-time partition of `research/controller-scope-coverage.mjs`: `kind ===
 * "roll-modifier"` AND `mode ∈ {advantage, disadvantage}` AND `roll ∈ {ability-check,
 * saving-throw}`). It is NOT "all check/save sites": that set is 180 with 78 absent and would
 * fail the `toBe(68)` pin. JSON carries no comments, so the generating command lives here:
 *
 *   node -e 'const d=require("/Users/shinoobi/w/archivist-obsidian/.superpowers/sdd/2026-09-02-r4-g3-engine-semantics/research/controller-sites-dump.json");const out=d.sites.filter(s=>s.eff.kind==="roll-modifier"&&(s.eff.mode==="advantage"||s.eff.mode==="disadvantage")&&(s.eff.roll==="ability-check"||s.eff.roll==="saving-throw")).map(s=>s.eff.scope==null?{roll:s.eff.roll}:{roll:s.eff.roll,scope:s.eff.scope});require("fs").writeFileSync("tests/fixtures/roll-scopes-152.json",JSON.stringify(out,null,2)+"\n");console.log("sites="+out.length+" absent="+out.filter(o=>o.scope==null).length)'
 *
 * run once from the dnd5e repo root (printed `sites=152 absent=68`).
 *
 * The whole-object `toEqual` below is the EXACT measurement of the shipped mapper over that
 * fixture, and it is where Task 9 reads §16's numbers from (there is no console output: a number
 * a human has to copy off a test run is a number that goes stale silently). The four assertions
 * after it are the SPEC's contract (§6.1's "≥ 45 of the 80" floor, the 68/4 pins and the fan-out
 * bound) and are kept: the exact pin says what the mapper does today, the floor says what it is
 * allowed to become.
 */
import { describe, it, expect } from "vitest";
import scopes from "./fixtures/roll-scopes-152.json";
import { normalizeRollScope } from "../src/pc/roll-scope";
describe("scope-normaliser coverage floor (spec §6.1 / §16)", () => {
  it("≥ 45 of the 80 prose scopes become canonical; absent 68; already-canonical 4", () => {
    let absent = 0, canonical = 0, mapped = 0, residual = 0, fanout = 0, maxFan = 0;
    for (const s of scopes as Array<{ roll: string; scope?: string }>) {
      if (s.scope == null) { absent++; continue; }
      const r = normalizeRollScope(s.scope, s.roll as never);
      if (r === undefined) { residual++; continue; }
      if (r.length === 1 && r[0] === s.scope) { canonical++; continue; }
      mapped++; if (r.length > 1) { fanout++; maxFan = Math.max(maxFan, r.length); }
    }
    // Task 9 reads §16's numbers from THIS pin.
    expect({ absent, canonical, mapped, residual, fanout, maxFan })
      .toEqual({ absent: 68, canonical: 4, mapped: 45, residual: 35, fanout: 14, maxFan: 3 });
    expect(absent).toBe(68); expect(canonical).toBe(4); expect(mapped).toBeGreaterThanOrEqual(45); expect(maxFan).toBeLessThanOrEqual(3);
  });
});
