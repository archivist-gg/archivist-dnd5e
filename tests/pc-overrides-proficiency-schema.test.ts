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
      overrides: {
        languages: { add: ["elvish"], remove: ["dwarvish"] },
        tools: { add: ["MCDM"], remove: ["Thieves' Tools"] },
      },
    });
    expect(parsed.overrides.languages?.add).toEqual(["elvish"]);
    expect(parsed.overrides.languages?.remove).toEqual(["dwarvish"]);
    expect(parsed.overrides.tools?.add).toEqual(["MCDM"]);
    // `tools.remove` asserted too: all four leaves round-trip, in both keys.
    expect(parsed.overrides.tools?.remove).toEqual(["Thieves' Tools"]);
  });

  it("materializes NOTHING the note did not write, at either level", () => {
    // Byte-stability for every existing vault note. THREE inputs, one per depth, because each is
    // blind to the default the next one catches. Every claim below is mutation-verified.

    // 1. No `overrides` key at all. Catches nothing on its own: the container's `.default({})`
    //    returns `{}` un-re-parsed (zod 4), so zod never descends and no inner default can fire.
    const parsed = characterSchema.parse({ ...base });
    expect(parsed.overrides).toEqual({});
    expect(parsed.overrides.languages).toBeUndefined();

    // 2. An `overrides` block that does not mention us. NOW zod descends, so a `.default({})` on
    //    `languages`/`tools` would materialize the key and rewrite the file. Input 1 stays green
    //    under that mutation; this one goes red.
    const withBlock = characterSchema.parse({ ...base, overrides: { ac: 12 } });
    expect(withBlock.overrides).toEqual({ ac: 12 });

    // 3. The parent key PRESENT, one leaf written. This is every add-only entry the mutators write,
    //    and it is the only input that can see a leaf `.default([])`: inputs 1 and 2 never reach the
    //    leaves at all, and the round-trip test above supplies both leaves so it cannot either.
    const addOnly = characterSchema.parse({ ...base, overrides: { languages: { add: ["elvish"] } } });
    expect(addOnly.overrides).toEqual({ languages: { add: ["elvish"] } });
  });

  it("pins the schema's key set against an explicit literal, so no key lands here unnoticed", () => {
    // READ THE NAME LITERALLY. This compares `characterOverridesShape` against the hardcoded literal
    // below, which is a THIRD artifact: it is NOT the schema-vs-CharacterOverrides parity check.
    // The full matrix, so nobody reads more into it than it does:
    //   schema gains a key, literal not updated ................... RED here
    //   literal gains a key, schema not updated ................... RED here
    //   CharacterOverrides gains a key, schema does not ........... NOT caught here
    //   schema + literal gain a key, CharacterOverrides does not .. NOT caught here
    // The last two are the silent-strip this store exists to prevent, and they are BUILD errors,
    // from the NoOverridesKeyDrift pair in src/pc/pc.types.ts that `tsc -b --force` compiles. What
    // this test adds on top is a deliberate speed bump: the literal has to be edited by hand, so a
    // key cannot reach the schema without someone noticing.
    const schemaKeys = Object.keys(characterOverridesShape.shape).sort();

    // The `keyof` annotation lives on its own const and the array is copied before sorting on
    // purpose: `[...].sort()` widens to `string[]`, so the inline form needs an `as` cast, and that
    // cast silently disables the annotation outright (probe-verified, R4-P3b T2).
    // KNOWN LIMIT, recorded not fixed: this repo typechecks `tests/` with NOTHING, so even the
    // corrected annotation is documentation here; the runtime toEqual below is this test's whole
    // enforcement, and pc.types.ts carries the half that the compiler actually checks.
    const declaredKeys: Array<keyof CharacterOverrides> = [
      "ac", "attunement_limit", "hp", "initiative", "languages", "passives", "saves",
      "scores", "skills", "speed", "spell_slots", "spellcasting_ability",
      "spellcasting_ability_by_class", "tools",
    ];
    const declared = [...declaredKeys].sort();

    expect(schemaKeys).toEqual(declared);
  });
});
