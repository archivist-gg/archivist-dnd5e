import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { featureEffectSchema as NEW } from "../src/schemas/feature-effect-schema";
import { featureEffectSchema as OLD } from "./fixtures/feature-effect-schema.base-2bb492c";

// Spec R4-G1a G15: the widening cannot change what a regen would emit. Every effect authored in the two SRD overlays
// parses IDENTICALLY under the pre-widening union (frozen at 2bb492c) and the new one; the negative control proves
// the pair CAN differ. `npm run build:srd-canonical` is deliberately NOT run (it writes tracked data).
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
  it("finds the overlays' effects (41 sites: resistance 28, proficiency 11, ac-bonus 2)", () => {
    const kinds = effects.map((e) => (e as { kind: string }).kind);
    expect(kinds.filter((k) => k === "resistance")).toHaveLength(28);
    expect(kinds.filter((k) => k === "proficiency")).toHaveLength(11);
    expect(kinds.filter((k) => k === "ac-bonus")).toHaveLength(2);
    expect(effects.some((e) => "subject" in (e as object))).toBe(false);
  });
  it("parses every overlay effect identically", () => {
    for (const e of effects) expect(NEW.parse(e)).toEqual(OLD.parse(e));
  });
  it("negative control: the two unions DO differ on a condition-carrying resistance", () => {
    const e = { kind: "resistance", damage_type: "Fire", condition: "while raging" };
    expect(OLD.parse(e)).not.toHaveProperty("condition");
    expect(NEW.parse(e)).toHaveProperty("condition", "while raging");
    expect(NEW.parse(e)).not.toEqual(OLD.parse(e));
  });
});
