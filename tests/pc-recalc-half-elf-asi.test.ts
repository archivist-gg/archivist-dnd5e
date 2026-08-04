import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { loadOverlay } from "../tools/srd-canonical/sources/overlay";
import { raceMergeRule, toRaceCanonical } from "../tools/srd-canonical/merger-rules/race-merge";
import type { CanonicalEntry } from "../tools/srd-canonical/merger";

// R4-P4 task 9: Half-Elf is the ONE species whose Ability Score Increase trait
// has BOTH arms · a fixed +2 Cha and a two-ability choice. The choice half
// already ships, keyed `id: abilities`, and live characters persist their
// allocation under `origin_choices["race:abilities"]`. This file pins the pair:
// the newly authored fixed arm, and the shipped choice surviving untouched.
// Authoring a SECOND `ability-points` choice would grant +4 instead of +2, and
// re-keying `abilities` would silently unbind every existing allocation · the
// `toHaveLength(1)` and `id: abilities` assertions below are the guard on both.
//
// Bound to the MERGE output, not to `src/srd/data/runtime/race.2014.json`: that
// runtime file still carries `ability_score_increases: []` for every species
// until the phase's regeneration task, so a test reading it could not go green.
//
// `baseEntry` is a LOCAL copy of the builder in
// `tests/srd-canonical/merger-rules/race-merge.test.ts` · deliberately not
// imported. Importing any symbol from a vitest test file re-runs that file's
// whole suite inside the importer.
const OVERLAY = path.resolve(__dirname, "../tools/srd-canonical/overlays/srd-5e.yaml");

const baseEntry = (slug: string, name: string, overlay: unknown): CanonicalEntry => ({
  slug,
  edition: "2014" as const,
  kind: "race",
  base: { key: `srd_${name}`, name, desc: "", is_subspecies: false, subspecies_of: null, traits: [] } as never,
  structured: null,
  activation: null,
  overlay,
});

describe("real overlay: Half-Elf's fixed CHA increase beside its shipped choice (R4-P4 task 9)", () => {
  it("half-elf merges the fixed CHA +2 while keeping its ONE shipped ability-points choice", async () => {
    const ov = await loadOverlay(OVERLAY);
    const slug = "srd-5e_race_half-elf";
    const merged = toRaceCanonical(baseEntry(slug, "Half-Elf", raceMergeRule.pickOverlay(ov, slug) as never));

    expect(merged.ability_score_increases).toEqual([{ ability: "cha", amount: 2 }]); // the new fixed half

    // The shipped choice must survive BYTE-FOR-BYTE: `id: abilities` is what live
    // characters persist under origin_choices["race:abilities"].
    const abilityPoints = (merged.choices ?? []).filter(c => c.kind === "ability-points");
    expect(abilityPoints).toHaveLength(1);
    expect(abilityPoints[0]).toMatchObject({ id: "abilities", points: 2, max_per: 1 });
    expect((abilityPoints[0] as { pool: string[] }).pool).not.toContain("cha");
  });
});
