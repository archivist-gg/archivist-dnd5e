import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import * as resolverModule from "../src/pc/pc.resolver";
import { PCResolver, stripSlug, collectFeatPicks, resolveOriginFeat } from "../src/pc/pc.resolver";
import { buildMockRegistry } from "./mock-entity-registry";
import { resolveResourceIndex } from "../src/pc/pc.resources";
import { featureEffectSchema } from "@archivist-gg/dnd5e/schemas/feature-effect-schema";
import type { Character } from "../src/pc/pc.types";

const ALERT_FEAT = { slug: "alert", name: "Alert", description: "You can't be surprised." };

const DEFENSE_OF = {
  slug: "srd-2024_defense", name: "Defense", feature_type: "fighting_style",
  description: "+1 to initiative while wearing armor.",
  available_to: ["[[SRD 2024/Classes/Fighter]]"],
  effects: [{ kind: "initiative-bonus", value: 1 }],
};

// Fighter with a fighting-style decision at L1 (select-entity → optional-feature)
// and an asi-or-feat decision at L4 (nested feat select-entity).
const STYLED_FIGHTER = {
  slug: "fighter", name: "Fighter", hit_die: "d10",
  saving_throws: ["str", "con"],
  features_by_level: {
    1: [{
      id: "fighting-style", name: "Fighting Style", description: "Choose one.",
      choices: [{ kind: "select-entity", id: "fighting-style", count: 1,
        entity_type: "optional-feature", where: { feature_type: "fighting_style", available_to: "self" } }],
    }],
    4: [{
      id: "ability-score-improvement", name: "Ability Score Improvement", description: "ASI or feat.",
      choices: [{ kind: "select-inline", id: "asi-or-feat", count: 1, options: [
        { value: "asi", label: "ASI" },
        { value: "feat", label: "Feat", choices: [{ kind: "select-entity", id: "feat", entity_type: "feat", count: 1 }] },
      ] }],
    }],
  },
};

// Second class with its own L1 fighting-style decision, to test multiclass grant scoping.
const STYLED_RANGER = {
  slug: "ranger", name: "Ranger", hit_die: "d10",
  saving_throws: ["str", "dex"],
  features_by_level: {
    1: [{
      id: "ranger-style", name: "Ranger Style", description: "Choose one.",
      choices: [{ kind: "select-entity", id: "ranger-style", count: 1,
        entity_type: "optional-feature", where: { feature_type: "fighting_style", available_to: "self" } }],
    }],
  },
};

const DUELING_OF = {
  slug: "srd-2024_dueling", name: "Dueling", feature_type: "fighting_style",
  description: "+2 damage with a one-handed weapon.",
  available_to: ["[[SRD 2024/Classes/Ranger]]"],
  effects: [{ kind: "damage-bonus", damage_type: "weapon", amount: "2" }],
};

const BLADESWORN = {
  slug: "bladesworn",
  name: "Bladesworn",
  edition: "2014",
  hit_die: "d10",
  primary_abilities: ["str"],
  saving_throws: ["str", "con"],
  features_by_level: {
    1: [{ name: "Sworn Blade", description: "Your weapon is bound to you." }],
    2: [{ name: "Oath Strike", description: "Extra damage once per turn." }],
    3: [{ name: "Subclass Feature", description: "Choose a subclass." }],
    5: [{ name: "Extra Attack", description: "Attack twice per Attack action." }],
  },
};

const HILL_FOLK = {
  slug: "hill-folk",
  name: "Hill Folk",
  edition: "2014",
  size: "Medium",
  speed: { walk: 25 },
  vision: { darkvision: 60 },
  traits: [
    { name: "Stonecunning", description: "You know stone." },
    { name: "Hill Sturdiness", description: "+1 HP per level." },
  ],
  ability_bonuses: { con: 2, wis: 1 },
};

const DRIFTER = {
  slug: "drifter",
  name: "Drifter",
  edition: "2014",
  feature: { name: "Wanderer's Way", description: "Travel is easy." },
  proficiencies: { skills: ["survival", "insight"], tools: [], languages: [] },
};

