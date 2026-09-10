import { describe, it, expect } from "vitest";
import { PCResolver, collectFeatGrantedSpells, collectItemGrantedSpells } from "../src/pc/pc.resolver";
import { resolveSpellByName, buildSpellNameIndex } from "../src/pc/pc.additional-spells";
import { parseSpell } from "../src/spell/spell.parser";
import { buildMockRegistry } from "./mock-entity-registry";
import type { Character } from "../src/pc/pc.types";
import type { FeatEntity } from "../src/feat/feat.types";

// R4-G7 §7.5 (spec §15 row 6): THE SHEET READS RAW ENTITIES, so the normalisation `parseSpell` performs on
// the converter's structured `components` object and `duration` array is MIRRORED at resolve time. Without
// it `componentLetters` (spell-display.ts) and the add drawer's `col-dur` cell read an object and print
// `[object Object]`. Population: 186 + 35 converter spells.

/** The converter's structured shapes, as the REGISTRY holds them (never parsed: `reg.data` is raw). The
 *  duration entry additionally carries `concentration`, which the parser's entry schema does not declare and
 *  its normaliser ignores. */
const RAW_SHAPE = {
  components: { v: true, s: true, m: { text: "x", cost: 2500, consume: true } },
  duration: [{ type: "timed", duration: { type: "minute", amount: 1 }, concentration: true }],
};

// The expected strings are computed by the PARSER on a YAML twin, never hand-typed, so this test pins the
// parser's own output. The twin omits the entry-level `concentration` key ONLY because
// `spellDurationEntrySchema` is a `strictObject`; the normaliser's answer is the same either way.
const TWIN = `name: Twin
level: 3
components:
  v: true
  s: true
  m:
    text: x
    cost: 2500
    consume: true
duration:
  - type: timed
    duration:
      type: minute
      amount: 1
concentration: true
`;
const twin = parseSpell(TWIN);
const EXPECTED_COMPONENTS = twin.success ? twin.data.components : "(the twin refused)";
const EXPECTED_DURATION = twin.success ? twin.data.duration : "(the twin refused)";

const SPELL = { name: "Starlight", level: 3, classes: ["wizard"], edition: "2024", ...RAW_SHAPE };
const WIZARD = {
  slug: "fx_class_wizard", name: "Wizard", hit_die: "d6", saving_throws: ["int", "wis"], features_by_level: {}, table: {},
  spellcasting: { caster_type: "full", ability: "int", preparation: "prepared", spell_list: "wizard" },
};
const registry = () => buildMockRegistry([
  { slug: "fx_class_wizard", entityType: "class", data: WIZARD },
  { slug: "fx_spell_starlight", entityType: "spell", data: { slug: "fx_spell_starlight", ...SPELL } },
  { slug: "zzz_spell_moonbeam-twin", entityType: "spell", data: { slug: "zzz_spell_moonbeam-twin", name: "Moonbeam Twin", level: 2, ...RAW_SHAPE } },
  { slug: "fx_spell_stringy", entityType: "spell", data: { slug: "fx_spell_stringy", name: "Stringy", level: 1, components: "V, S, M (a pinch of salt)", duration: "1 hour" } },
  { slug: "fx_spell_bare", entityType: "spell", data: { slug: "fx_spell_bare", name: "Bare", level: 1 } },
  { slug: "fx_item_scroll", entityType: "item", data: { slug: "fx_item_scroll", name: "Spell Scroll (3rd Level)", rarity: "uncommon", type: "scroll", scroll_level: 3 } },
]);

