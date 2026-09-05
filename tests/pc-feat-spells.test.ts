import { describe, it, expect } from "vitest";
import { PCResolver, dedupeResolvedSpells } from "../src/pc/pc.resolver";
import { buildDecisionLedger } from "../src/pc/pc.decision-engine";
import yaml from "js-yaml";
import { buildMockRegistry } from "./mock-entity-registry";
import type { Character, ResolvedSpell } from "../src/pc/pc.types";

// ─────────────────────────────────────────────────────────────────────────────
// Task 3d · feat→spell application pass + per-spell ability + ledger wiring.
//
// SYNTHETIC FIXTURE, not the real Magic Initiate: 3f authors the real MI nested
// spell choices LAST, so the real feat has NO spell choices during 3d. This suite
// proves the application pass against a hand-authored Magic-Initiate-shaped feat:
// a `spell-list` select-inline whose CHOSEN branch nests two spell select-entity
// picks (2 cantrips + 1 level-1), plus a `spellcasting-ability` select-inline. A
// fixture background points its origin_feat at that feat; origin_choices records
// the branch, the ability, and the concrete spell picks under `background:feat:*`.
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURE_FEAT = {
  slug: "fx_magic-initiate",
  name: "Fixture Magic Initiate",
  edition: "2024",
  source: "Fixture",
  category: "origin",
  description: "Pick spells from a class list, plus a spellcasting ability.",
  prerequisites: [],
  benefits: [],
  effects: [],
  grants_asi: null,
  repeatable: false,
  choices: [
    {
      kind: "select-inline", id: "spell-list", count: 1, options: [
        {
          value: "cleric", label: "Cleric", choices: [
            { kind: "select-entity", id: "mi-cantrips", count: 2, entity_type: "spell",
              where: { list: "cleric", level: 0, edition: "2024" } },
            { kind: "select-entity", id: "mi-level1", count: 1, entity_type: "spell",
              where: { list: "cleric", level: 1, edition: "2024" } },
          ],
        },
        {
          value: "wizard", label: "Wizard", choices: [
            { kind: "select-entity", id: "mi-cantrips", count: 2, entity_type: "spell",
              where: { list: "wizard", level: 0, edition: "2024" } },
            { kind: "select-entity", id: "mi-level1", count: 1, entity_type: "spell",
              where: { list: "wizard", level: 1, edition: "2024" } },
          ],
        },
      ],
    },
    {
      kind: "select-inline", id: "spellcasting-ability", count: 1, options: [
        { value: "int", label: "Intelligence" },
        { value: "wis", label: "Wisdom" },
      ],
    },
  ],
};

// Path-style origin_feat ref: the slugified tail ("magic-initiate") suffix-matches
// the edition-prefixed feat slug ("fx_magic-initiate"), exercising the real
// resolveOriginFeat resolution shape (not a bare-slug shortcut).
const FIXTURE_BG = {
  slug: "fx_acolyte", name: "Fixture Acolyte", edition: "2024",
  origin_feat: "[[Fixtures/Feats/Magic Initiate]]",
};

const MINI_CLASS = {
  slug: "fx-fighter", name: "Fighter", hit_die: "d10",
  saving_throws: ["str", "con"], features_by_level: {},
};

const SPELLS = [
  { slug: "fx_sacred-flame", entityType: "spell",
    data: { name: "Sacred Flame", level: 0, classes: ["cleric"], edition: "2024" } },
  { slug: "fx_guidance", entityType: "spell",
    data: { name: "Guidance", level: 0, classes: ["cleric"], edition: "2024" } },
  { slug: "fx_bless", entityType: "spell",
    data: { name: "Bless", level: 1, classes: ["cleric"], edition: "2024" } },
  { slug: "fx_fire-bolt", entityType: "spell",
    data: { name: "Fire Bolt", level: 0, classes: ["wizard"], edition: "2024" } },
];

function buildRegistry() {
  return buildMockRegistry([
    { slug: "fx-fighter", entityType: "class", data: MINI_CLASS },
    { slug: "fx_acolyte", entityType: "background", data: FIXTURE_BG },
    { slug: "fx_magic-initiate", entityType: "feat", data: FIXTURE_FEAT },
    ...SPELLS,
  ]);
}

function charWithPicks(picks: Record<string, unknown>): Character {
  return {
    name: "Cleric-Initiate", edition: "2024", race: null, subrace: null,
    background: "[[fx_acolyte]]",
    class: [{ name: "[[fx-fighter]]", level: 1, subclass: null, choices: {} }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 10 },
    ability_method: "manual", skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] }, equipment: [], overrides: {},
    origin_choices: picks,
    state: {
      hp: { current: 8, max: 8, temp: 0 }, hit_dice: {}, spell_slots: {},
      concentration: null, conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {},
    },
  } as unknown as Character;
}