// Illrigger-style "Combat Mastery" — a class feature carrying a select-inline
// pick. Three option shapes exercise the #3 parent-fold: one WITH effects
// (Lies → CHA weapon-ability, emitted as a synthetic), one prose-only (Bravado,
// no effects → no synthetic), and one empty (Silence — neither description nor
// effects).
const COMBAT_MASTER = {
  slug: "illrigger", name: "Illrigger", hit_die: "d10", saving_throws: ["con", "cha"],
  features_by_level: {
    1: [{
      id: "combat-mastery", name: "Combat Mastery", description: "Choose a mastery.",
      choices: [{ kind: "select-inline", id: "combat-mastery", options: [
        { value: "lies", label: "Lies",
          description: "Use Charisma for melee attack & damage.",
          effects: [{ kind: "weapon-ability", ability: "cha" }] },
        { value: "bravado", label: "Bravado", description: "Gain menacing flair." },
        { value: "silence", label: "Silence" },
      ] }],
    }],
  },
};

// D2-3(ii) origin-feat pipeline fixtures. The 4 SRD-2024 backgrounds each name a
// FIXED origin feat via a PATH-style wikilink; the resolver must fold it into the
// SAME feat pipeline chosen feats use. Backgrounds are minimal — resolve() reads
// only `slug` + `origin_feat` (feature/choices omitted → no-op branches).
const SAVAGE_ATTACKER_FEAT = {
  slug: "srd-2024_savage-attacker", name: "Savage Attacker",
  description: "Once per turn, reroll the damage dice of a weapon attack and use either total.",
};
const MAGIC_INITIATE_FEAT = {
  slug: "srd-2024_magic-initiate", name: "Magic Initiate",
  description: "You learn two cantrips and a level 1 spell of your choice.",
};
const SOLDIER_BG = { slug: "soldier", name: "Soldier", edition: "2024", origin_feat: "[[SRD 2024/Feats/Savage Attacker]]" };
const ACOLYTE_BG = { slug: "acolyte", name: "Acolyte", edition: "2024", origin_feat: "[[SRD 2024/Feats/Magic Initiate (Cleric)]]" };
const CRIMINAL_BG = { slug: "criminal", name: "Criminal", edition: "2024", origin_feat: "[[SRD 2024/Feats/Alert]]" };

describe("fixture effects are schema-valid", () => {
  it("optional-feature + inline-branch fixtures parse against featureEffectSchema", () => {
    for (const eff of [...DEFENSE_OF.effects, ...DUELING_OF.effects]) {
      expect(() => featureEffectSchema.parse(eff)).not.toThrow();
    }
    expect(() => featureEffectSchema.parse({ kind: "speed-bonus", mode: "walk", value: 5 })).not.toThrow();
  });
});

describe("stripSlug", () => {
  it("removes wikilink brackets", () => {
    expect(stripSlug("[[rogue]]")).toBe("rogue");
  });
  it("passes through bare slug", () => {
    expect(stripSlug("rogue")).toBe("rogue");
  });
  it("returns null for null input", () => {
    expect(stripSlug(null)).toBeNull();
  });
});

// R4-G7 T8 fix round 1 (wave D review Minor 6, ruled): `collectFeatSlugs` had no production caller after RIDER-23 (`resolve`
// reads `collectFeatPicks`, which keeps each pick's slot), so it is retired and its tests read the picks' slugs.
describe("collectFeatSlugs is retired", () => {
  it("the resolver module no longer exports it, and no source file or overlay still names it", () => {
    expect(Object.keys(resolverModule)).not.toContain("collectFeatSlugs");
    const root = path.join(__dirname, "..");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|yaml)$/.test(name)) files.push(full);
      }
    };
    walk(path.join(root, "src"));
    walk(path.join(root, "tools", "srd-canonical", "overlays"));
    const naming = files.filter((f) => readFileSync(f, "utf8").includes("collectFeatSlugs")).map((f) => path.relative(root, f));
    expect(naming).toEqual([]);
  });
});

