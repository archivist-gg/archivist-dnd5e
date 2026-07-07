import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// --- Pack public surface (a 3rd-party renderer consumes exactly these subpaths) ---
import { parsePC } from "@archivist/dnd5e/pc/pc.parser";
import { PCResolver } from "@archivist/dnd5e/pc/pc.resolver";
import { recalc } from "@archivist/dnd5e/pc/pc.recalc";
import { classSpellCandidates } from "@archivist/dnd5e/spell/spell.access";
import { collectChosenProficiencies, collectChosenAbilityPoints } from "@archivist/dnd5e/pc/pc.decision-engine";
import { computeRestPlan } from "@archivist/dnd5e/pc/pc.rest";
import { ITEM_ACTIONS, resolveItemAction } from "@archivist/dnd5e/item/item.actions-map";
import { readNumericBonus } from "@archivist/dnd5e/item/item.bonuses";
import { evaluateCondition } from "@archivist/dnd5e/item/item.conditions";
import type { ConditionContext } from "@archivist/dnd5e/item/item.conditions.types";
import { requiresAttunement } from "@archivist/dnd5e/item/item.attunement";
import { spellEffectAtSlot, upcastLevelsFor } from "@archivist/dnd5e/spell/spell.scaling";
import { compareCandidates, castTimeCategory } from "@archivist/dnd5e/spell/spell.filter";
import type { DerivedStats } from "@archivist/dnd5e/pc/pc.types";

// --- Registry construction via @archivist/core's public API (trusted local helpers) ---
import { EntityRegistry } from "@archivist/core";
import { buildMockRegistry } from "./mock-entity-registry";
import { CLUB, PLATE, SHIELD } from "./equipment-fixtures";

// ─────────────────────────────────────────────────────────────────────────────
// Hand-authored registry entities that light up every §2.5 render surface.
// Shapes copied from the pc-resolver / pc-recalc-spellcasting / equipment fixtures
// (never invented). A 3rd-party renderer would ship its own compendium of these.
// ─────────────────────────────────────────────────────────────────────────────

// A magic item with a GENUINELY conditional AC bonus. `attunement: true` (boolean)
// per Gate-2 CRIT-1. The bonus uses a Tier 2-4 condition (`vs_creature_type`) which
// ALWAYS classifies "informational" -> the item's AC bonus lands in
// derived.acInformational (A10). NB isAttunedActive requires the entry to be
// `equipped: true` for the bonus to be read, so the YAML equips + attunes it.
const BRACERS_OF_DEFENSE = {
  slug: "bracers-of-defense",
  name: "Bracers of Defense",
  type: "wondrous",
  rarity: "rare",
  attunement: true,
  bonuses: {
    ac: { value: 2, when: [{ kind: "vs_creature_type", value: "undead" }] }, // Tier 2-4 -> informational
  },
};

// Class entities — full shape per pc-recalc-spellcasting.mkCaster (edition /
// primary_abilities / table present so the resolver/pools never read undefined).
// Slots derive from spellcasting.caster_type + level (registry-independent).
const WIZARD = {
  slug: "wizard", name: "Wizard", edition: "2014", hit_die: "d6",
  primary_abilities: [], saving_throws: ["int", "wis"], features_by_level: {}, table: {},
  spellcasting: { caster_type: "full", ability: "int", preparation: "prepared", spell_list: "wizard" },
};
const WARLOCK = {
  slug: "warlock", name: "Warlock", edition: "2014", hit_die: "d8",
  primary_abilities: [], saving_throws: ["wis", "cha"], features_by_level: {}, table: {},
  // Simple-weapon + light-armor proficiency (categories, NOT a bare array — the
  // attack matcher checks weapons.categories). Makes the equipped CLUB proficient
  // so A4 toHit = proficiencyBonus + STR-mod.
  proficiencies: { weapons: { categories: ["simple"] }, armor: { categories: ["light"] } },
  spellcasting: { caster_type: "pact", ability: "cha", preparation: "known", spell_list: "warlock" },
};

// A subclass entity (spec §2.4 requires one). Minimal — resolves cleanly.
const BLADESINGER = {
  slug: "bladesinger", name: "Bladesinger", edition: "2014", features_by_level: {},
};

