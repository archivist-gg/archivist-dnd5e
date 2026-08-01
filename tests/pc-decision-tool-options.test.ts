import { describe, it, expect } from "vitest";
import { ALL_TOOLS, ALL_LANGUAGES } from "@archivist-gg/dnd5e/types/choice";
import { buildDecisionLedger } from "@archivist-gg/dnd5e/pc/pc.decision-engine";
import type { ResolvedCharacter } from "@archivist-gg/dnd5e/pc/pc.types";
import type { Character } from "../src/pc/pc.types";
import { PCResolver } from "../src/pc/pc.resolver";
import { buildMockRegistry } from "./mock-entity-registry";
// The SHIPPED runtime entity bundle. Step 1b READS the Soldier out of it rather
// than transcribing its shape, so the assertion tracks the real data and cannot
// silently pass against a fixture that merely mirrors the implementation.
import backgrounds2024 from "../src/srd/data/runtime/background.2024.json";

// A minimal registry: the select-proficiency branch never consults it.
const registry = {
  search: () => [],
  getByTypeAndSlug: () => undefined,
};

/** A single-class fighter whose only decision is a tool pick with NO `from`,
 *  so enumerateOptions must fall back to the full ALL_TOOLS pool. Cloned from
 *  pc-decision-language-options.test.ts's language twin, domain swapped. */
function resolvedWithToolChoice(): ResolvedCharacter {
  const toolFeature = {
    id: "tool", name: "Tool Proficiency", description: "Choose a tool.",
    choices: [{ kind: "select-proficiency", id: "tool", count: 1, domain: "tool" }],
  };
  const entity = {
    slug: "srd-2024_fighter", name: "Fighter",
    // No skill_choices.from → the L1 skills decision is not synthesized.
    skill_choices: { count: 0, from: [] },
    features_by_level: { 1: [toolFeature] }, starting_equipment: [],
  };
  const definition = {
    name: "T", edition: "2024", race: null, subrace: null, background: null,
    class: [{ name: "[[fighter]]", level: 1, subclass: null, choices: {} }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ability_method: "manual", skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {},
    state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
      conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
  } as unknown as ResolvedCharacter["definition"];
  const cls = { entity, level: 1, subclass: null, choices: {} } as unknown as ResolvedCharacter["classes"][number];
  const features = [{ feature: toolFeature, source: { kind: "class", slug: entity.slug, level: 1 } }];
  return {
    definition, race: null, classes: [cls], background: null, feats: [],
    totalLevel: 1, features, spells: [], pools: [], state: definition.state,
  } as unknown as ResolvedCharacter;
}

describe("buildDecisionLedger: tool picker options", () => {
  it("resolves a domain:\"tool\" select-proficiency with no `from` to the full ALL_TOOLS pool, humanized", () => {
    const ledger = buildDecisionLedger(resolvedWithToolChoice(), { registry } as never);
    const item = ledger.classes[0].levels.flatMap((l) => l.items).find((i) => i.key === "tool")!;
    expect(item).toBeDefined();
    expect(item.options).toHaveLength(35);
    expect(item.options.map((o) => o.value)).toEqual(ALL_TOOLS);

    const smith = item.options.find((o) => o.value === "smith's-tools")!;
    expect(smith.label).toBe("Smith's Tools");   // apostrophe-safe, not "Smith'S Tools"
    const panFlute = item.options.find((o) => o.value === "pan-flute")!;
    expect(panFlute.label).toBe("Pan Flute");
  });
});

// ── Step 1b: the same claim against a REAL shipped entity ───────────────────
//
// Every other assertion in this phase is a unit test over a synthetic fixture the
// implementer also wrote. This one is not: the Soldier background is read out of
// `src/srd/data/runtime/background.2024.json` and driven through the PRODUCTION
// path the builder uses · registry → PCResolver.resolve → buildDecisionLedger ·
// so it demonstrates the reported bug ("there is no tool to select in the
// character builder") is actually fixed, not merely mirrored by a fixture.

const SOLDIER = (backgrounds2024 as Array<Record<string, unknown>>)
  .find((b) => b.slug === "srd-2024_background_soldier")!;

function soldierCharacter(): Character {
  return {
    name: "T", edition: "2024", race: null, subrace: null,
    background: "[[srd-2024_background_soldier]]",
    class: [], abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ability_method: "manual", skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] }, equipment: [], overrides: {}, origin_choices: {},
    state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null,
      conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
  } as unknown as Character;
}

