import { describe, it, expect } from "vitest";
import { computeProficiencies } from "../src/pc/pc.recalc";
import type { ResolvedCharacter, ResolvedClass } from "../src/pc/pc.types";
import cls2014 from "../src/srd/data/runtime/class.2014.json";
import cls2024 from "../src/srd/data/runtime/class.2024.json";

// ─────────────────────────────────────────────────────────────────────────────
// GOLDEN-MASTER characterization of the combat-eligibility GATE
// (`computeProficiencies`) over REAL SRD class entities, locking it against
// SILENT drift from the D6 Layer 1 / D7 split of `normalizeProfList`.
//
// The two INTENDED deltas vs the documented pre-change behavior are:
//   (i)  D6 Layer 1 - each class's `weapons.fixed` / `tools.fixed` DISPLAY
//        names now reach `weapons.specific` / `tools.specific` (previously the
//        object branch read only `.categories`/`.specific`, so `.fixed` was
//        silently DROPPED). Rogue's rapiers/shortswords/longswords/hand
//        crossbows and Thieves' tools now appear.
//   (ii) D7 - class armor category arrays now reach `armor.categories`
//        (previously the array branch routed them to `armor.specific`, where
//        `isProficientWithArmor` never looked). Fighter's heavy/medium/light/
//        shield now appear under categories.
// Everything else (weapon categories, languages, saves) is byte-identical to
// the pre-change output. `.fixed` names stay verbatim display strings - this
// task ROUTES them; slug-matching them is Task 3's job.
// ─────────────────────────────────────────────────────────────────────────────

const arr = (d: unknown): Array<{ slug: string }> =>
  (Array.isArray(d) ? d : Object.values(d as object)) as Array<{ slug: string }>;
const findEntity = (d: unknown, slug: string): { slug: string } => {
  const hit = arr(d).find((c) => c.slug === slug || c.slug.endsWith(`_${slug}`));
  if (!hit) throw new Error(`class not found: ${slug}`);
  return hit;
};

// Build a ResolvedCharacter from the REAL runtime registry entities. The gate
// only reads resolved.classes[].entity.proficiencies (+ race/bg/feats), so a
// minimal shell carrying the real class entities is a faithful fixture.
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
    state: {} as ResolvedCharacter["state"],
  } as ResolvedCharacter;
}

describe("computeProficiencies - gate characterization (real SRD entities)", () => {
  it("2014 Rogue: weapons.fixed → specific (i), armor array → categories (ii)", () => {
    const resolved = resolvedFromClasses([findEntity(cls2014, "rogue")]);
    expect(computeProficiencies(resolved)).toEqual({
      armor: { categories: ["light"], specific: [] },
      weapons: {
        categories: ["simple"],
        // (i) intended delta: fixed display names now surface here
        specific: ["hand crossbows", "longswords", "rapiers", "shortswords"],
      },
      // (i) intended delta: tools.fixed now surfaces here
      tools: { categories: [], specific: ["Thieves\u2019 tools"] },
      languages: [],
      saves: [],
    });
  });

  it("2024 Fighter: armor array → categories (ii), not specific", () => {
    const resolved = resolvedFromClasses([findEntity(cls2024, "fighter")]);
    expect(computeProficiencies(resolved)).toEqual({
      // (ii) intended delta: heavy/medium/light/shield now under categories
      armor: { categories: ["light", "medium", "heavy", "shield"], specific: [] },
      weapons: { categories: ["simple", "martial"], specific: [] },
      tools: { categories: [], specific: [] },
      languages: [],
      saves: [],
    });
  });

  it("multiclass 2014 Rogue / 2014 Wizard: fixed lists merge into specific in class order", () => {
    const resolved = resolvedFromClasses([
      findEntity(cls2014, "rogue"),
      findEntity(cls2014, "wizard"),
    ]);
    expect(computeProficiencies(resolved)).toEqual({
      armor: { categories: ["light"], specific: [] },
      weapons: {
        categories: ["simple"],
        // (i) intended delta: both classes' fixed names, rogue then wizard
        specific: [
          "hand crossbows",
          "longswords",
          "rapiers",
          "shortswords",
          "daggers",
          "darts",
          "slings",
          "quarterstaffs",
          "light crossbows",
        ],
      },
      tools: { categories: [], specific: ["Thieves\u2019 tools"] },
      languages: [],
      saves: [],
    });
  });
});