const FULL_PICKS: Record<string, unknown> = {
  "background:feat:spell-list": "cleric",
  "background:feat:spellcasting-ability": "wis",
  "background:feat:mi-cantrips": ["fx_sacred-flame", "fx_guidance"],
  "background:feat:mi-level1": "fx_bless",
};

describe("PCResolver · feat-granted spells (origin feat → resolved.spells)", () => {
  it("turns the origin feat's spell picks into resolved.spells (source feat, alwaysPrepared, chosen ability, null classSlug)", () => {
    const { character } = new PCResolver(buildRegistry()).resolve(charWithPicks(FULL_PICKS));
    const featSpells = character.spells.filter((s) => s.source === "feat");
    expect(featSpells.map((s) => s.slug).sort()).toEqual(["fx_bless", "fx_guidance", "fx_sacred-flame"]);
    for (const s of featSpells) {
      expect(s.alwaysPrepared).toBe(true);
      expect(s.prepared).toBe(true);
      expect(s.classSlug).toBeNull();
      expect(s.ability).toBe("wis");
    }
    const bless = featSpells.find((s) => s.slug === "fx_bless")!;
    expect(bless.entity.name).toBe("Bless");
    expect(bless.entity.level).toBe(1);
  });

  it("resolves picks ONLY from the chosen spell-list branch (cleric), never the wizard branch", () => {
    const { character } = new PCResolver(buildRegistry()).resolve(charWithPicks(FULL_PICKS));
    const featSpells = character.spells.filter((s) => s.source === "feat");
    // fx_fire-bolt is a wizard cantrip; the wizard branch is unpicked so it never appears.
    expect(featSpells.map((s) => s.slug)).not.toContain("fx_fire-bolt");
  });

  it("warns and skips an unresolvable spell pick, and does not throw", () => {
    const picks = { ...FULL_PICKS, "background:feat:mi-cantrips": ["fx_sacred-flame", "fx_ghost-spell"] };
    const { character, warnings } = new PCResolver(buildRegistry()).resolve(charWithPicks(picks));
    const featSpells = character.spells.filter((s) => s.source === "feat");
    expect(featSpells.map((s) => s.slug).sort()).toEqual(["fx_bless", "fx_sacred-flame"]);
    expect(warnings.some((w) => w.includes("fx_ghost-spell"))).toBe(true);
  });

  it("emits no feat spells when the spell-list branch is unpicked", () => {
    const { character } = new PCResolver(buildRegistry()).resolve(charWithPicks({}));
    expect(character.spells.filter((s) => s.source === "feat")).toHaveLength(0);
  });

  it("carries a null ability when no spellcasting-ability was chosen", () => {
    const picks: Record<string, unknown> = {
      "background:feat:spell-list": "cleric",
      "background:feat:mi-cantrips": ["fx_sacred-flame"],
    };
    const { character } = new PCResolver(buildRegistry()).resolve(charWithPicks(picks));
    const featSpells = character.spells.filter((s) => s.source === "feat");
    expect(featSpells).toHaveLength(1);
    expect(featSpells[0].ability ?? null).toBeNull();
  });

  it("does not disturb ordinary known-spell resolution (feat spells are additive)", () => {
    const char = charWithPicks(FULL_PICKS);
    char.spells.known = ["[[fx_fire-bolt]]"];
    const { character } = new PCResolver(buildRegistry()).resolve(char);
    const known = character.spells.filter((s) => s.source !== "feat");
    expect(known.map((s) => s.slug)).toEqual(["fx_fire-bolt"]);
    expect(character.spells.filter((s) => s.source === "feat")).toHaveLength(3);
  });

  // Dedup (3d Minor #2 carry-forward): a spell present in BOTH character.spells.known
  // and a feat pick used to emit two resolved.spells rows. The class-known copy owns
  // a real DC via classSlug, so it wins; the feat duplicate is dropped.
  it("dedups a spell that is both class-known and feat-granted to one row, keeping the class copy", () => {
    const char = charWithPicks(FULL_PICKS); // feat picks fx_bless (level 1) among others
    char.spells.known = ["[[fx_bless]]"];    // also known as a class spell
    const { character } = new PCResolver(buildRegistry()).resolve(char);
    const bless = character.spells.filter((s) => s.slug === "fx_bless");
    expect(bless).toHaveLength(1);
    expect(bless[0].source).toBe("class"); // the class-known copy survives, not the feat dup
    // The feat's OTHER (non-overlapping) picks still resolve as feat spells.
    expect(character.spells.filter((s) => s.source === "feat").map((s) => s.slug).sort())
      .toEqual(["fx_guidance", "fx_sacred-flame"]);
  });
});