describe("collectFeatPicks · the slugs", () => {
  const slugs = (char: Character): string[] => collectFeatPicks(char).map((p) => p.slug);
  it("pulls feat slugs from class choices", () => {
    const char: Character = minimalCharacter();
    char.class[0].choices = { 4: { feat: "[[sure-step]]" }, 8: { feat: "[[deft-strike]]" } };
    expect(slugs(char).sort()).toEqual(["deft-strike", "sure-step"]);
  });
  it("deduplicates", () => {
    const char: Character = minimalCharacter();
    char.class[0].choices = { 4: { feat: "[[sure-step]]" }, 8: { feat: "[[sure-step]]" } };
    expect(slugs(char)).toEqual(["sure-step"]);
  });

  // CHARACTERISATION LOCK, not proof of R4-P4's epic-boon re-key. This reader
  // keys on the literal `feat` string at any level, so it passed identically
  // before and after that re-key: the authored id it fixes is inert until the
  // SRD regeneration. What genuinely reds on the un-re-keyed file is the real
  // overlay assertion in tests/srd-canonical/sources/overlay-schema.test.ts.
  // This locks the reader half of the contract the re-key targets: an L19
  // block keyed `feat` resolves, and its `feat:<child>` grandchild key sits
  // beside it without being mistaken for the pick. `toEqual` on the WHOLE
  // array, not `toContain`, is what makes the second half real: `toContain`
  // stays green against a prefix-scanning reader that also returns the
  // grandchild (measured: `["srd-2024_feat_boon-of-fate", "[object Object]"]`).
  it("(characterisation) a level-19 block keyed `feat` resolves the boon, and only the boon", () => {
    const char = minimalCharacter();
    char.class[0].choices = { 19: { feat: "srd-2024_feat_boon-of-fate", "feat:asi": { cha: 1 } } };
    expect(slugs(char)).toEqual(["srd-2024_feat_boon-of-fate"]);
  });
});

