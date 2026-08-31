import { describe, it, expect } from "vitest";
import { imageField, additionalSpellsEntrySchema, progressionSchema }
  from "@archivist-gg/dnd5e/schemas/entity-extras-schema";
import { z } from "zod";

const wrap = z.object({ image: imageField });
describe("imageField (§2.1, §9.4 — zero census carriers, fixture is the ONLY kill power)", () => {
  it("accepts the single-wikilink arm", () =>
    expect(wrap.safeParse({ image: "[[img/x.webp]]" }).success).toBe(true));
  it("accepts the array arm, including empty (no .nonempty — spec f13)", () => {
    expect(wrap.safeParse({ image: ["[[a]]", "[[b]]"] }).success).toBe(true);
    expect(wrap.safeParse({ image: [] }).success).toBe(true);
  });
  it("is optional (absent key parses)", () =>
    expect(wrap.safeParse({}).success).toBe(true));
});

describe("additionalSpellsEntrySchema (§2.1 — loose leaves pass 5etools shapes VERBATIM)", () => {
  it("keeps the bundle's known.'1' wikilink form verbatim", () => {
    const r = additionalSpellsEntrySchema.safeParse(
      { known: { "1": ["[[SRD 2024/Spells/Druidcraft|xphb|druidcraft|xphb]]"] } });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.known).toEqual(
      { "1": ["[[SRD 2024/Spells/Druidcraft|xphb|druidcraft|xphb]]"] });
  });
  it("accepts ability as string AND as {choose}", () => {
    expect(additionalSpellsEntrySchema.safeParse({ ability: "int" }).success).toBe(true);
    expect(additionalSpellsEntrySchema.safeParse({ ability: { choose: ["int", "cha"] } }).success).toBe(true);
  });
});

describe("progressionSchema (§2.1 — SHAPE CHARACTERISATION, distribution lives in T0's record)", () => {
  it("accepts the record form with the literal '*' key", () =>
    expect(progressionSchema.safeParse(
      { name: "Epic Boon", category: ["EB"], progression: { "19": 1, "*": 2 } }).success).toBe(true));
  it("accepts the ARRAY form (class.optionalfeature_progression)", () =>
    expect(progressionSchema.safeParse(
      { name: "Infusions", feature_type: ["AI"], progression: [0, 4, 4, 4] }).success).toBe(true));
  it("keeps featureType (camelCase, the ONLY subclass spelling) and required verbatim", () => {
    const r = progressionSchema.safeParse({ name: "Elemental Disciplines", featureType: ["ED"],
      progression: { "3": 1 }, required: { "3": ["Elemental Attunement|PHB"] } });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.featureType).toEqual(["ED"]);
      expect(r.data.required).toEqual({ "3": ["Elemental Attunement|PHB"] });
    }
  });
});
