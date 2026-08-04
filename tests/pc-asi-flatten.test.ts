import { describe, expect, it } from "vitest";
import { flattenAsiOrFeat } from "../src/pc/pc.asi-flatten";
import type { Choice } from "../src/types/choice";

// Typed as the select-inline ARM, not the `Choice` union: typing it `Choice`
// makes `TWO_STEP.options` a TS2339 in the mutation cases below (MEASURED: 4 of
// them, at :32 :49×2 :55).
type SelectInline = Extract<Choice, { kind: "select-inline" }>;
const TWO_STEP = {
  kind: "select-inline", id: "asi-or-feat", count: 1,
  options: [
    { value: "asi", label: "Ability Score Increase",
      choices: [{ kind: "ability-points", id: "asi", points: 2, max_per: 2 }] },
    { value: "feat", label: "Feat",
      choices: [{ kind: "select-entity", id: "feat", entity_type: "feat", count: 1 }] },
  ],
} as SelectInline;
// ⚠️ Do NOT export this fixture for reuse in another test file. MEASURED: importing
// any symbol from a vitest test file re-registers and RE-RUNS that file's whole
// suite inside the importer. Task 1 Step 6 declares its own local copy instead.
// (`as SelectInline`, not `satisfies`: the latter narrows `options`' element type
// to a union of the two literals, which makes the `.push` in the sibling case
// 4 × TS2322 "not assignable to type 'never'".)

describe("flattenAsiOrFeat", () => {
  it("lifts the feat branch's inner choice verbatim", () => {
    expect(flattenAsiOrFeat(TWO_STEP)).toEqual(
      { kind: "select-entity", id: "feat", entity_type: "feat", count: 1 },
    );
  });

  it("preserves a homebrew `where` on the lifted choice", () => {
    const hb = structuredClone(TWO_STEP) as typeof TWO_STEP;
    (hb.options[1].choices![0] as Record<string, unknown>).where = { category: "origin" };
    expect(flattenAsiOrFeat(hb)).toMatchObject({ where: { category: "origin" } });
  });

  it("does not mutate its input", () => {
    const before = structuredClone(TWO_STEP);
    flattenAsiOrFeat(TWO_STEP);
    expect(TWO_STEP).toEqual(before);
  });

  it("leaves a differently-keyed select-inline untouched", () => {
    const other = { ...TWO_STEP, id: "fighting-style" };
    expect(flattenAsiOrFeat(other as Choice)).toBe(other);
  });

  it("leaves it untouched when no branch offers a feat select-entity", () => {
    const noFeat = structuredClone(TWO_STEP) as typeof TWO_STEP;
    noFeat.options = [noFeat.options[0]];
    expect(flattenAsiOrFeat(noFeat)).toBe(noFeat);
  });

  it("leaves it untouched when the feat branch carries a SIBLING choice", () => {
    const sib = structuredClone(TWO_STEP) as typeof TWO_STEP;
    sib.options[1].choices!.push({ kind: "ability-points", id: "bonus", points: 1, max_per: 1 });
    expect(flattenAsiOrFeat(sib)).toBe(sib);
  });
});