describe("PCResolver", () => {
  it("happy path: resolves race/class/background; totalLevel matches", () => {
    const reg = buildMockRegistry([
      { slug: "hill-folk", entityType: "race", data: HILL_FOLK },
      { slug: "bladesworn", entityType: "class", data: BLADESWORN },
      { slug: "drifter", entityType: "background", data: DRIFTER },
    ]);
    const resolver = new PCResolver(reg);
    const char = minimalCharacter();
    char.race = "[[hill-folk]]";
    char.background = "[[drifter]]";

    const { character, warnings } = resolver.resolve(char);
    expect(warnings).toEqual([]);
    expect(character.race?.slug).toBe("hill-folk");
    expect(character.background?.slug).toBe("drifter");
    expect(character.classes[0].entity?.slug).toBe("bladesworn");
    expect(character.totalLevel).toBe(3);
  });

  it("warns on missing slug", () => {
    const reg = buildMockRegistry([]);
    const char = minimalCharacter();
    char.race = "[[ghost-elf]]";
    const { warnings } = new PCResolver(reg).resolve(char);
    expect(warnings.some((w) => w.includes("ghost-elf"))).toBe(true);
  });

  it("warns when slug resolves but with wrong entityType", () => {
    const reg = buildMockRegistry([
      { slug: "bladesworn", entityType: "class", data: BLADESWORN },
    ]);
    const char = minimalCharacter();
    char.race = "[[bladesworn]]"; // wrong type
    const { warnings, character } = new PCResolver(reg).resolve(char);
    expect(character.race).toBeNull();
    expect(warnings.some((w) => w.includes("bladesworn") && w.includes("race"))).toBe(true);
  });

  it("level-filters class features to characterLevel", () => {
    const reg = buildMockRegistry([
      { slug: "bladesworn", entityType: "class", data: BLADESWORN },
    ]);
    const char = minimalCharacter();
    char.class[0].level = 3;
    const { character } = new PCResolver(reg).resolve(char);
    const classFeatureNames = character.features
      .filter((rf) => rf.source.kind === "class")
      .map((rf) => rf.feature.name)
      .sort();
    // Level 1, 2, 3 features present; Level 5 Extra Attack filtered out.
    expect(classFeatureNames).toContain("Sworn Blade");
    expect(classFeatureNames).toContain("Oath Strike");
    expect(classFeatureNames).toContain("Subclass Feature");
    expect(classFeatureNames).not.toContain("Extra Attack");
  });

  it("collects race traits with source { kind: 'race' }", () => {
    const reg = buildMockRegistry([
      { slug: "hill-folk", entityType: "race", data: HILL_FOLK },
      { slug: "bladesworn", entityType: "class", data: BLADESWORN },
    ]);
    const char = minimalCharacter();
    char.race = "[[hill-folk]]";
    const { character } = new PCResolver(reg).resolve(char);
    const raceFeatures = character.features.filter((rf) => rf.source.kind === "race");
    expect(raceFeatures.map((rf) => rf.feature.name).sort()).toEqual(["Hill Sturdiness", "Stonecunning"]);
  });

  it("multiclass: totalLevel sums class levels", () => {
    const reg = buildMockRegistry([
      { slug: "bladesworn", entityType: "class", data: BLADESWORN },
    ]);
    const char = minimalCharacter();
    char.class = [
      { name: "[[bladesworn]]", level: 5, subclass: null, choices: {} },
      { name: "[[bladesworn]]", level: 2, subclass: null, choices: {} },
    ];
    const { character } = new PCResolver(reg).resolve(char);
    expect(character.totalLevel).toBe(7);
  });

  it("resolves a feat chosen via the nested asi-or-feat convention", () => {
    const reg = buildMockRegistry([
      { slug: "fighter", entityType: "class", data: STYLED_FIGHTER },
      { slug: "alert", entityType: "feat", data: ALERT_FEAT },
    ]);
    const char = minimalCharacter();
    char.class = [{ name: "[[fighter]]", level: 4, subclass: null,
      choices: { 4: { "asi-or-feat": "feat", feat: "alert" } } }];
    const { character } = new PCResolver(reg).resolve(char);
    expect(character.feats.map((f) => f.slug)).toContain("alert");
    expect(character.features.some((rf) => rf.source.kind === "feat" && rf.feature.name === "Alert")).toBe(true);
  });

  it("synthesizes a selected fighting-style optional-feature into resolved features with its effects", () => {
    const reg = buildMockRegistry([
      { slug: "fighter", entityType: "class", data: STYLED_FIGHTER },
      { slug: "srd-2024_defense", entityType: "optional-feature", data: DEFENSE_OF },
    ]);
    const char = minimalCharacter();
    char.class = [{ name: "[[fighter]]", level: 1, subclass: null,
      choices: { 1: { "fighting-style": "srd-2024_defense" } } }];
    const { character } = new PCResolver(reg).resolve(char);
    const synth = character.features.find((rf) => rf.feature.name === "Defense");
    expect(synth).toBeDefined();
    expect(synth!.feature.effects).toEqual([{ kind: "initiative-bonus", value: 1 }]);
    expect(synth!.source.kind).toBe("class");
  });

  it("synthesizes select-inline branch effects when its option is chosen", () => {
    const inlineStyleFighter = {
      slug: "fighter", name: "Fighter", hit_die: "d10", saving_throws: ["str", "con"],
      features_by_level: {
        1: [{
          id: "creed", name: "Creed", description: "Pick a creed.",
          choices: [{ kind: "select-inline", id: "creed", options: [
            { value: "valor", label: "Valor", description: "Bold.", effects: [{ kind: "speed-bonus", mode: "walk", value: 5 }] },
          ] }],
        }],
      },
    };
    const reg = buildMockRegistry([{ slug: "fighter", entityType: "class", data: inlineStyleFighter }]);
    const char = minimalCharacter();
    char.class = [{ name: "[[fighter]]", level: 1, subclass: null, choices: { 1: { creed: "valor" } } }];
    const { character } = new PCResolver(reg).resolve(char);
    const synth = character.features.find((rf) => rf.feature.name === "Valor");
    expect(synth).toBeDefined();
    expect(synth!.feature.effects).toEqual([{ kind: "speed-bonus", mode: "walk", value: 5 }]);
    // #3: the effect-carrying synthetic is render-suppressed (its prose surfaces
    // on the parent via chosenInline) while remaining present for the effects fold.
    expect(synth!.renderSuppressed).toBe(true);
  });

  it("#3: folds a chosen select-inline option (with effects) onto the parent AND suppresses the synthetic", () => {
    const reg = buildMockRegistry([{ slug: "illrigger", entityType: "class", data: COMBAT_MASTER }]);
    const char = minimalCharacter();
    char.class = [{ name: "[[illrigger]]", level: 1, subclass: null, choices: { 1: { "combat-mastery": "lies" } } }];
    const { character } = new PCResolver(reg).resolve(char);

    // Parent feature carries the chosen option's prose for render (shallow copy —
    // never written onto the shared registry entity).
    const parent = character.features.find((rf) => rf.feature.name === "Combat Mastery");
    expect(parent).toBeDefined();
    expect(parent!.chosenInline).toEqual([{ label: "Lies", description: "Use Charisma for melee attack & damage." }]);

    // The effect-carrying synthetic STAYS in resolved.features (its effects still
    // fold in recalc) but is render-suppressed so the sheet does not double-list it.
    const synth = character.features.find((rf) => rf.feature.id === "combat-mastery-lies");
    expect(synth).toBeDefined();
    expect(synth!.feature.name).toBe("Lies");
    expect(synth!.feature.effects).toEqual([{ kind: "weapon-ability", ability: "cha" }]);
    expect(synth!.renderSuppressed).toBe(true);
  });

  it("#3: folds a prose-only select-inline pick (no effects → no synthetic) onto the parent", () => {
    const reg = buildMockRegistry([{ slug: "illrigger", entityType: "class", data: COMBAT_MASTER }]);
    const char = minimalCharacter();
    char.class = [{ name: "[[illrigger]]", level: 1, subclass: null, choices: { 1: { "combat-mastery": "bravado" } } }];
    const { character } = new PCResolver(reg).resolve(char);

    const parent = character.features.find((rf) => rf.feature.name === "Combat Mastery");
    expect(parent!.chosenInline).toEqual([{ label: "Bravado", description: "Gain menacing flair." }]);
    // A prose-only option carries no effects, so no synthetic is emitted — the
    // fold is the ONLY way its prose reaches the sheet.
    expect(character.features.some((rf) => rf.feature.name === "Bravado")).toBe(false);
  });

  it("#3: folds an empty select-inline pick (no description, no effects) as label-only", () => {
    const reg = buildMockRegistry([{ slug: "illrigger", entityType: "class", data: COMBAT_MASTER }]);
    const char = minimalCharacter();
    char.class = [{ name: "[[illrigger]]", level: 1, subclass: null, choices: { 1: { "combat-mastery": "silence" } } }];
    const { character } = new PCResolver(reg).resolve(char);

    const parent = character.features.find((rf) => rf.feature.name === "Combat Mastery");
    expect(parent!.chosenInline).toEqual([{ label: "Silence", description: undefined }]);
    expect(character.features.some((rf) => rf.feature.name === "Silence")).toBe(false);
  });

  it("multiclass: each class's selected optional-feature is scoped to its OWNING class slug", () => {
    const reg = buildMockRegistry([
      { slug: "fighter", entityType: "class", data: STYLED_FIGHTER },
      { slug: "ranger", entityType: "class", data: STYLED_RANGER },
      { slug: "srd-2024_defense", entityType: "optional-feature", data: DEFENSE_OF },
      { slug: "srd-2024_dueling", entityType: "optional-feature", data: DUELING_OF },
    ]);
    const char = minimalCharacter();
    char.class = [
      { name: "[[fighter]]", level: 1, subclass: null,
        choices: { 1: { "fighting-style": "srd-2024_defense" } } },
      { name: "[[ranger]]", level: 1, subclass: null,
        choices: { 1: { "ranger-style": "srd-2024_dueling" } } },
    ];
    const { character } = new PCResolver(reg).resolve(char);

    const defense = character.features.find((rf) => rf.feature.name === "Defense");
    const dueling = character.features.find((rf) => rf.feature.name === "Dueling");
    expect(defense).toBeDefined();
    expect(dueling).toBeDefined();

    // Each synthesized feature is pinned to its OWNING class's entity slug.
    expect(defense!.source.kind).toBe("class");
    expect((defense!.source as { slug: string }).slug).toBe("fighter");
    expect(dueling!.source.kind).toBe("class");
    expect((dueling!.source as { slug: string }).slug).toBe("ranger");

    // #3 scoping lock: select-entity optional-features are LEGITIMATE visible
    // rows — they must NOT be render-suppressed (only select-inline synthetics are).
    expect(defense!.renderSuppressed).toBeFalsy();
    expect(dueling!.renderSuppressed).toBeFalsy();

    // Neither class's selection produces a grant from the other's features:
    // exactly one synthesized feature per owning class, none cross-attributed.
    const synthesized = character.features.filter(
      (rf) => rf.feature.name === "Defense" || rf.feature.name === "Dueling");
    expect(synthesized).toHaveLength(2);
    expect(synthesized.filter((rf) => (rf.source as { slug: string }).slug === "fighter")
      .map((rf) => rf.feature.name)).toEqual(["Defense"]);
    expect(synthesized.filter((rf) => (rf.source as { slug: string }).slug === "ranger")
      .map((rf) => rf.feature.name)).toEqual(["Dueling"]);
  });

  it("synthesizes granted features from origin race traits (origin choices now in scope)", () => {
    const raceWithStyleChoice = {
      slug: "half-elf", name: "Half-Elf", size: "Medium", speed: { walk: 30 },
      traits: [{
        name: "Fey Gift", description: "Choose a style.",
        choices: [{ kind: "select-entity", id: "fey-style", count: 1,
          entity_type: "optional-feature", where: { feature_type: "fighting_style" } }],
      }],
    };
    const reg = buildMockRegistry([
      { slug: "fighter", entityType: "class", data: STYLED_FIGHTER },
      { slug: "half-elf", entityType: "race", data: raceWithStyleChoice },
      { slug: "srd-2024_defense", entityType: "optional-feature", data: DEFENSE_OF },
    ]);
    const char = minimalCharacter();
    char.race = "[[half-elf]]";
    char.class = [{ name: "[[fighter]]", level: 1, subclass: null, choices: {} }];
    char.origin_choices = { "race:fey-style": "srd-2024_defense" };
    const { character } = new PCResolver(reg).resolve(char);
    // Defense was selected on a RACE trait — origin grants are now synthesized too.
    const defense = character.features.find((rf) => rf.feature.name === "Defense");
    expect(defense).toBeDefined();
    expect(defense?.source).toEqual({ kind: "race", slug: "half-elf" });
  });
});