// A race carrying darkvision (drives derived.senses.darkvision, A7). Key is
// `vision.darkvision` per pc-resolver.test.ts HILL_FOLK.
const DARK_ELF = {
  slug: "dark-elf", name: "Dark Elf", edition: "2014", size: "Medium",
  speed: { walk: 30 }, vision: { darkvision: 60 },
  traits: [{ name: "Fey Ancestry", description: "Advantage vs charm." }],
};

// A background entity (spec §2.4 requires one). Minimal — resolves cleanly.
const SAGE = {
  slug: "sage", name: "Sage", edition: "2014",
  feature: { name: "Researcher", description: "You know where to find lore." },
  proficiencies: { skills: ["arcana", "history"], tools: [], languages: [] },
};

// A feat (spec §2.4 requires feats) that ALSO grants a damage resistance via a
// feature-effect (drives derived.defenses.resistances, A6). The resolver folds an
// entity-level feat with no bundled `features` into a resolved feature carrying
// its `effects` (pc.resolver collectResolvedFeatures), and computeFeatureEffects
// reads `{ kind: "resistance", damage_type }` into derived.defenses.resistances.
const ELEMENTAL_WARD_FEAT = {
  slug: "elemental-ward", name: "Elemental Ward",
  description: "Arcane wards blunt elemental harm.",
  effects: [{ kind: "resistance", damage_type: "fire" }],
};

// Two wizard-list spells: one the character KNOWS (excluded from candidates) and
// one it does NOT (so classSpellCandidates returns a non-empty list — spec §5).
const MAGE_ARMOR = {
  slug: "mage-armor", name: "Mage Armor", level: 1, classes: ["wizard"],
  school: "abjuration",
};
const MISTY_STEP = {
  slug: "misty-step", name: "Misty Step", level: 2, classes: ["wizard"],
  school: "conjuration",
};

function buildRegistry(): EntityRegistry {
  return buildMockRegistry([
    { slug: "wizard", entityType: "class", name: "Wizard", data: WIZARD },
    { slug: "warlock", entityType: "class", name: "Warlock", data: WARLOCK },
    { slug: "bladesinger", entityType: "subclass", name: "Bladesinger", data: BLADESINGER },
    { slug: "dark-elf", entityType: "race", name: "Dark Elf", data: DARK_ELF }, // darkvision -> senses
    { slug: "sage", entityType: "background", name: "Sage", data: SAGE },
    { slug: "elemental-ward", entityType: "feat", name: "Elemental Ward", data: ELEMENTAL_WARD_FEAT }, // resistance
    { slug: "mage-armor", entityType: "spell", name: "Mage Armor", data: MAGE_ARMOR },   // known
    { slug: "misty-step", entityType: "spell", name: "Misty Step", data: MISTY_STEP },   // unknown -> candidate
    { slug: "club", entityType: "weapon", name: "Club", data: CLUB },   // simple -> Warlock proficient (A4 PB+mod)
    { slug: "plate", entityType: "armor", name: "Plate", data: PLATE },
    { slug: "shield", entityType: "armor", name: "Shield", data: SHIELD },
    { slug: "bracers-of-defense", entityType: "item", name: "Bracers of Defense", data: BRACERS_OF_DEFENSE }, // attuned (A8)
  ]);
}