describe("dedupeResolvedSpells · collapse cross-source double emission", () => {
  const rs = (slug: string, source: ResolvedSpell["source"], extra: Partial<ResolvedSpell> = {}): ResolvedSpell =>
    ({ entity: { name: slug, level: 1 } as never, slug, classSlug: null, source, prepared: true, alwaysPrepared: source === "feat", ...extra });

  it("keeps a single row for a spell that is both class-known and feat-granted, preferring the class copy", () => {
    const out = dedupeResolvedSpells([rs("bless", "class", { classSlug: "cleric" }), rs("bless", "feat", { ability: "wis" })]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("class");
    expect(out[0].classSlug).toBe("cleric");
  });

  it("prefers the class copy even when the feat copy appears first (order-independent)", () => {
    const out = dedupeResolvedSpells([rs("bless", "feat", { ability: "wis" }), rs("bless", "class", { classSlug: "cleric" })]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("class");
  });

  it("collapses a feat taken as both origin and class-slot (feat + feat, same slug) to one row", () => {
    const out = dedupeResolvedSpells([rs("guidance", "feat", { ability: "wis" }), rs("guidance", "feat", { ability: "wis" })]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("feat");
  });

  it("leaves distinct slugs untouched and order-preserved", () => {
    const out = dedupeResolvedSpells([rs("a", "class"), rs("b", "feat", { ability: "wis" }), rs("c", "class")]);
    expect(out.map((s) => s.slug)).toEqual(["a", "b", "c"]);
  });

  // Segmented dedupe (P4-T3): item-source spells carry INSTANCE identity (slug +
  // entryIndex), so two scrolls of one spell stay two rows and a scroll of a
  // class-known spell keeps its OWN item row, never collapsing into / being
  // collapsed by a class/feat copy.
  it("keeps item copies distinct by entry index and separate from a class copy of the same slug", () => {
    const out = dedupeResolvedSpells([
      rs("fireball", "class", { classSlug: "wizard" }),
      rs("fireball", "item", { entryIndex: 0 }),
      rs("fireball", "item", { entryIndex: 1 }),
    ]);
    expect(out).toHaveLength(3);
    expect(out.filter((s) => s.source === "item").map((s) => s.entryIndex).sort()).toEqual([0, 1]);
    expect(out.find((s) => s.source === "class")!.classSlug).toBe("wizard");
  });
});

describe("buildDecisionLedger · origin feat choices wired into origin[]", () => {
  it("surfaces the origin feat's spell-list + nested spell picks under background:feat:* keys", () => {
    const { character } = new PCResolver(buildRegistry()).resolve(charWithPicks(FULL_PICKS));
    const ledger = buildDecisionLedger(character, { registry: buildRegistry() });

    const spellList = ledger.origin.find((i) => i.key === "feat:spell-list")!;
    expect(spellList).toBeDefined();
    expect(spellList.choice.kind).toBe("select-inline");
    expect(spellList.selected).toBe("cleric");

    // The chosen branch reveals the nested spell picks as children.
    const childKeys = (spellList.children ?? []).map((c) => c.key).sort();
    expect(childKeys).toEqual(["feat:mi-cantrips", "feat:mi-level1"]);

    const cantrips = spellList.children!.find((c) => c.key === "feat:mi-cantrips")!;
    // The spell axis (list/level/edition) enumerates only the 2024 cleric cantrips.
    expect(cantrips.options.map((o) => o.value).sort()).toEqual(["fx_guidance", "fx_sacred-flame"]);
    expect(cantrips.selected).toEqual(["fx_sacred-flame", "fx_guidance"]);
    expect(cantrips.status).toBe("resolved");

    const ability = ledger.origin.find((i) => i.key === "feat:spellcasting-ability")!;
    expect(ability).toBeDefined();
    expect(ability.selected).toBe("wis");
    expect(ability.source.kind).toBe("feat");
  });

  it("keeps background:feat:* DISJOINT from a bare background:<id> of the same choice id", () => {
    // The background carries its OWN top-level `spell-list` choice (bare
    // background:spell-list) AND an origin feat whose first choice is also
    // `spell-list` (background:feat:spell-list). The two must read independent
    // ledger values with distinct keys, never colliding.
    const bgWithOwnChoice = {
      slug: "fx_acolyte", name: "Fixture Acolyte", edition: "2024",
      origin_feat: "[[Fixtures/Feats/Magic Initiate]]",
      choices: [{
        kind: "select-inline", id: "spell-list", count: 1,
        options: [{ value: "own-branch", label: "Own Branch" }, { value: "other", label: "Other" }],
      }],
    };
    const reg = buildMockRegistry([
      { slug: "fx-fighter", entityType: "class", data: MINI_CLASS },
      { slug: "fx_acolyte", entityType: "background", data: bgWithOwnChoice },
      { slug: "fx_magic-initiate", entityType: "feat", data: FIXTURE_FEAT },
      ...SPELLS,
    ]);
    const picks: Record<string, unknown> = {
      ...FULL_PICKS,
      "background:spell-list": "own-branch",     // the background's OWN bare choice
    };
    const { character } = new PCResolver(reg).resolve(charWithPicks(picks));
    const ledger = buildDecisionLedger(character, { registry: reg });

    const bareItem = ledger.origin.find((i) => i.key === "spell-list")!;
    const featItem = ledger.origin.find((i) => i.key === "feat:spell-list")!;
    expect(bareItem).toBeDefined();
    expect(featItem).toBeDefined();
    expect(bareItem.selected).toBe("own-branch"); // reads background:spell-list
    expect(featItem.selected).toBe("cleric");      // reads background:feat:spell-list
    expect(bareItem.source.kind).toBe("background");
    expect(featItem.source.kind).toBe("feat");
  });

  it("adds no origin feat items for a background whose origin feat carries no choices", () => {
    const plainFeat = { ...FIXTURE_FEAT, slug: "fx_alert", name: "Fixture Alert", choices: [] };
    const plainBg = {
      slug: "fx_criminal", name: "Fixture Criminal", edition: "2024",
      origin_feat: "[[Fixtures/Feats/Alert]]",
    };
    const reg = buildMockRegistry([
      { slug: "fx-fighter", entityType: "class", data: MINI_CLASS },
      { slug: "fx_criminal", entityType: "background", data: plainBg },
      { slug: "fx_alert", entityType: "feat", data: plainFeat },
    ]);
    const char = charWithPicks({});
    char.background = "[[fx_criminal]]";
    const { character } = new PCResolver(reg).resolve(char);
    const ledger = buildDecisionLedger(character, { registry: reg });
    expect(ledger.origin.some((i) => i.key.startsWith("feat:"))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P4-T3 · item→spell application pass. A Spell Scroll (an item carrying the T1
// `scroll_level` marker) whose equipment entry names a chosen spell via
// `overrides.spell` resolves into a castable ResolvedSpell{ source:"item" }. The
// casting ability is the character's OWN spellcasting ability when they have one,
// else the per-instance `overrides.spell_ability`, else undefined (never faked).
// `entryIndex` gives each scroll instance identity through the segmented dedupe.
// ─────────────────────────────────────────────────────────────────────────────

describe("PCResolver · item-granted spells (scroll → resolved.spells)", () => {
  const SCROLL_3RD = {
    slug: "srd-2024_spell-scroll-3rd-level", name: "Spell Scroll (3rd Level)",
    rarity: "uncommon", type: "scroll", scroll_level: 3,
  };
  const WIZARD_CLASS = {
    slug: "fx-wizard", name: "Wizard", hit_die: "d6",
    saving_throws: ["int", "wis"], features_by_level: {},
    spellcasting: { caster_type: "full", ability: "int", preparation: "prepared", spell_list: "wizard" },
    table: {},
  };
  const FIREBALL = {
    slug: "fx_fireball", entityType: "spell",
    data: { name: "Fireball", level: 3, classes: ["wizard"], edition: "2024" },
  };

  function buildScrollRegistry() {
    return buildMockRegistry([
      { slug: "fx-fighter", entityType: "class", data: MINI_CLASS },
      { slug: "fx-wizard", entityType: "class", data: WIZARD_CLASS },
      { slug: "srd-2024_spell-scroll-3rd-level", entityType: "item", data: SCROLL_3RD },
      FIREBALL,
    ]);
  }

  function scrollChar(className: string, equipment: unknown[], known: unknown[] = []): Character {
    return {
      name: "Scroll-Bearer", edition: "2024", race: null, subrace: null, background: null,
      class: [{ name: className, level: 5, subclass: null, choices: {} }],
      abilities: { str: 10, dex: 10, con: 10, int: 16, wis: 12, cha: 10 },
      ability_method: "manual", skills: { proficient: [], expertise: [] },
      spells: { known, overrides: [] }, equipment, overrides: {}, origin_choices: {},
      state: {
        hp: { current: 8, max: 8, temp: 0 }, hit_dice: {}, spell_slots: {},
        concentration: null, conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {},
      },
    } as unknown as Character;
  }

  it("resolves a scroll's chosen spell as source:item with the caster's own ability + entryIndex", () => {
    const ch = scrollChar("[[fx-wizard]]", [
      { item: "[[srd-2024_spell-scroll-3rd-level]]", overrides: { spell: "fx_fireball" } },
    ]);
    const { character } = new PCResolver(buildScrollRegistry()).resolve(ch);
    const item = character.spells.find((s) => s.source === "item");
    expect(item).toBeDefined();
    expect(item).toMatchObject({
      slug: "fx_fireball", classSlug: null, source: "item", prepared: true, alwaysPrepared: true,
    });
    expect(item!.ability).toBe("int"); // the wizard's OWN casting ability
    expect(item!.entryIndex).toBe(0);
    expect(item!.entity.name).toBe("Fireball");
  });

  it("a non-caster scroll uses overrides.spell_ability", () => {
    const ch = scrollChar("[[fx-fighter]]", [
      { item: "[[srd-2024_spell-scroll-3rd-level]]", overrides: { spell: "fx_fireball", spell_ability: "wis" } },
    ]);
    const { character } = new PCResolver(buildScrollRegistry()).resolve(ch);
    const item = character.spells.find((s) => s.source === "item");
    expect(item).toBeDefined();
    expect(item!.ability).toBe("wis");
    expect(item!.entryIndex).toBe(0);
  });

  it("leaves a no-ability scroll ability-less (never fabricates an ability)", () => {
    const ch = scrollChar("[[fx-fighter]]", [
      { item: "[[srd-2024_spell-scroll-3rd-level]]", overrides: { spell: "fx_fireball" } },
    ]);
    const { character } = new PCResolver(buildScrollRegistry()).resolve(ch);
    const item = character.spells.find((s) => s.source === "item");
    expect(item).toBeDefined();
    expect(item!.ability ?? null).toBeNull();
  });

  // Character-level fallback: a non-caster with no per-scroll spell_ability but a
  // character-level overrides.spellcasting_ability casts the scroll with that ability.
  it("a non-caster scroll falls back to character-level overrides.spellcasting_ability", () => {
    const ch = scrollChar("[[fx-fighter]]", [
      { item: "[[srd-2024_spell-scroll-3rd-level]]", overrides: { spell: "fx_fireball" } },
    ]);
    ch.overrides = { spellcasting_ability: "wis" };
    const { character } = new PCResolver(buildScrollRegistry()).resolve(ch);
    const item = character.spells.find((s) => s.source === "item");
    expect(item).toBeDefined();
    expect(item!.ability).toBe("wis");
  });

  // Precedence: a per-scroll spell_ability wins over the character-level fallback.
  it("a per-scroll spell_ability still wins over the character-level fallback", () => {
    const ch = scrollChar("[[fx-fighter]]", [
      { item: "[[srd-2024_spell-scroll-3rd-level]]", overrides: { spell: "fx_fireball", spell_ability: "int" } },
    ]);
    ch.overrides = { spellcasting_ability: "wis" };
    const { character } = new PCResolver(buildScrollRegistry()).resolve(ch);
    const item = character.spells.find((s) => s.source === "item");
    expect(item!.ability).toBe("int");
  });

  // Precedence: a caster's OWN class ability still wins over the character-level fallback.
  it("a caster still uses its own class ability over the character-level fallback", () => {
    const ch = scrollChar("[[fx-wizard]]", [
      { item: "[[srd-2024_spell-scroll-3rd-level]]", overrides: { spell: "fx_fireball" } },
    ]);
    ch.overrides = { spellcasting_ability: "wis" };
    const { character } = new PCResolver(buildScrollRegistry()).resolve(ch);
    const item = character.spells.find((s) => s.source === "item");
    expect(item!.ability).toBe("int");
  });

  it("keeps a scroll of a class-known spell as its own item row (class copy + item copy both present)", () => {
    const ch = scrollChar(
      "[[fx-wizard]]",
      [{ item: "[[srd-2024_spell-scroll-3rd-level]]", overrides: { spell: "fx_fireball" } }],
      ["[[fx_fireball]]"], // also known as a class spell
    );
    const { character } = new PCResolver(buildScrollRegistry()).resolve(ch);
    const fireballs = character.spells.filter((s) => s.slug === "fx_fireball");
    expect(fireballs).toHaveLength(2);
    expect(fireballs.some((s) => s.source === "class")).toBe(true);
    expect(fireballs.some((s) => s.source === "item")).toBe(true);
  });

  it("keeps two scrolls of the same spell as two rows (entryIndex 0 and 1)", () => {
    const ch = scrollChar("[[fx-wizard]]", [
      { item: "[[srd-2024_spell-scroll-3rd-level]]", overrides: { spell: "fx_fireball" } },
      { item: "[[srd-2024_spell-scroll-3rd-level]]", overrides: { spell: "fx_fireball" } },
    ]);
    const { character } = new PCResolver(buildScrollRegistry()).resolve(ch);
    const items = character.spells.filter((s) => s.source === "item");
    expect(items).toHaveLength(2);
    expect(items.map((s) => s.entryIndex).sort()).toEqual([0, 1]);
  });

  it("ignores a non-scroll item carrying overrides.spell (no scroll_level marker)", () => {
    const reg = buildMockRegistry([
      { slug: "fx-wizard", entityType: "class", data: WIZARD_CLASS },
      { slug: "srd-2024_wand", entityType: "item", data: { slug: "srd-2024_wand", name: "Plain Wand", rarity: "common" } },
      FIREBALL,
    ]);
    const ch = scrollChar("[[fx-wizard]]", [
      { item: "[[srd-2024_wand]]", overrides: { spell: "fx_fireball" } },
    ]);
    const { character } = new PCResolver(reg).resolve(ch);
    expect(character.spells.filter((s) => s.source === "item")).toHaveLength(0);
  });

  it("warns and skips a scroll whose chosen spell is unresolvable", () => {
    const ch = scrollChar("[[fx-wizard]]", [
      { item: "[[srd-2024_spell-scroll-3rd-level]]", overrides: { spell: "fx_ghost-spell" } },
    ]);
    const { character, warnings } = new PCResolver(buildScrollRegistry()).resolve(ch);
    expect(character.spells.filter((s) => s.source === "item")).toHaveLength(0);
    expect(warnings.some((w) => w.includes("fx_ghost-spell"))).toBe(true);
  });

  // Site 3 (R3-P4): a caster's per-class spellcasting_ability override drives the
  // scroll's own-ability fallback (not the class data ability). Red-driver.
  it("a caster's per-class ability override drives the scroll's own-ability fallback", () => {
    const ch = scrollChar("[[fx-wizard]]", [
      { item: "[[srd-2024_spell-scroll-3rd-level]]", overrides: { spell: "fx_fireball" } },
    ]);
    ch.overrides = { spellcasting_ability_by_class: { "fx-wizard": "cha" } };
    const { character } = new PCResolver(buildScrollRegistry()).resolve(ch);
    const item = character.spells.find((s) => s.source === "item");
    expect(item).toBeDefined();
    expect(item!.ability).toBe("cha"); // the per-class override, not the wizard's INT
  });

  // C1 gating guard (Gate-1 finding): a NON-caster class carrying a per-class
  // override key must NOT be promoted to first caster. A [fx-fighter, fx-wizard]
  // character with an fx-fighter override key still casts scrolls with the wizard's
  // own INT, never the fighter's "str". Already green pre-change: a regression guard.
  it("C1 guard: a non-caster override key never promotes the non-caster over the real caster", () => {
    const base = scrollChar("[[fx-wizard]]", [
      { item: "[[srd-2024_spell-scroll-3rd-level]]", overrides: { spell: "fx_fireball" } },
    ]);
    const ch = {
      ...base,
      class: [
        { name: "[[fx-fighter]]", level: 5, subclass: null, choices: {} },
        { name: "[[fx-wizard]]", level: 5, subclass: null, choices: {} },
      ],
      overrides: { spellcasting_ability_by_class: { "fx-fighter": "str" } },
    } as unknown as Character;
    const { character } = new PCResolver(buildScrollRegistry()).resolve(ch);
    const item = character.spells.find((s) => s.source === "item");
    expect(item).toBeDefined();
    expect(item!.ability).toBe("int"); // wizard's own ability; never the fighter's "str"
  });
});

/**
 * R4-G4 §8 e2e · the five bundle entities this case needs, copied BYTE-VERBATIM out of the fenced
 * yaml block of the file named on each const, as the shipped plugin bundle held them on 2026-09-05.
 *
 * Why copies and not the real files: this suite lives in the dnd5e package, which ships to npm and does
 * not contain `.compendium-bundle` at all. Reading it would need a hard-coded absolute path into a sibling
 * working copy, and NO dnd5e test reads outside its own repo. The in-repo precedent is
 * `tests/feature-alias-action-cost.test.ts`'s BUNDLE_CARRIERS, which copies its blocks verbatim and names the
 * source file in a comment; this follows it. What that costs, stated plainly: nothing here can notice the
 * bundle changing; every assertion below is about the cascade applied to the blocks as copied.
 */
// source: `.compendium-bundle/SRD 2024/Backgrounds/Acolyte.md`
const ACOLYTE_YAML = String.raw`
slug: srd-2024_background_acolyte
name: Acolyte
edition: '2024'
source: SRD 5.2
description: ''
skill_proficiencies:
  - insight
  - religion
tool_proficiencies:
  - kind: fixed
    items:
      - calligrapher's-supplies
language_proficiencies:
  - kind: fixed
    languages:
      - common
equipment:
  - kind: choice
    options:
      - label: Calligrapher's Supplies, Book (Prayers), Holy Symbol, 10 sheets Parchment, Robe, and 8 GP
        grants:
          - gold: 8
      - label: 50 GP
        grants:
          - gold: 50
feature:
  name: Background Feature
  description: (No description provided.)
ability_score_increases:
  pool:
    - int
    - wis
    - cha
origin_feat: '[[SRD 2024/Feats/Magic Initiate (Cleric)]]'
suggested_characteristics: null
choices:
  - kind: ability-points
    id: abilities
    points: 3
    max_per: 2
    pool:
      - int
      - wis
      - cha
  - kind: select-proficiency
    id: languages
    count: 2
    domain: language
`;
// source: `.compendium-bundle/SRD 2024/Feats/Magic Initiate.md`
const SRD_MI_YAML = String.raw`
slug: srd-2024_feat_magic-initiate
name: Magic Initiate
edition: '2024'
source: SRD 5.2
description: You gain the following benefits.
category: origin
prerequisites: []
benefits:
  - You learn two cantrips of your choice from the Cleric, Druid, or Wizard spell list. Intelligence, Wisdom, or Charisma is your spellcasting ability for this feat's spells (choose when you select this feat).
  - Choose a level 1 spell from the same list you selected for this feat's cantrips. You always have that spell prepared. You can cast it once without a spell slot, and you regain the ability to cast it in that way when you finish a Long Rest. You can also cast the spell using any spell slots you have.
  - Whenever you gain a new level, you can replace one of the spells you chose for this feat with a different spell of the same level from the chosen spell list.
  - You can take this feat more than once, but you must choose a different spell list each time.
repeatable: true
effects: []
grants_asi: null
choices:
  - kind: select-inline
    id: spell-list
    count: 1
    options:
      - value: cleric
        label: Cleric
        choices:
          - kind: select-entity
            id: mi-cantrips
            count: 2
            entity_type: spell
            where:
              list: cleric
              level: 0
              edition: '2024'
          - kind: select-entity
            id: mi-level1
            count: 1
            entity_type: spell
            where:
              list: cleric
              level: 1
              edition: '2024'
      - value: druid
        label: Druid
        choices:
          - kind: select-entity
            id: mi-cantrips
            count: 2
            entity_type: spell
            where:
              list: druid
              level: 0
              edition: '2024'
          - kind: select-entity
            id: mi-level1
            count: 1
            entity_type: spell
            where:
              list: druid
              level: 1
              edition: '2024'
      - value: wizard
        label: Wizard
        choices:
          - kind: select-entity
            id: mi-cantrips
            count: 2
            entity_type: spell
            where:
              list: wizard
              level: 0
              edition: '2024'
          - kind: select-entity
            id: mi-level1
            count: 1
            entity_type: spell
            where:
              list: wizard
              level: 1
              edition: '2024'
  - kind: select-inline
    id: spellcasting-ability
    count: 1
    options:
      - value: int
        label: Intelligence
      - value: wis
        label: Wisdom
      - value: cha
        label: Charisma
`;
// source: `.compendium-bundle/SRD 2024/Spells/Guidance.md`
const GUIDANCE_YAML = String.raw`
slug: srd-2024_spell_guidance
name: Guidance
edition: '2024'
source: SRD 5.2
level: 0
school: divination
casting_time: action
range: Touch
components: V, S
duration: 1 minute
concentration: true
ritual: false
description: You touch a willing creature and choose a skill. Until the spell ends, the creature adds 1d4 to any ability check using the chosen skill.
classes:
  - cleric
  - druid
`;
// source: `.compendium-bundle/SRD 2024/Spells/Sacred Flame.md`
const SACRED_FLAME_YAML = String.raw`
slug: srd-2024_spell_sacred-flame
name: Sacred Flame
edition: '2024'
source: SRD 5.2
level: 0
school: evocation
casting_time: action
range: 60 feet
components: V, S
duration: instantaneous
concentration: false
ritual: false
description: Flame-like radiance descends on a creature that you can see within range. The target must succeed on a Dexterity saving throw or take 1d8 Radiant damage. The target gains no benefit from Half Cover or Three-Quarters Cover for this save.
classes:
  - cleric
at_higher_levels:
  - The damage increases by 1d8 when you reach levels 5 (2d8), 11 (3d8), and 17 (4d8).
damage:
  types:
    - radiant
saving_throw:
  ability: dexterity
casting_options:
  - type: player_level_5
    damage_roll: 2d8
  - type: player_level_11
    damage_roll: 3d8
  - type: player_level_17
    damage_roll: 4d8
`;
// source: `.compendium-bundle/SRD 2024/Spells/Bless.md`
const BLESS_YAML = String.raw`
slug: srd-2024_spell_bless
name: Bless
edition: '2024'
source: SRD 5.2
level: 1
school: enchantment
casting_time: action
range: 30 feet
components: V, S, M (a Holy Symbol worth 5+ GP)
duration: 1 minute
concentration: true
ritual: false
description: You bless up to three creatures within range. Whenever a target makes an attack roll or a saving throw before the spell ends, the target adds 1d4 to the attack roll or save.
classes:
  - cleric
  - paladin
at_higher_levels:
  - You can target one additional creature for each spell slot level above 1.
casting_options:
  - type: slot_level_2
    target_count: 2
  - type: slot_level_3
    target_count: 3
  - type: slot_level_4
    target_count: 4
  - type: slot_level_5
    target_count: 5
  - type: slot_level_6
    target_count: 6
  - type: slot_level_7
    target_count: 7
  - type: slot_level_8
    target_count: 8
  - type: slot_level_9
    target_count: 9
`;

describe("R4-G4 §8 e2e (the RED the .cjs measured 2026-09-04): a PHB 2024 'Magic Initiate; Cleric' beside the bundle", () => {
  // The registry entries carry `compendium` + `filePath` because the cascade's tiers 2-5 read them (§8.2).
  const ent = (slug: string, name: string, entityType: string, compendium: string, filePath: string, data: unknown) =>
    ({ slug, name, entityType, compendium, filePath, data, readonly: true, homebrew: false });
  const acolyte = ent("srd-2024_background_acolyte", "Acolyte", "background", "SRD 2024", "Compendium/SRD 2024/Backgrounds/Acolyte.md", yaml.load(ACOLYTE_YAML));
  const srdMI = ent("srd-2024_feat_magic-initiate", "Magic Initiate", "feat", "SRD 2024", "Compendium/SRD 2024/Feats/Magic Initiate.md", yaml.load(SRD_MI_YAML));
  const spells = ([
    ["srd-2024_spell_guidance", "Guidance", GUIDANCE_YAML],
    ["srd-2024_spell_sacred-flame", "Sacred Flame", SACRED_FLAME_YAML],
    ["srd-2024_spell_bless", "Bless", BLESS_YAML],
  ] as const).map(([slug, name, y]) => ent(slug, name, "spell", "SRD 2024", `Compendium/SRD 2024/Spells/${name}.md`, yaml.load(y)));
  // the PHB entry: a bundle-level feat with EMPTY choices (what the converter emits for the per-list variants)
  const phbMIC = ent("players-handbook-2024_feat_magic-initiate-cleric", "Magic Initiate; Cleric", "feat", "Player's Handbook (2024)",
    "Compendium/Player's Handbook (2024)/Feats/Magic Initiate; Cleric.md",
    { slug: "players-handbook-2024_feat_magic-initiate-cleric", name: "Magic Initiate; Cleric", description: "", choices: [] });
  // verbatim from research/C-red-originfeat-e2e.cjs (the fighter is a stub; the character is the Acolyte with the three picks)
  const fighter = ent("srd-2024_class_fighter", "Fighter", "class", "SRD 2024", "F",
    { slug: "srd-2024_class_fighter", name: "Fighter", skill_choices: { count: 0, from: [] }, features_by_level: {}, starting_equipment: [] });
  const character = () => ({
    name: "T", edition: "2024", race: null, subrace: null, background: "[[srd-2024_background_acolyte]]",
    class: [{ name: "[[srd-2024_class_fighter]]", level: 1, subclass: null, choices: {} }],
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, ability_method: "manual",
    skills: { proficient: [], expertise: [] }, spells: { known: [], overrides: [] }, equipment: [], overrides: {},
    origin_choices: {
      "background:feat:spell-list": "cleric",
      "background:feat:mi-cantrips": [spells[0].slug, spells[1].slug],
      "background:feat:mi-level1": spells[2].slug,
      "background:feat:spellcasting-ability": "wis",
    },
    state: { hp: { current: 1, max: 1, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [], exhaustion: 0, inspiration: 0, feature_uses: {} },
  }) as unknown as Character;
  const run = (extra: unknown[]) =>
    new PCResolver(buildMockRegistry([acolyte, srdMI, fighter, ...spells, ...extra] as never)).resolve(character());

  it("CONTROL: bundle only, the three feat spells resolve", () => {
    expect(run([]).character.spells.filter((s) => s.source === "feat")).toHaveLength(3);
  });

  it("RED FIRST: with the PHB entry registered the three feat spells SURVIVE and no warning is raised", () => {
    const { character: r, warnings } = run([phbMIC]);
    expect(r.spells.filter((s) => s.source === "feat")).toHaveLength(3);   // today: 0, silently
    expect(warnings).toHaveLength(0);
  });
});