describe("PCResolver — background origin feat → shared feat pipeline (D2-3(ii))", () => {
  it("folds the 2024 background origin feat into resolved.feats + a feat-sourced feature", () => {
    const reg = buildMockRegistry([
      { slug: "bladesworn", entityType: "class", data: BLADESWORN },
      { slug: "soldier", entityType: "background", data: SOLDIER_BG },
      { slug: "srd-2024_savage-attacker", entityType: "feat", data: SAVAGE_ATTACKER_FEAT },
    ]);
    const char = minimalCharacter();
    char.background = "[[soldier]]";
    const { character } = new PCResolver(reg).resolve(char);

    // Renders: the FeatEntity is in resolved.feats (drives the Feats-subgroup row).
    expect(character.feats.map((f) => f.slug)).toContain("srd-2024_savage-attacker");
    // Applies: it flows to resolved.features with source.kind "feat" (→ effects fold).
    const feat = character.features.find(
      (rf) => rf.source.kind === "feat" && (rf.source as { slug: string }).slug === "srd-2024_savage-attacker");
    expect(feat).toBeDefined();
    expect(feat!.feature.name).toBe("Savage Attacker");
  });

  it("resolves a parenthetical-variant origin feat to the BASE feat, keeping the variant display", () => {
    const reg = buildMockRegistry([
      { slug: "bladesworn", entityType: "class", data: BLADESWORN },
      { slug: "acolyte", entityType: "background", data: ACOLYTE_BG },
      { slug: "srd-2024_magic-initiate", entityType: "feat", data: MAGIC_INITIATE_FEAT },
    ]);
    const char = minimalCharacter();
    char.background = "[[acolyte]]";
    const { character } = new PCResolver(reg).resolve(char);
    expect(character.feats.map((f) => f.slug)).toContain("srd-2024_magic-initiate");

    // The lifted helper resolves the variant ref to the base feat but names the variant.
    const resolved = resolveOriginFeat(reg, "[[SRD 2024/Feats/Magic Initiate (Cleric)]]");
    expect(resolved?.feat.slug).toBe("srd-2024_magic-initiate");
    expect(resolved?.display).toBe("Magic Initiate (Cleric)");
  });

  it("dedupes by slug: origin feat + the SAME feat via a class ASI slot → exactly ONE (R2-m4)", () => {
    const reg = buildMockRegistry([
      { slug: "fighter", entityType: "class", data: STYLED_FIGHTER },
      { slug: "criminal", entityType: "background", data: CRIMINAL_BG },
      { slug: "alert", entityType: "feat", data: ALERT_FEAT },
    ]);
    const char = minimalCharacter();
    char.class = [{ name: "[[fighter]]", level: 4, subclass: null,
      choices: { 4: { "asi-or-feat": "feat", feat: "alert" } } }];
    char.background = "[[criminal]]";
    const { character } = new PCResolver(reg).resolve(char);

    expect(character.feats.filter((f) => f.slug === "alert")).toHaveLength(1);
    expect(character.features.filter(
      (rf) => rf.source.kind === "feat" && rf.feature.name === "Alert")).toHaveLength(1);
  });

  it("2014 background (origin_feat null / absent) folds no origin feat", () => {
    const reg = buildMockRegistry([
      { slug: "bladesworn", entityType: "class", data: BLADESWORN },
      { slug: "drifter", entityType: "background", data: DRIFTER },
    ]);
    const char = minimalCharacter();
    char.background = "[[drifter]]";
    const { character } = new PCResolver(reg).resolve(char);
    expect(character.feats).toHaveLength(0);
  });

  it("resolveOriginFeat returns null for a null/empty ref", () => {
    const reg = buildMockRegistry([]);
    expect(resolveOriginFeat(reg, null)).toBeNull();
    expect(resolveOriginFeat(reg, "")).toBeNull();
  });
});