function soldierLedger() {
  const reg = buildMockRegistry([
    { slug: SOLDIER.slug as string, name: SOLDIER.name as string, entityType: "background", data: SOLDIER },
  ]);
  const { character: resolved } = new PCResolver(reg).resolve(soldierCharacter());
  return buildDecisionLedger(resolved, { registry: reg });
}

describe("the reported bug, against the real SRD Soldier background", () => {
  it("ships the tool pick with domain:\"tool\" and NO `from` (the premise of the fix)", () => {
    const choices = SOLDIER.choices as Array<Record<string, unknown>>;
    const tool = choices.find((c) => c.id === "tool")!;
    // Exact equality, so an added `from` (which would route around the new arm)
    // fails here instead of silently making the assertion below vacuous.
    expect(tool).toEqual({ kind: "select-proficiency", id: "tool", count: 1, domain: "tool" });
  });

  // REGEN NOTE · three assertions in THIS describe (the real-Soldier one) are
  // pinned to the CURRENT generated tree, and the NEXT SRD regeneration will
  // legitimately change them. A red here after a regen is expected behaviour,
  // not a regression:
  //   :103 `expect(tool).toEqual({...})`, the exact-equality pinning the shipped
  //        Soldier tool choice as having NO `from`
  //   :131 `expect(item.options).toHaveLength(35)`
  //   :132 `expect(item.options.map((o) => o.value)).toEqual(ALL_TOOLS)`
  // The identical-looking pair at :55-56 is NOT affected: it runs over the
  // synthetic fixture built at the top of this file, which no regen touches.
  // Later in the SAME phase that added this file, the overlay task authored
  // `from: [dice-set, playing-cards]` for the 2024 Soldier
  // (tools/srd-canonical/overlays/srd-2024.yaml, `backgrounds.soldier`), and
  // background-merge.test.ts drives the real overlay through the merge to prove
  // that `from` lands on the canonical entity. So after the regen the choice
  // carries a `from` and the picker offers 2 options, not 35. Re-point the
  // three lines at the gaming-set pair THEN · do not weaken them now, while
  // they are still true. Either way the property this file exists to defend
  // survives: the tool picker is NON-EMPTY, where the reported bug rendered 0.
  it("offers all 35 tools in the builder's tool picker", () => {
    const ledger = soldierLedger();
    // A background choice is an ORIGIN choice: the ledger is {classes, origin}
    // and this item never appears under `classes`.
    const item = ledger.origin.find((i) => i.key === "tool")!;
    expect(item).toBeDefined();
    expect(item.options).toHaveLength(35);
    expect(item.options.map((o) => o.value)).toEqual(ALL_TOOLS);
    expect(item.status).toBe("unresolved");   // nothing picked yet, but pickable
  });

  // MOVED, and it is exclusion WORKING, not a regression. This assertion used to
  // read `toEqual(ALL_LANGUAGES)` (16) under the name "leaves the same entity's
  // language pick at its 16 options". The Soldier's `language_proficiencies`
  // GRANTS common ([{kind:"fixed",languages:["common"]}]), so offering it again
  // burns the pick: the player spends one of two choices on a language they
  // already have and the sheet shows nothing new. 15 is the correct count, and
  // the assertion is written as an exact list so a wrong-but-same-length pool
  // still fails. The tool assertions above are UNAFFECTED · the Soldier's
  // `tool_proficiencies` is `[]`, so nothing is excluded from the 35.
  it("drops the granted `common` from the same entity's language pick, leaving 15", () => {
    const ledger = soldierLedger();
    const item = ledger.origin.find((i) => i.key === "languages")!;
    expect(item.options.map((o) => o.value)).toEqual(ALL_LANGUAGES.filter((l) => l !== "common"));
    expect(item.options).toHaveLength(15);
  });
});
