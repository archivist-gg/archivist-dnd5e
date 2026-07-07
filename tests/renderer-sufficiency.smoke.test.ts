import { describe, it, expect } from "vitest";

// --- Pack public surface (a 3rd-party renderer consumes exactly these subpaths) ---
import { parsePC } from "@archivist/dnd5e/pc/pc.parser";
import { PCResolver } from "@archivist/dnd5e/pc/pc.resolver";
import { recalc } from "@archivist/dnd5e/pc/pc.recalc";
import { classSpellCandidates } from "@archivist/dnd5e/spell/spell.access";
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
// TEMPORARY EXIT GATE (replaced by the breadth assertions in Task 1). Proves the
// fixture yields the required non-trivial state before the 30+ breadth checks.
// ─────────────────────────────────────────────────────────────────────────────
describe("Phase-4 renderer-sufficiency — fixture exit gate (temporary; replaced in Task 1)", () => {
  const parsed = parsePC(CHARACTER_YAML);

  it("parsePC accepts the YAML character doc", () => {
    expect(parsed.success).toBe(true);
  });

  it("the fixture resolves to the required non-trivial state", () => {
    if (!parsed.success) throw new Error(parsed.error);
    const registry = buildRegistry();
    const { character: resolved } = new PCResolver(registry).resolve(parsed.data);
    const derived: DerivedStats = recalc(resolved, registry);

    expect(derived.pactMagic).not.toBeNull();                         // Warlock level present
    expect(derived.pactMagic!.total).toBeGreaterThan(0);
    expect(derived.attacks.length).toBeGreaterThan(0);                // equipped CLUB -> CRIT surface
    expect(Object.keys(derived.derivedSpellSlots).length).toBeGreaterThan(0); // full caster
    expect(derived.senses.darkvision).toBeGreaterThan(0);             // darkvision race
    expect(derived.defenses.resistances.length).toBeGreaterThan(0);   // resistance feat effect
    expect(derived.attunementUsed).toBeGreaterThan(0);                // bracers attuned
    expect(derived.acInformational.length).toBeGreaterThan(0);        // bracers' vs_creature_type AC -> informational

    // Spec §5 exit criterion: a wizard-list spell the char does NOT know must be a
    // candidate (else the empty-candidate false-pass slips to Task 1).
    const knownSlugs = new Set(resolved.spells.map((s) => s.slug));
    const candidates = classSpellCandidates(registry, ["wizard"], 3, knownSlugs);
    expect(candidates.length).toBeGreaterThan(0);
  });
});