function minimalCharacter(): Character {
  return {
    name: "Grendal",
    edition: "2014",
    race: null,
    subrace: null,
    background: null,
    class: [{ name: "[[bladesworn]]", level: 3, subclass: null, choices: {} }],
    abilities: { str: 14, dex: 10, con: 13, int: 10, wis: 12, cha: 8 },
    ability_method: "manual",
    skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] },
    equipment: [],
    overrides: {},
    state: {
      hp: { current: 24, max: 24, temp: 0 },
      hit_dice: {},
      spell_slots: {},
      concentration: null,
      conditions: [],
    },
  };
}

describe("resolved.resources (R4-G4 §3.2.1): the owner is the DECLARING feature", () => {
  const BM_FIGHTER = { slug: "fighter", name: "Fighter", hit_die: "d10", saving_throws: ["str", "con"], features_by_level: {} };
  // The shipped shape: entity-level `resources: []`, the resource declared INSIDE features_by_level['3'].
  const BATTLE_MASTER = { slug: "battle-master", name: "Battle Master", parent_class: "[[fighter]]", resources: [],
    features_by_level: { 3: [{ id: "combat-superiority", name: "Combat Superiority", description: "You learn maneuvers.",
      resources: [{ id: "fighter-2024:superiority-dice", name: "Superiority Dice", max_formula: "4", reset: "short-rest",
                    die: { base: "d8" } }] }] } };
  it("stamps Combat Superiority at source.level 3, never a subclass-named synthetic at level 1", () => {
    const reg = buildMockRegistry([
      { slug: "fighter", entityType: "class", data: BM_FIGHTER },
      { slug: "battle-master", entityType: "subclass", data: BATTLE_MASTER },
    ]);
    const char = minimalCharacter();
    char.class = [{ name: "[[fighter]]", level: 3, subclass: "[[battle-master]]", choices: {} }] as never;
    const { character } = new PCResolver(reg).resolve(char);
    const r = character.resources.get("fighter-2024:superiority-dice")!;
    expect(r.owner).toMatchObject({ kind: "feature", featureName: "Combat Superiority", source: { kind: "subclass", level: 3 } });
    // derive-not-receive: the stored index equals a fresh derivation
    expect(resolveResourceIndex(character)).toEqual(character.resources);
  });
});

