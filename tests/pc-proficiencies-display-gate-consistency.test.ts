import { describe, it, expect } from "vitest";
import { aggregateProficiencies } from "../src/pc/pc.proficiencies";
import { computeProficiencies } from "../src/pc/pc.recalc";
import { isProficientWithWeapon, isProficientWithArmor } from "../src/pc/pc.proficiency-query";
import type { ResolvedCharacter, ResolvedClass } from "../src/pc/pc.types";
import type { WeaponEntity } from "../src/weapon/weapon.types";
import type { ArmorEntity } from "../src/armor/armor.types";
import cls2014 from "../src/srd/data/runtime/class.2014.json";
import cls2024 from "../src/srd/data/runtime/class.2024.json";
import weapon2014 from "../src/srd/data/runtime/weapon.2014.json";
import armor2024 from "../src/srd/data/runtime/armor.2024.json";

// ─────────────────────────────────────────────────────────────────────────────
// R3-P2 D5 guard: the DISPLAY aggregate (`aggregateProficiencies`) and the
// combat-eligibility GATE (`computeProficiencies` + `isProficientWith*`) read
// class proficiencies through different projections. This locks them together so
// a future change to one path that silently disagrees with the other fails here.
//   - 2014 Rogue → the WEAPON axis: a class `weapons.fixed` name (rapier).
//   - 2024 Fighter → the ARMOR axis: a class armor category (heavy, via plate).
// R4-P3b §7.1 reshaped the display buckets to `ProficiencyEntry[]`, so both
// halves read `.value` · the RAW authored string, which is what the gate side
// compares against. Reading `.label` instead would loosen the guard by letting
// the two paths agree only after humanization.
// ─────────────────────────────────────────────────────────────────────────────

const arr = (d: unknown): Array<{ slug: string }> =>
  (Array.isArray(d) ? d : Object.values(d as object)) as Array<{ slug: string }>;

function findEntity(d: unknown, slug: string): { slug: string } {
  const hit = arr(d).find((c) => c.slug === slug || c.slug.endsWith(`_${slug}`));
  if (!hit) throw new Error(`entity not found: ${slug}`);
  return hit;
}

// Minimal shell carrying real class entities · the only fields display/gate read
// for a class-only character (mirrors pc-recalc-proficiency-characterization).
function resolvedFromClasses(entities: Array<{ slug: string }>): ResolvedCharacter {
  const classes: ResolvedClass[] = entities.map(
    (entity) => ({ entity: entity as never, level: 1, subclass: null, choices: {} }),
  );
  return {
    definition: {} as ResolvedCharacter["definition"],
    race: null,
    classes,
    background: null,
    feats: [],
    totalLevel: entities.length,
    features: [],
    spells: [],
    pools: [],
    weaponMasteries: [],
    state: {} as ResolvedCharacter["state"],
  } as ResolvedCharacter;
}

// Runtime registry entities carry the query-relevant fields (slug/name/category);
// cast once to the entity type the query functions expect.
const rapier = findEntity(weapon2014, "srd-5e_weapon_rapier") as unknown as WeaponEntity;
const plate = findEntity(armor2024, "srd-2024_armor_plate-armor") as unknown as ArmorEntity;

// NOTE (R4-P3c): this file pins display-vs-gate parity for CLASS grants only.
// aggregateProficiencies now also includes feature-effect grants while
// computeProficiencies does not, so these assertions no longer prove parity in
// the effect dimension. Do not read them as if they did.
describe("display/gate proficiency consistency (real SRD entities)", () => {
  it("2014 Rogue: rapier shows in display weapons AND passes the weapon gate", () => {
    const resolved = resolvedFromClasses([findEntity(cls2014, "rogue")]);

    const display = aggregateProficiencies(resolved);
    expect(display.weapons.some((w) => w.value.toLowerCase().includes("rapier"))).toBe(true);
    // BOTH halves, deliberately. The pre-R4-P3b assertion ran through prettyName,
    // so moving it to `.value` traded away its incidental cover of display
    // humanization. `.value` is the half the GATE compares against and must stay
    // · this line restores the other half. The 2014 Rogue weapons LABEL is
    // pinned nowhere else (the armor and tools axes have cover in
    // pc-proficiencies-aggregate.test.ts, the weapons-label axis does not).
    expect(display.weapons.some((w) => w.label.toLowerCase().includes("rapier"))).toBe(true);

    expect(isProficientWithWeapon(rapier, computeProficiencies(resolved))).toBe(true);
  });

  it("2024 Fighter: plate's category shows in display armor AND passes the armor gate", () => {
    const resolved = resolvedFromClasses([findEntity(cls2024, "fighter")]);

    const display = aggregateProficiencies(resolved);
    expect(display.armor.some((a) => a.value.toLowerCase() === plate.category)).toBe(true);

    expect(isProficientWithArmor(plate, computeProficiencies(resolved))).toBe(true);
  });
});
