import { describe, it, expect } from "vitest";
// RELATIVE specifiers, deliberately NOT the `@archivist-gg/dnd5e/<dir>/<file>` subpaths the sibling
// `*-schema-widening.test.ts` files use: dnd5e's package `exports` map has no `./condition/*` entry
// (the R4-G2 plan's file structure is locked and does not list `package.json`), so a subpath import
// resolves to ERR_PACKAGE_PATH_NOT_EXPORTED. Importing `../src/pack` and the codec through the SAME
// relative graph also keeps the `doc === conditionCodec` identity assertion honest (one module
// instance, no barrel/self-reference duplicate).
import { parseCondition } from "../src/condition/condition.parser";
import { conditionCodec } from "../src/condition/condition.codec";
import { dnd5ePack } from "../src/pack";

/* Fixtures are the MEASURED corpus shapes (spec §6: 89 docs, TWO key-sets only — with
 * `has_fluff_images` 39 · without 50). Bodies are the fence contents of real documents; the two
 * long descriptions are abridged (marked below), every other byte is the document's own. */

/** Converter emit, key-set WITH `has_fluff_images`
 *  (`output/Player's Handbook (2014)/Conditions/Unconscious.md`; description abridged to 2 bullets). */
const CONVERTER_UNCONSCIOUS = `slug: players-handbook-2014_condition_unconscious
name: Unconscious
edition: '2014'
source: Player's Handbook (2014)
description: |-
  - An unconscious creature is [[Player's Handbook (2014)/Conditions/Incapacitated|incapacitated]], can't move or speak, and is unaware of its surroundings.
  - The creature drops whatever it's holding and falls [[Player's Handbook (2014)/Conditions/Prone|prone]].
has_fluff_images: true
`;

/** Bundle emit, key-set WITHOUT `has_fluff_images` (`.compendium-bundle/SRD 5e/Conditions/Blinded.md`,
 *  verbatim). */
const BUNDLE_BLINDED_2014 = `slug: srd-5e_condition_blinded
name: Blinded
edition: '2014'
source: SRD 5.1
description: |-
  - A blinded creature can't see and automatically fails any ability check that requires sight.
  - Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage.
`;

/** The 2024 edition arm (`.compendium-bundle/SRD 2024/Conditions/Restrained.md`; description
 *  abridged to the lead line + one effect). */
const BUNDLE_RESTRAINED_2024 = `slug: srd-2024_condition_restrained
name: Restrained
edition: '2024'
source: SRD 5.2
description: |-
  While you have the Restrained condition, you experience the following effects.

  **Speed 0.** Your Speed is 0 and can't increase.
`;

/** An AUTHORED note: no `edition` key at all. Zero corpus carriers (all 89 spell it explicitly) —
 *  this is the shape the parser's seeded default exists for (spec §6). */
const AUTHORED_NO_EDITION = `slug: homebrew_condition_dazzled
name: Dazzled
source: Homebrew
description: The creature has disadvantage on attack rolls that rely on sight.
`;

describe("condition entity (spec §6) — parse", () => {
  it("converter key-set WITH has_fluff_images: the output key-set is EXACTLY the six declared keys, slug survives (race pattern: no KNOWN_KEYS, no raw bag)", () => {
    const r = parseCondition(CONVERTER_UNCONSCIOUS);
    expect(r.success).toBe(true);
    if (!r.success) return;
    // KEY-SET pin, not `in`-presence (floor 1 / G1b FR-I2): a dropped or an added key both fail.
    expect(Object.keys(r.data).sort()).toEqual(
      ["description", "edition", "has_fluff_images", "name", "slug", "source"],
    );
    expect(r.data.slug).toBe("players-handbook-2014_condition_unconscious");
    expect(r.data.name).toBe("Unconscious");
    expect(r.data.edition).toBe("2014");
    expect(r.data.source).toBe("Player's Handbook (2014)");
    expect(r.data.has_fluff_images).toBe(true);
    expect(r.data.description).toContain("unaware of its surroundings");
  });

  it("bundle key-set WITHOUT has_fluff_images: the output key-set is EXACTLY the five declared keys", () => {
    const r = parseCondition(BUNDLE_BLINDED_2014);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(Object.keys(r.data).sort()).toEqual(
      ["description", "edition", "name", "slug", "source"],
    );
    expect(r.data.slug).toBe("srd-5e_condition_blinded");
    expect(r.data.name).toBe("Blinded");
    expect(r.data.edition).toBe("2014");
    expect(r.data.source).toBe("SRD 5.1");
    expect(r.data.description).toContain("automatically fails any ability check");
    expect("has_fluff_images" in r.data).toBe(false);
  });

  it("the 2024 edition arm: a DECLARED edition wins over the seeded 2014 default", () => {
    const r = parseCondition(BUNDLE_RESTRAINED_2024);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.edition).toBe("2024");
    expect(Object.keys(r.data).sort()).toEqual(
      ["description", "edition", "name", "slug", "source"],
    );
    expect(r.data.name).toBe("Restrained");
    expect(r.data.source).toBe("SRD 5.2");
  });

  it("the edition DEFAULT: a fence with NO edition key parses as 2014", () => {
    const r = parseCondition(AUTHORED_NO_EDITION);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.edition).toBe("2014");
    expect(r.data.slug).toBe("homebrew_condition_dazzled");
  });

  it("CONTROL · the edition enum is CLOSED: an out-of-enum edition is refused (not coerced, not passed through)", () => {
    const r = parseCondition(BUNDLE_BLINDED_2014.replace("edition: '2014'", "edition: '2013'"));
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error).toContain("condition schema validation failed");
  });

  it("CONTROL · description is z.string(), NOT .min(1): an empty description is accepted (zero corpus carriers today — this pins the shape against a tightening)", () => {
    const r = parseCondition(`slug: homebrew_condition_blank\nname: Blank\nedition: '2014'\nsource: Homebrew\ndescription: ''\n`);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.description).toBe("");
  });

  it("CONTROL · the parser's required keys: a fence without slug is refused before validation", () => {
    const r = parseCondition(`name: Slugless\nedition: '2014'\nsource: Homebrew\ndescription: d\n`);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error).toContain("slug");
  });
});

describe("condition entity (spec §6) — pack dispatch", () => {
  it("dnd5ePack registers condition exactly once, with the condition codec as its doc codec", () => {
    const entries = dnd5ePack.entityTypes.filter((et) => et.type === "condition");
    expect(entries).toHaveLength(1);
    expect(entries[0].doc).toBe(conditionCodec);
  });

  it("the registered doc codec parses a bundle-shaped fence through the pack (the census's noParser bucket empties here)", () => {
    const entry = dnd5ePack.entityTypes.find((et) => et.type === "condition");
    expect(entry?.doc).toBeDefined();
    const r = entry!.doc!.parse({
      type: "condition",
      frontmatter: {
        archivist: true,
        entity_type: "condition",
        slug: "srd-2024_condition_restrained",
        name: "Restrained",
        compendium: "SRD 2024",
        source: "SRD 5.2",
      },
      body: BUNDLE_RESTRAINED_2024,
      raw: "",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    const data = r.data as Record<string, unknown>;
    expect(data.name).toBe("Restrained");
    expect(data.edition).toBe("2024");
    expect(data.slug).toBe("srd-2024_condition_restrained");
  });
});
