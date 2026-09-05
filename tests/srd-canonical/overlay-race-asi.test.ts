import { describe, it, expect } from "vitest";
import * as path from "node:path";
import { loadOverlay } from "../../tools/srd-canonical/sources/overlay";
import { raceMergeRule, toRaceCanonical } from "../../tools/srd-canonical/merger-rules/race-merge";
import type { CanonicalEntry } from "../../tools/srd-canonical/merger";

// R4-P4 task 8: task 7 built the contract with a SYNTHETIC overlay object · this
// file drives the REAL `overlays/srd-5e.yaml` through `loadOverlay` and the real
// merge, so the 12 authored species are covered end to end. Without it the
// authored YAML is inert until the next SRD regeneration, and the `races:` record
// key is UNVALIDATED, so a mis-typed species slug would parse fine, apply to
// nothing and go unnoticed. Naming a species here is what makes its key real.
//
// `baseEntry` is a LOCAL copy of the builder in
// `merger-rules/race-merge.test.ts` · deliberately not imported. Importing any
// symbol from a vitest test file re-runs that file's whole suite inside the
// importer.
const OVERLAY = path.resolve(__dirname, "../../tools/srd-canonical/overlays/srd-5e.yaml");

const baseEntry = (slug: string, name: string, overlay: unknown): CanonicalEntry => ({
  slug,
  edition: "2014" as const,
  kind: "race",
  base: { key: `srd_${name}`, name, desc: "", is_subspecies: false, subspecies_of: null, traits: [] } as never,
  structured: null,
  activation: null,
  overlay,
});

// Each species' OWN increment, never a cumulative total: a Hill Dwarf gains
// +1 WIS but NOT the Dwarf's +2 CON, which is the known partial this phase
// records rather than fixes. half-elf is task 9's (its +2 Cha rides beside a
// two-ability choice), so it is absent here on purpose.
const EXPECTED: Record<string, Array<{ ability: string; amount: number }>> = {
  dragonborn: [{ ability: "str", amount: 2 }, { ability: "cha", amount: 1 }],
  dwarf: [{ ability: "con", amount: 2 }],
  elf: [{ ability: "dex", amount: 2 }],
  gnome: [{ ability: "int", amount: 2 }],
  "half-orc": [{ ability: "str", amount: 2 }, { ability: "con", amount: 1 }],
  halfling: [{ ability: "dex", amount: 2 }],
  "high-elf": [{ ability: "int", amount: 1 }],
  "hill-dwarf": [{ ability: "wis", amount: 1 }],
  human: ["str", "dex", "con", "int", "wis", "cha"].map(a => ({ ability: a, amount: 1 })),
  lightfoot: [{ ability: "cha", amount: 1 }],
  "rock-gnome": [{ ability: "con", amount: 1 }],
  tiefling: [{ ability: "int", amount: 1 }, { ability: "cha", amount: 2 }],
};

describe("real overlay: authored SRD-2014 species ability score increases (R4-P4 task 8)", () => {
  it.each(Object.entries(EXPECTED))("%s merges its authored ability score increases", async (bare, expected) => {
    const ov = await loadOverlay(OVERLAY);
    const slug = `srd-5e_race_${bare}`;
    const merged = toRaceCanonical(baseEntry(slug, bare, raceMergeRule.pickOverlay(ov, slug) as never));
    expect(merged.ability_score_increases).toEqual(expected);
  });

  // The `races:` block already carried entity-level `choices` for human and
  // half-elf before this task. `race-merge.ts` applies `choices` WHOLESALE, so
  // an authoring edit that restructured either entry would silently delete live
  // data. Pin both.
  it("leaves the pre-existing entity-level choices intact", async () => {
    const ov = await loadOverlay(OVERLAY);
    expect(ov.races?.human?.choices).toEqual([
      { kind: "select-proficiency", id: "languages", domain: "language", count: 1 },
    ]);
    expect(ov.races?.["half-elf"]?.choices).toEqual([
      { kind: "ability-points", id: "abilities", points: 2, max_per: 1, pool: ["str", "dex", "con", "int", "wis"] },
      { kind: "select-proficiency", id: "languages", domain: "language", count: 1 },
    ]);
  });

  // R4-G4 Task 2b (spec 14): the four flattened SRD 5e subraces carry no Languages
  // trait of their own, so the prose extraction emitted `{ fixed: [] }` for each
  // (measured on the shipped bundle 2026-09-05). The overlay now authors the
  // parent's list, taken from the SRD 5.1 text: Dwarf "Common and Dwarvish", Elf
  // "Common and Elvish", Gnome "Common and Gnomish", Halfling "Common and Halfling".
  it("R4-G4: the four flattened subraces author their parent's languages", async () => {
    const ov = await loadOverlay(OVERLAY);
    expect(ov.races?.["hill-dwarf"]?.languages).toEqual({ fixed: ["common", "dwarvish"] });
    expect(ov.races?.["high-elf"]?.languages).toEqual({ fixed: ["common", "elvish"] });
    expect(ov.races?.["rock-gnome"]?.languages).toEqual({ fixed: ["common", "gnomish"] });
    expect(ov.races?.["lightfoot"]?.languages).toEqual({ fixed: ["common", "halfling"] });
  });
});
