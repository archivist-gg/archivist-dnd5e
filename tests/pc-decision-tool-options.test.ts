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

  it("leaves the same entity's language pick at its 16 options", () => {
    const ledger = soldierLedger();
    const item = ledger.origin.find((i) => i.key === "languages")!;
    expect(item.options.map((o) => o.value)).toEqual(ALL_LANGUAGES);
  });
});
