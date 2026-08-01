import { describe, expect, it } from "vitest";
import { characterOverridesShape, characterSchema } from "../src/pc/pc.schema";
import type { CharacterOverrides } from "../src/pc/pc.types";

// Minimal valid character literal, copied from tests/pc-rest-hp-modifier.test.ts:10-15.
// `abilities`, `ability_method` and `state` are all required, so a hand-rolled fixture
// throws for the wrong reason.
const base = {
  name: "T", edition: "2024", ability_method: "manual",
  class: [{ name: "[[c]]", level: 1 }],
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  state: { hp: { current: 1, max: 1, temp: 0 } },
};

describe("overrides.{languages,tools}", () => {
  it("round-trips add and remove through the character schema", () => {
    const parsed = characterSchema.parse({
      ...base,
      overrides: { languages: { add: ["elvish"], remove: ["dwarvish"] }, tools: { add: ["MCDM"] } },
    });
    expect(parsed.overrides.languages?.add).toEqual(["elvish"]);
    expect(parsed.overrides.languages?.remove).toEqual(["dwarvish"]);
    expect(parsed.overrides.tools?.add).toEqual(["MCDM"]);
  });

  it("leaves the keys ABSENT when the note never used the feature", () => {
    // Byte-stability for every existing vault note: no nested default may materialize these.
    const parsed = characterSchema.parse({ ...base });
    expect(parsed.overrides).toEqual({});
    expect(parsed.overrides.languages).toBeUndefined();

    // The SECOND input is the one that bites, and it is not redundant: with `overrides` absent
    // entirely, the container's own `.default({})` returns `{}` un-re-parsed, so zod never descends
    // and a stray `.default({})` on `languages` would slip past. Mutation-verified: adding that
    // default leaves the assertion above GREEN and turns only the one below RED.
    const withBlock = characterSchema.parse({ ...base, overrides: { ac: 12 } });
    expect(withBlock.overrides).toEqual({ ac: 12 });
  });

  it("FAILS if a key is added to one of the two files and not the other", () => {
    // The guard spec 3.1 calls "the highest-leverage artifact P3b hands P5": P5 adds
    // overrides.defenses to the SAME object literal and walks into the identical trap.
    // A `toContain` pair does NOT do this: it passes when CharacterOverrides alone gains a key.
    const schemaKeys = Object.keys(characterOverridesShape.shape).sort();

    // Explicit literal, updated deliberately whenever the store changes. The `keyof` annotation is
    // the intended second half of the guard: a name here that is NOT on CharacterOverrides is a type
    // error. It is annotated on its own const and copied before sorting on purpose: `[...].sort()`
    // widens to `string[]`, so the inline form needs an `as` cast, and that cast silently disables
    // the check outright (probe-verified, R4-P3b T2).
    // KNOWN LIMIT, recorded not fixed: this repo typechecks `tests/` with NOTHING, so today the
    // annotation is documentation and the runtime toEqual below is the whole enforcement.
    const declaredKeys: Array<keyof CharacterOverrides> = [
      "ac", "attunement_limit", "hp", "initiative", "languages", "passives", "saves",
      "scores", "skills", "speed", "spell_slots", "spellcasting_ability",
      "spellcasting_ability_by_class", "tools",
    ];
    const declared = [...declaredKeys].sort();

    expect(schemaKeys).toEqual(declared);
  });
});
