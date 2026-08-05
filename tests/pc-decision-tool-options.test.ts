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
  it("ships the tool pick with domain:\"tool\" and the gaming-set `from`", () => {
    const choices = SOLDIER.choices as Array<Record<string, unknown>>;
    const tool = choices.find((c) => c.id === "tool")!;
    // Exact equality, so a change to the shipped `from` fails here instead of
    // silently making the assertion below vacuous.
    expect(tool).toEqual({
      kind: "select-proficiency", id: "tool", count: 1, domain: "tool",
      from: ["dice-set", "playing-cards"],
    });
  });

  // REGEN NOTE, DISCHARGED in R4-P4. Three assertions in THIS describe (the
  // real-Soldier one) were pinned to a pre-regen tree in which the Soldier's
  // tool choice carried NO `from`, so the picker fell back to all 35 tools.
  // Phase R4-P3a authored `from: [dice-set, playing-cards]` for the 2024
  // Soldier (tools/srd-canonical/overlays/srd-2024.yaml, `backgrounds.soldier`)
  // and pre-declared that they would go red at the next regeneration. R4-P4 ran
  // that regeneration and re-pointed them at the gaming-set pair: the
  // exact-equality above now includes the `from`, and the picker below asserts
  // those 2 options rather than ALL_TOOLS.
  // The identical-looking pair at :55-56 was NEVER affected: it runs over the
  // synthetic fixture built at the top of this file, which no regen touches.
  // The property this file exists to defend survives either way: the tool
  // picker is NON-EMPTY, where the reported bug rendered 0.
  it("offers the Soldier's two gaming sets in the builder's tool picker", () => {
    const ledger = soldierLedger();
    // A background choice is an ORIGIN choice: the ledger is {classes, origin}
    // and this item never appears under `classes`.
    const item = ledger.origin.find((i) => i.key === "tool")!;
    expect(item).toBeDefined();
    expect(item.options).toHaveLength(2);
    expect(item.options.map((o) => o.value)).toEqual(["dice-set", "playing-cards"]);
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
  // `tool_proficiencies` is `[]`, so nothing is excluded from its `from` pair.
  it("drops the granted `common` from the same entity's language pick, leaving 15", () => {
    const ledger = soldierLedger();
    const item = ledger.origin.find((i) => i.key === "languages")!;
    expect(item.options.map((o) => o.value)).toEqual(ALL_LANGUAGES.filter((l) => l !== "common"));
    expect(item.options).toHaveLength(15);
  });
});