// The YAML character document parsePC consumes (a ```pc fence's CONTENTS: YAML).
const CHARACTER_YAML = `
name: Smoke Test Hero
edition: "2014"
race: dark-elf
background: sage
ability_method: standard-array
class:
  - name: wizard
    level: 4
    subclass: bladesinger
    choices:
      4:
        feat: elemental-ward
  - name: warlock
    level: 3
abilities: { str: 14, dex: 12, con: 14, int: 16, wis: 10, cha: 14 }
skills: { proficient: [arcana, investigation], expertise: [] }
spells: { known: [mage-armor], overrides: [] }
equipment:
  - { item: club, equipped: true, slot: mainhand }
  - { item: plate, equipped: true, slot: armor }
  - { item: shield, equipped: true, slot: shield }
  - { item: bracers-of-defense, equipped: true, attuned: true }
currency: { cp: 0, sp: 3, ep: 0, gp: 25, pp: 0 }
state:
  hp: { current: 20, max: 32, temp: 0 }
  hit_dice: {}
  spell_slots: { "1": { used: 1, total: 3 } }
  conditions: []
  exhaustion: 0
  feature_uses: {}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Full renderer-sufficiency breadth suite (spec §2.5). Resolve the fixture ONCE,
// then assert every render surface a 3rd-party sheet reads — each check pins a
// concrete number / shape / non-empty collection, never mere truthiness. The few
// shape/reachability checks (A8 equippedSlots.mainhand reachability + carriedWeight
// typeof + rollModifiers Array.isArray — the value surface is backstopped by A4's
// equipped-weapon-row pins; B2 folds from persisted decision choices — empty for
// this fixture; A10 conditionEffects — no active conditions; the C leaves) are
// called out inline with WHY they are contract-shape rather than value pins.
// ─────────────────────────────────────────────────────────────────────────────
describe("Phase-4 renderer-sufficiency — full read surface (core + dnd5e only, zero obsidian)", () => {
  const parsed = parsePC(CHARACTER_YAML);
  if (!parsed.success) throw new Error(`fixture parse failed: ${parsed.error}`);
  const registry = buildRegistry();
  // Surface resolver warnings so a mistyped fixture slug can't silently degrade
  // the breadth foundation (Task-0 review carry-forward).
  const { character: resolved, warnings } = new PCResolver(registry).resolve(parsed.data);
  const derived: DerivedStats = recalc(resolved, registry);

  // Shared spell-candidate inputs (used by B1 + C).
  const knownSlugs = new Set(resolved.spells.map((s) => s.slug));
  const candidates = classSpellCandidates(registry, ["wizard"], 3, knownSlugs);

  it("resolver emits no warnings (clean fixture)", () => {
    expect(warnings).toEqual([]);
  });

  // --- A. Core DerivedStats (single recalc call) ---
  it("A1 ability math", () => {
    expect(derived.totalLevel).toBe(7);                 // wizard 4 + warlock 3
    expect(derived.proficiencyBonus).toBe(3);
    expect(derived.scores.int).toBe(16);                // INT 16
    expect(derived.mods.int).toBe(3);
    expect(derived.scores.str).toBe(14);
    expect(derived.mods.str).toBe(2);
  });
  it("A2 saves + skills", () => {
    expect(derived.saves.int.proficient).toBe(true);    // Wizard save
    expect(derived.skills.arcana.proficiency).toBe("proficient");
    expect(derived.skills.arcana.bonus).toBe(6);        // PB 3 + INT mod 3
  });
  it("A3 hp/ac/speed/initiative", () => {
    expect(derived.hp.max).toBe(47);                    // wizard 6+3·4 + warlock 3·5 (33) + CON mod +2·7 (14) = 47
    expect(derived.ac).toBe(20);                        // plate 18 + shield 2
    expect(derived.speed).toBe(30);                     // Dark Elf walk 30
    expect(derived.initiative).toBe(1);                 // DEX 12 -> +1
  });
  it("A4 attacks (CRIT surface — equipped weapon row)", () => {
    expect(derived.attacks.length).toBeGreaterThan(0);
    const club = derived.attacks.find((a) => /club/i.test(a.name));
    expect(club).toBeDefined();
    // CLUB is simple -> Warlock proficient -> toHit = PB + STR mod (no magic bonus).
    expect(club!.toHit).toBe(derived.proficiencyBonus + derived.mods.str); // 3 + 2 = 5
    expect(club!.toHit).toBe(5);
    expect(club!.proficient).toBe(true);
    expect(club!.damageType).toBeTruthy();
    expect(club!.damageDice).toBeTruthy();
    expect(club!.breakdown.toHit.length).toBeGreaterThan(0);
    expect(derived.attacksPerAction).toBe(1);
  });
  it("A5 aggregate proficiencies (distinct from chosen, B2)", () => {
    // Concrete membership on the AGGREGATE proficiency buckets, not object-truthiness
    // (Gate-2 IMP-2). Warlock grants simple-weapon + light-armor categories.
    expect(derived.proficiencies.weapons.categories).toContain("simple");
    expect(derived.proficiencies.armor.categories).toContain("light");
    // Save-proficiency data is reachable via the per-ability saves Record (A2). The
    // 5e multiclass rule counts ONLY the first class's saves, so wizard (INT/WIS) is
    // proficient and warlock's CHA is not — distinct from A2's `saves.int.proficient`.
    expect(derived.saves.wis.proficient).toBe(true);   // Wizard's second save
    expect(derived.saves.cha.proficient).toBe(false);  // Warlock is 2nd class -> no save prof
    // NB derived.proficiencies.saves is an unpopulated legacy placeholder in the pack
    // (computeProficiencies returns saves:[]); the reachable surface is derived.saves.*.
    expect(derived.proficiencies.saves).toEqual([]);
  });
  it("A6 defenses (resistance via feat feature-effect)", () => {
    expect(derived.defenses.resistances).toContain("fire"); // Elemental Ward feat -> resistance:fire
  });
  it("A7 senses + passives", () => {
    expect(derived.senses.darkvision).toBe(60);             // Dark Elf vision.darkvision 60
    expect(derived.passives.perception).toBe(10);           // 10 + WIS mod 0 (no proficiency)
  });
  it("A8 attunement + equipped slots + weight + rollModifiers", () => {
    expect(derived.attunementLimit).toBe(3);
    expect(derived.attunementUsed).toBe(1);                 // bracers attuned
    expect(derived.equippedSlots.mainhand).toBeTruthy();    // CLUB equipped
    expect(typeof derived.carriedWeight).toBe("number");
    expect(Array.isArray(derived.rollModifiers)).toBe(true);
  });
  it("A9 spellcasting block (full caster + pact)", () => {
    expect(derived.spellcastingClasses.length).toBe(2);            // wizard (full) + warlock (pact)
    expect(Object.keys(derived.derivedSpellSlots).length).toBeGreaterThan(0);
    expect(derived.pactMagic).not.toBeNull();
    expect(derived.pactMagic!.level).toBe(2);                      // warlock 3 -> pact slot level 2
    expect(derived.pactMagic!.total).toBe(2);                      // warlock 3 -> 2 pact slots
    expect(derived.spellLimits.length).toBeGreaterThanOrEqual(1);
    // Pin the spell save-DC / attack-bonus surface — the live `8 + PB + ability-mod`
    // (DC) and `PB + ability-mod` (attack) math. A regression in that derivation
    // would keep spellcastingClasses.length===2 and pass silently otherwise.
    expect(derived.spellcasting).not.toBeNull();
    expect(derived.spellcasting!.saveDC).toBe(14);                 // 8 + PB(3) + INT-mod(3) = 14
    expect(derived.spellcasting!.attackBonus).toBe(6);             // PB(3) + INT-mod(3) = 6
    const wizardCaster = derived.spellcastingClasses.find((c) => c.classSlug === "wizard");
    expect(wizardCaster).toBeDefined();
    expect(wizardCaster!.saveDC).toBe(14);                         // wizard: 8 + PB(3) + INT-mod(3)
    expect(wizardCaster!.attackBonus).toBe(6);                     // wizard: PB(3) + INT-mod(3)
  });
  it("A10 conditions + acBreakdown + informational", () => {
    expect(derived.acBreakdown.length).toBeGreaterThan(0);        // plate/shield terms
    expect(derived.acInformational.length).toBeGreaterThan(0);    // bracers' vs_creature_type AC -> informational
    // Shape check: the fixture has NO active conditions, so conditionEffects is the
    // empty-but-present contract object a renderer would iterate. Assert the shape,
    // not a fabricated non-empty (would require an authored active condition).
    expect(derived.conditionEffects).toBeTruthy();
    expect(typeof derived.conditionEffects).toBe("object");
  });

  // --- B. Read-compute beyond DerivedStats ---
  it("B1 classSpellCandidates non-empty", () => {
    // signature (spell.access): classSpellCandidates(registry, classSlugs, maxLevel, knownSlugs: Set<string>, showAll?, query?)
    expect(candidates.length).toBeGreaterThan(0);   // misty-step: wizard-list, level<=3, UNKNOWN -> candidate
    expect(candidates.some((c) => c.slug === "misty-step")).toBe(true);
    expect(candidates.some((c) => c.slug === "mage-armor")).toBe(false); // known -> excluded
  });
  it("B2 decision read-fold reachable + correct shape", () => {
    // Gate-2 IMP-2: collectChosenProficiencies folds from persisted decision `choices`,
    // NOT skills.proficient — empty for THIS fixture (no class feature authoring a
    // select-proficiency + persisted pick). Assert the read-fold is reachable and
    // returns the contract shape; it upgrades to a non-empty assertion IF such a
    // decision choice is authored into the fixture.
    const chosen = collectChosenProficiencies(resolved);
    expect(Array.isArray(chosen.skills)).toBe(true);
    expect(Array.isArray(chosen.expertise)).toBe(true);
    expect(Array.isArray(chosen.languages)).toBe(true);
    expect(Array.isArray(chosen.tools)).toBe(true);
    const pts = collectChosenAbilityPoints(resolved);
    expect(pts).toBeTruthy();                        // OriginAbilityPoints { race, background }
    expect(typeof pts.race).toBe("object");
    expect(typeof pts.background).toBe("object");
  });
  it("B3 computeRestPlan has reset categories", () => {
    // signature (pc.rest): computeRestPlan(character, resolved, derived, registry, type)
    const plan = computeRestPlan(parsed.data, resolved, derived, registry, "long");
    expect(plan.categories.length).toBeGreaterThan(0); // spent L1 slot -> "spell-slots" (+ hp-to-max)
    expect(plan.categories.some((c) => c.id === "spell-slots")).toBe(true);
  });
  it("B4 item-action data", () => {
    expect(Object.keys(ITEM_ACTIONS).length).toBeGreaterThan(0);
    // Curated map reachability: a known chargeable item resolves to its action.
    const wand = resolveItemAction("wand-of-fireballs", parsed.data.equipment[0]);
    expect(wand).not.toBeNull();
    expect(wand!.cost).toBe("action");
    // Null branch: an equipped non-actionable item (the CLUB) has no item action.
    expect(resolveItemAction("club", parsed.data.equipment[0])).toBeNull();
  });
  it("B5 structured conditional bonus (applied + informational branches, not flat)", () => {
    const ctx: ConditionContext = {
      derived: { equippedSlots: derived.equippedSlots },
      classList: parsed.data.class,                  // ClassEntry[]
      race: parsed.data.race ?? null,
      subclasses: parsed.data.class.map((c) => c.subclass).filter(Boolean) as string[],
    };
    // APPLIED branch: `is_class "wizard"` matches ctx.classList (Gate-2 CRIT-2: a
    // `no_armor` condition would be "skipped" under the plate+shield fixture, not applied).
    const applied = readNumericBonus({ value: 2, when: [{ kind: "is_class", value: "wizard" }] } as never, ctx);
    expect(applied).not.toBeNull();                  // readNumericBonus can return null
    expect(applied!.kind).toBe("applied");
    // INFORMATIONAL branch: a Tier 2-4 kind always evaluates informational.
    const info = readNumericBonus({ value: 1, when: [{ kind: "vs_creature_type", value: "undead" }] } as never, ctx);
    expect(info).not.toBeNull();
    expect(info!.kind).toBe("informational");
    // evaluateCondition feeds these — returns a ConditionOutcome string, not a {kind}.
    expect(evaluateCondition({ kind: "is_class", value: "wizard" } as never, ctx)).toBe("true");
    expect(evaluateCondition({ kind: "vs_creature_type", value: "undead" } as never, ctx)).toBe("informational");
  });
  it("B6 parsed currency", () => {
    expect(parsed.data.currency?.gp).toBe(25);
  });

  // --- C. Non-PC moved read-compute leaves (light) ---
  it("C spell.scaling / spell.filter / item.attunement", () => {
    // Reachability of the upcast helper (brief-specified: no scaling spell in fixture).
    expect(typeof upcastLevelsFor).toBe("function");
    // Gate-2 CRIT-1: requiresAttunement reads entity.attunement (NOT requires_attunement).
    expect(requiresAttunement({ attunement: true } as never)).toBe(true);
    expect(requiresAttunement({} as never)).toBe(false);
    // MISTY_STEP has no casting_options / at_higher_levels -> no upcast surface.
    expect(spellEffectAtSlot(MISTY_STEP as never, 3)).toBeNull();
    expect(upcastLevelsFor(MISTY_STEP as never, [1, 2, 3])).toEqual([]);
    // Pure spell.filter buckets (concrete category mapping).
    expect(castTimeCategory("action")).toBe("action");
    expect(castTimeCategory("bonus-action")).toBe("bonus");
    // compareCandidates over the B1 candidates: a candidate compared to itself sorts 0.
    expect(candidates.length).toBeGreaterThan(0);
    expect(compareCandidates(candidates[0], candidates[0], "name", "asc")).toBe(0);
  });

  // --- Guard: this file consumes ONLY the public surface (zero ../src, zero obsidian) ---
  it("import guard: public-subpath-only, zero obsidian", () => {
    const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l));
    expect(imports.some((l) => /["']\.\.\/src\//.test(l))).toBe(false);   // no relative pack import
    expect(imports.some((l) => /["']obsidian["']/.test(l))).toBe(false);  // no obsidian
  });
});
