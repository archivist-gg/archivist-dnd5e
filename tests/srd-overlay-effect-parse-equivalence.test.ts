import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { featureEffectSchema as NEW } from "../src/schemas/feature-effect-schema";
import { featureEffectSchema as OLD } from "./fixtures/feature-effect-schema.base-2bb492c";

// Spec R4-G1a G15: the widening cannot change what a regen would emit. Every effect authored in the two SRD overlays
// parses IDENTICALLY under the pre-widening union (frozen at 2bb492c) and the new one; the negative control proves
// the pair CAN differ. `npm run build:srd-canonical` is deliberately NOT run (it writes tracked data).
//
// ⚠️ RE-STATED at R4-G7 T5, and the restatement is the point. G1a could assert "identical" over the WHOLE authored
// set only because no overlay authored anything the widening had added. T5 authors twelve extra-attack, four
// unarmored-ac, four speed-bonus and two unarmed-strike effects, and three of those shapes are post-freeze: an
// unconditional "identical" would now be a demand that the new arms do nothing, which is the opposite of the guard's
// intent. So the set is SPLIT, and every bucket is asserted BY NAME (MEASURED at T5 over the 63 authored effects):
//   REJECTED by the frozen union   2 · `unarmed-strike`, an arm G1a's union does not carry at all;
//   PARSED BUT DIFFERENT           3 · the two Monk `speed-bonus` and the SRD 5e Fighter `extra-attack`, whose
//                                      `scales_at` key R4-G7 T2 added · the frozen union parses them and DROPS it;
//   IDENTICAL                     58 · everything else, which is where the original kill power lives: a silent
//                                      semantic change to any shared arm still reds this file.
// The bucket SIZES are pinned too, so a fourth shape drifting into the post-freeze set cannot pass unnoticed.
function effectsIn(v: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(v)) { for (const e of v) effectsIn(e, out); return out; }
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k === "effects" && Array.isArray(x)) out.push(...x); else effectsIn(x, out);
  }
  return out;
}
const overlays = ["tools/srd-canonical/overlays/srd-5e.yaml", "tools/srd-canonical/overlays/srd-2024.yaml"]
  .map((p) => yaml.load(readFileSync(p, "utf8")));
const effects = effectsIn(overlays);

describe("SRD overlays · old and new unions agree on every authored effect (G15)", () => {
  it("the fixture is the pre-widening union", () => {
    // The fixture's own header line says it "must contain no "immunity" arm", so a whole-file grep can never be
    // clean (Task 0 deviation D1). Assert over the CODE: the non-comment lines, and the parsed discriminators.
    const code = readFileSync("tests/fixtures/feature-effect-schema.base-2bb492c.ts", "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(code).not.toContain('"immunity"');
    const oldKinds = OLD.options.map((o) => (o.shape.kind as { value: string }).value);
    expect(oldKinds).toHaveLength(17);
    expect(oldKinds).not.toContain("immunity");
    expect(OLD.options).toHaveLength(17);
  });
  // RE-MEASURED at R4-G7 T5: 63 sites, was 41. The three pre-existing kinds are unchanged; the four new ones are
  // exactly what spec §8.1 item 2 authors (5e: fighter/barbarian/monk/paladin/ranger extra-attack · 2024: the same
  // five plus the Fighter's two-extra-attacks and three-extra-attacks).
  it("finds the overlays' effects (63 sites)", () => {
    const kinds = effects.map((e) => (e as { kind: string }).kind);
    expect(effects).toHaveLength(63);
    expect(kinds.filter((k) => k === "resistance")).toHaveLength(28);
    expect(kinds.filter((k) => k === "proficiency")).toHaveLength(11);
    expect(kinds.filter((k) => k === "ac-bonus")).toHaveLength(2);
    expect(kinds.filter((k) => k === "extra-attack")).toHaveLength(12);
    expect(kinds.filter((k) => k === "unarmored-ac")).toHaveLength(4);
    expect(kinds.filter((k) => k === "speed-bonus")).toHaveLength(4);
    expect(kinds.filter((k) => k === "unarmed-strike")).toHaveLength(2);
    expect(effects.some((e) => "subject" in (e as object))).toBe(false);
  });
  it("parses every PRE-FREEZE overlay effect identically, and says which are not", () => {
    const rejected: unknown[] = [], differing: unknown[] = [], identical: unknown[] = [];
    for (const e of effects) {
      const old = OLD.safeParse(e);
      if (!old.success) { rejected.push(e); continue; }
      if (JSON.stringify(NEW.parse(e)) === JSON.stringify(old.data)) identical.push(e); else differing.push(e);
    }
    // The kill power: 58 shared-arm effects must still round-trip identically through both unions.
    expect(identical).toHaveLength(58);
    // The frozen union has no `unarmed-strike` arm, so it refuses both authored copies outright.
    expect(rejected.map((e) => (e as { kind: string }).kind)).toEqual(["unarmed-strike", "unarmed-strike"]);
    // And it silently DROPS the `scales_at` key T2 added, on exactly three effects.
    expect(differing.map((e) => (e as { kind: string }).kind).sort())
      .toEqual(["extra-attack", "speed-bonus", "speed-bonus"]);
    for (const e of differing) {
      expect(OLD.parse(e)).not.toHaveProperty("scales_at");
      expect(NEW.parse(e)).toHaveProperty("scales_at");
    }
  });
  it("negative control: the two unions DO differ on a condition-carrying resistance", () => {
    const e = { kind: "resistance", damage_type: "Fire", condition: "while raging" };
    expect(OLD.parse(e)).not.toHaveProperty("condition");
    expect(NEW.parse(e)).toHaveProperty("condition", "while raging");
    expect(NEW.parse(e)).not.toEqual(OLD.parse(e));
  });
});