describe("resolveOriginFeat · the seven-tier cascade (R4-G4 §8.2)", () => {
  // The TOP-LEVEL `name` is load-bearing: `buildMockRegistry`'s `name ?? slug` default would
  // otherwise name each feat after its SLUG, and `EntityRegistry.search` sorts by lowercased name
  // (exact, then prefix, then a `localeCompare` tiebreak), so three differently-slugged Alerts
  // would sort deterministically and the INSERTION order would never reach the cascade.
  const withPath = (slug: string, name: string, compendium: string, filePath: string, extra: object = {}) =>
    ({ slug, name, entityType: "feat", compendium, filePath, data: { slug, name, description: "d", ...extra } });
  const SRD_MI = withPath("srd-2024_feat_magic-initiate", "Magic Initiate", "SRD 2024", "Compendium/SRD 2024/Feats/Magic Initiate.md",
    { choices: [{ kind: "select-inline", id: "spell-list", count: 1, options: [] }] });
  const PHB_MIC = withPath("players-handbook-2024_feat_magic-initiate-cleric", "Magic Initiate; Cleric", "Player's Handbook (2024)",
    "Compendium/Player's Handbook (2024)/Feats/Magic Initiate; Cleric.md", { choices: [] });
  const ACOLYTE = { ...ACOLYTE_BG, slug: "srd-2024_background_acolyte" };
  const acolyteReg = (order: "srd-first" | "phb-first") => buildMockRegistry([
    { slug: "srd-2024_background_acolyte", entityType: "background", compendium: "SRD 2024", filePath: "Compendium/SRD 2024/Backgrounds/Acolyte.md", data: ACOLYTE },
    ...(order === "srd-first" ? [SRD_MI, PHB_MIC] : [PHB_MIC, SRD_MI]),
  ]);

  it("RED FIRST (the hijack): the PATH tier beats the tail tier, in BOTH insertion orders", () => {
    for (const order of ["srd-first", "phb-first"] as const) {
      const r = resolveOriginFeat(acolyteReg(order), ACOLYTE.origin_feat, ACOLYTE.slug);
      expect(r?.feat.slug, order).toBe("srd-2024_feat_magic-initiate");
      expect(r?.display, order).toBe("Magic Initiate (Cleric)");
    }
  });

  it("RED FIRST (the order): three same-named Alert feats resolve to the SAME-COMPENDIUM one under both orders", () => {
    const alerts = [
      withPath("players-handbook-2024_feat_alert", "Alert", "Player's Handbook (2024)", "Compendium/Player's Handbook (2024)/Feats/Alert.md"),
      withPath("srd-2024_feat_alert", "Alert", "SRD 2024", "Compendium/SRD 2024/Feats/Alert.md"),
      withPath("srd-5e_feat_alert", "Alert", "SRD 5e", "Compendium/SRD 5e/Feats/Alert.md"),
    ];
    const CRIMINAL = { ...CRIMINAL_BG, slug: "srd-2024_background_criminal" };
    for (const list of [alerts, [...alerts].reverse()]) {
      const reg = buildMockRegistry([{ slug: CRIMINAL.slug, entityType: "background", compendium: "SRD 2024", filePath: "Compendium/SRD 2024/Backgrounds/Criminal.md", data: CRIMINAL }, ...list]);
      // `reg`: tier 2 (PATH) HITS: the ref `[[SRD 2024/Feats/Alert]]` resolves against `Compendium/SRD 2024/Feats/Alert.md`.
      // `noPath` moves every feat under `mock/`, so tiers 2 and 3 miss and tier 4 (same-compendium tail) decides.
      // Both registries must agree under BOTH orders; do not "fix" the fixture paths, they are the point.
      const noPath = buildMockRegistry([{ slug: CRIMINAL.slug, entityType: "background", data: CRIMINAL }, ...list.map((f) => ({ ...f, filePath: `mock/${f.slug}.md` }))]);
      expect(resolveOriginFeat(noPath, CRIMINAL.origin_feat, CRIMINAL.slug)?.feat.slug).toBe("srd-2024_feat_alert");
      expect(resolveOriginFeat(reg, CRIMINAL.origin_feat, CRIMINAL.slug)?.feat.slug).toBe("srd-2024_feat_alert");
    }
  });

  it("homebrew degradation: a bare-slug ref on a homebrew background still resolves through tier 6 (any tail)", () => {
    const reg = buildMockRegistry([{ slug: "hb_feat_alert", entityType: "feat", compendium: "Homebrew", data: { slug: "hb_feat_alert", name: "Alert" } }]);
    expect(resolveOriginFeat(reg, "[[alert]]", "other_background_x")?.feat.slug).toBe("hb_feat_alert");
  });
});
