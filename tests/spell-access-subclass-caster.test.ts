import { describe, it, expect } from "vitest";
import { classSpellCandidates } from "../src/spell/spell.access";
import { EntityRegistry } from "@archivist-gg/core";

// ---------------------------------------------------------------------------
// R4-G7 T8 rider wave F · RIDER-46 · the SUBCLASS-granted caster's add drawer.
//
// The live finding (S03b, `conv-rogue5e-5-B`, a 2014 Rogue / Arcane Trickster at
// level 5): the add-spell drawer rendered 0 rows at open and 0 for every query,
// including the character's own seven known spells. The drawer's class axis is
// the CLASS slug (`add-drawer.ts:219`, `ctx.derived.spellcastingClasses.map(c => c.classSlug)`),
// which for an Arcane Trickster is the ROGUE's, and no spell in any shipped
// corpus or bundle lists `rogue` in its `classes` (measured: wizard 688,
// sorcerer 458, druid 360, bard 333, cleric 278, warlock 262, artificer 220,
// ranger 143, paladin 117, monk 1, and nothing else). So the gate could only
// ever return the empty set.
//
// The rule under test: a base class name that NO spell in the registry lists
// cannot narrow the pool, so it is dropped from the class gate; the LEVEL gate
// stays. Registry-wide is the right scope because `classSpellCandidates` itself
// enumerates registry-wide.
//
// FIXTURE RULE (inherited from spell-access-cap.test.ts, Gate 2 I-5): a real
// core `EntityRegistry`, never an ad-hoc `search` stub, so `count()` and the
// type bucket behave as the shipped code sees them.
// ---------------------------------------------------------------------------

const WIZARD_CLASS = "players-handbook-2014_class_wizard";
const ROGUE_CLASS = "players-handbook-2014_class_rogue";

function spell(slug: string, name: string, level: number, classes: string[]) {
  return {
    slug, name, entityType: "spell", filePath: `s/${slug}.md`,
    data: { slug, name, level, classes },
    compendium: "Player's Handbook (2014)", readonly: true, homebrew: false,
  };
}

/** Four spells over two lists, mirroring the shipped shape: a wizard cantrip, a
 *  wizard 1st, a wizard 2nd (the level-gate probe) and a cleric-only 1st (the
 *  control's discriminator). NOTHING lists `rogue`, exactly as the corpus. */
function vaultRegistry(): EntityRegistry {
  const reg = new EntityRegistry();
  reg.register(spell("phb_spell_mage-hand", "Mage Hand", 0, ["bard", "sorcerer", "warlock", "wizard"]));
  reg.register(spell("phb_spell_sleep", "Sleep", 1, ["bard", "sorcerer", "wizard"]));
  reg.register(spell("phb_spell_misty-step", "Misty Step", 2, ["sorcerer", "warlock", "wizard"]));
  reg.register(spell("phb_spell_bless", "Bless", 1, ["cleric", "paladin"]));
  return reg;
}

describe("classSpellCandidates · a caster class name no spell lists", () => {
  it("RED-FIRST: an Arcane Trickster (rogue class slug) gets candidates, not an empty drawer", () => {
    const names = classSpellCandidates(vaultRegistry(), [ROGUE_CLASS], 1, new Set(), false).map((c) => c.name);
    // Pre-fix: []. `rogue` matches no spell's `classes`, so the gate erases the pool.
    expect(names).toContain("Sleep");
    expect(names).toContain("Mage Hand");
  });

  it("RED-FIRST: the level gate still binds for that caster", () => {
    const names = classSpellCandidates(vaultRegistry(), [ROGUE_CLASS], 1, new Set(), false).map((c) => c.name);
    // Misty Step is 2nd level and the third-caster has 1st-level slots only. The
    // LENGTH is asserted first: `not.toContain` is vacuously true on the pre-fix [].
    expect(names).toHaveLength(3);
    expect(names).not.toContain("Misty Step");
  });

  it("RED-FIRST: in a multiclass, one unlistable caster opens the pool (union semantics)", () => {
    const names = classSpellCandidates(vaultRegistry(), [WIZARD_CLASS, ROGUE_CLASS], 2, new Set(), false)
      .map((c) => c.name);
    // Pre-fix: the wizard three only. The rogue half can name no list, so the
    // union of "the wizard list" and "unknown" is every spell at the slot level.
    expect(names).toContain("Bless");
    expect(names).toHaveLength(4);
  });

  it("CONTROL (kill power): a caster the data DOES list still narrows, so the rule is not showAll", () => {
    const names = classSpellCandidates(vaultRegistry(), [WIZARD_CLASS], 2, new Set(), false).map((c) => c.name);
    expect(names).not.toContain("Bless");
    expect(names).toHaveLength(3);
  });

  it("CONTROL: a non-caster (no class slugs) still gets nothing without showAll", () => {
    expect(classSpellCandidates(vaultRegistry(), [], 9, new Set(), false)).toHaveLength(0);
  });

  it("RED-FIRST: the known-slug drop and the name query still apply on the fallback path", () => {
    const reg = vaultRegistry();
    const kept = classSpellCandidates(reg, [ROGUE_CLASS], 1, new Set(["phb_spell_sleep"]), false).map((c) => c.slug);
    // Sorted level then name: Mage Hand (0) then Bless (1); Sleep is dropped as known.
    expect(kept).toEqual(["phb_spell_mage-hand", "phb_spell_bless"]);
    expect(classSpellCandidates(reg, [ROGUE_CLASS], 1, new Set(), false, "mage").map((c) => c.name))
      .toEqual(["Mage Hand"]);
  });
});