const character = (known: unknown[], equipment: unknown[] = []): Character => ({
  name: "Caster", edition: "2024", race: null, subrace: null, background: null,
  class: [{ name: "[[fx_class_wizard]]", level: 5, subclass: null, choices: {} }],
  abilities: { str: 10, dex: 10, con: 10, int: 16, wis: 12, cha: 10 },
  ability_method: "manual", skills: { proficient: [], expertise: [] },
  spells: { known, overrides: [] }, equipment, overrides: {}, origin_choices: {},
  state: { hp: { current: 8, max: 8, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
}) as unknown as Character;

const FEAT = {
  slug: "fx_feat_initiate", name: "Fixture Initiate", edition: "2024", description: "", benefits: [], effects: [],
  choices: [{ kind: "select-entity", id: "pick", count: 1, entity_type: "spell", where: { list: "wizard" } }],
} as unknown as FeatEntity;

describe("the resolve-time mirror of a spell's components / duration (spec §7.5)", () => {
  it("the YAML twin parses, so the expected strings are the PARSER's own", () => {
    expect(twin.success).toBe(true);
    expect(EXPECTED_COMPONENTS).toBe("V, S, M (x)");
    expect(EXPECTED_DURATION).toBe("1 minute");
  });

  it("a KNOWN spell resolves with both shapes normalised (pc.resolver.ts, the known-spell site)", () => {
    const { character: resolved } = new PCResolver(registry()).resolve(character(["[[fx_spell_starlight]]"]));
    expect(resolved.spells[0].entity.components).toBe(EXPECTED_COMPONENTS);   // RED FIRST: the raw object rode through
    expect(resolved.spells[0].entity.duration).toBe(EXPECTED_DURATION);
    expect(resolved.spells[0].entity.name).toBe("Starlight");
  });

  it("a FEAT-granted spell resolves the same way (the feat-spell site)", () => {
    const out = collectFeatGrantedSpells(FEAT, (id) => (id === "pick" ? "fx_spell_starlight" : undefined), registry(), []);
    expect(out[0].entity.components).toBe(EXPECTED_COMPONENTS);
    expect(out[0].entity.duration).toBe(EXPECTED_DURATION);
  });

  it("an ITEM / scroll spell resolves the same way (the scroll site)", () => {
    const ch = character([], [{ item: "[[fx_item_scroll]]", overrides: { spell: "fx_spell_starlight" } }]);
    const out = collectItemGrantedSpells(ch, "int", registry(), []);
    expect(out[0].entity.components).toBe(EXPECTED_COMPONENTS);
    expect(out[0].entity.duration).toBe(EXPECTED_DURATION);
  });

  it("resolveSpellByName's EXACT-hit arm resolves the same way (the additional_spells grant route)", () => {
    const reg = registry();
    const hit = resolveSpellByName({ entities: reg, index: buildSpellNameIndex(reg), nameSlug: "starlight", carrierSlug: "fx_class_wizard", alreadyCollected: [] });
    expect(hit?.entity.components).toBe(EXPECTED_COMPONENTS);
    expect(hit?.slug).toBe("fx_spell_starlight");
    expect(hit?.entity.duration).toBe(EXPECTED_DURATION);
  });

  it("resolveSpellByName's POOL arm resolves the same way (m8's kill row)", () => {
    const reg = registry();
    const hit = resolveSpellByName({ entities: reg, index: buildSpellNameIndex(reg), nameSlug: "moonbeam-twin", carrierSlug: "abc_subclass_stars", alreadyCollected: [] });
    expect(hit?.entity.components).toBe(EXPECTED_COMPONENTS);
    expect(hit?.slug).toBe("zzz_spell_moonbeam-twin");
    expect(hit?.entity.duration).toBe(EXPECTED_DURATION);
  });

  it("a spell that already carries STRING shapes passes through byte-unchanged", () => {
    const { character: resolved } = new PCResolver(registry()).resolve(character(["[[fx_spell_stringy]]"]));
    expect(resolved.spells[0].entity.components).toBe("V, S, M (a pinch of salt)");
    expect(resolved.spells[0].entity.duration).toBe("1 hour");
  });

  it("a spell that authors NEITHER key resolves with both keys still ABSENT (the guard)", () => {
    const { character: resolved } = new PCResolver(registry()).resolve(character(["[[fx_spell_bare]]"]));
    expect("components" in resolved.spells[0].entity).toBe(false);
    expect("duration" in resolved.spells[0].entity).toBe(false);
  });
});
