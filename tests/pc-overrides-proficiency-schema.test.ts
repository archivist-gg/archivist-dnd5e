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
      "ac", "attunement_limit", "defenses", "hp", "initiative", "languages", "passives", "saves",
      "scores", "skills", "speed", "spell_slots", "spellcasting_ability",
      "spellcasting_ability_by_class", "tools",
    ];
    const declared = [...declaredKeys].sort();

    expect(schemaKeys).toEqual(declared);
  });

  it("R4-G4 §9.3 (RED FIRST): overrides.tools.proficiency accepts a tri per tool and a pre-phase {add, remove} file still parses", () => {
    // UR1 Tier B. The key space is OPEN (tool names are not an enum, unlike `skills`),
    // so the pins are the VALUE round trip and the rejected fourth state.
    const tri = characterOverridesShape.safeParse({ tools: { proficiency: { "thieves'-tools": "expertise", "herbalism-kit": "none" } } });
    // the VALUE assertion FIRST (§17 row 36's RED, invariant 4), then the boolean
    expect(tri.success && tri.data.tools?.proficiency).toEqual({ "thieves'-tools": "expertise", "herbalism-kit": "none" });
    expect(tri.success).toBe(true);
    expect(characterOverridesShape.safeParse({ tools: { proficiency: { "thieves'-tools": "double" } } }).success).toBe(false);
    // A pre-phase file parses UNCHANGED: asserted on the VALUE, not on `success`, because
    // the thing §9.3 promises is that no `proficiency: {}` materializes on a note that never
    // wrote one · a `.default({})` on the new sibling would rewrite every existing vault note
    // and `success` alone cannot see it (the file's no-defaults obsession, three inputs above).
    const prePhase = characterOverridesShape.safeParse({ tools: { add: ["x"], remove: ["y"] } });
    expect(prePhase.success && prePhase.data.tools).toEqual({ add: ["x"], remove: ["y"] });
  });
});

describe("overrides.defenses", () => {
  it("round-trips a remove list in every bucket, preserving the AUTHORED spelling", () => {
    // `characterOverridesShape` is NOT `.strict()`, so a bucket key misspelled in the schema is a
    // SILENT no-op: zod drops the unknown key, the parse succeeds, and nothing else in the repo
    // notices. This test is the only thing standing between that and a shipped store.
    //
    // Every value below is authored in Title Case, which is NOT its `toDefenseSlug` form. That is
    // deliberate: it makes the assertion prove WHICH string survived, not merely that A string did.
    // The store persists what the note wrote, verbatim; normalization is the reader's job (Task 5).
    const parsed = characterSchema.parse({
      ...base,
      overrides: {
        defenses: {
          resistances: { remove: ["Psychic"] },
          immunities: { remove: ["Necrotic"] },
          vulnerabilities: { remove: ["Bludgeoning"] },
          condition_immunities: { remove: ["Charmed"] },
        },
      },
    });
    // All four buckets asserted, not just one: each bucket key is an independent chance to mis-key
    // the schema, and a sibling that happens to work proves nothing about the others.
    expect(parsed.overrides.defenses?.resistances?.remove).toEqual(["Psychic"]);
    expect(parsed.overrides.defenses?.immunities?.remove).toEqual(["Necrotic"]);
    expect(parsed.overrides.defenses?.vulnerabilities?.remove).toEqual(["Bludgeoning"]);
    expect(parsed.overrides.defenses?.condition_immunities?.remove).toEqual(["Charmed"]);
  });

  it("materializes NOTHING the note did not write, at either level", () => {
    // The defenses twin of the languages/tools byte-stability test above. A `.default({})` on the
    // `defenses` key itself is already caught up there by the `{ ac: 12 }` input, which pins the
    // whole parsed `overrides` object (mutation-verified). What only THIS test can see is a default
    // one or two levels deeper, where the parent is present and zod therefore descends.
    //
    // THE RULE THIS TEST IS BUILT ON, and the one that made two earlier versions of it vacuous: a
    // default can only fire on a key that is ABSENT while its PARENT is present. So whatever an
    // input writes, it is blind to at that level, and an input can never guard the key it supplies.
    // Hence three inputs, one per depth, each written to leave the level below it empty. Do not
    // "simplify" them into one · every combination was measured, and no single input covers two
    // levels. Coverage is stated per input below, and each claim is mutation-verified.

    // 1. `defenses` present, ALL FOUR buckets ABSENT. The only input that can see a `.default({})`
    //    on a bucket, and it sees all four at once (verified at zod 4.4.3: `.partial()` does not
    //    neuter an inner default). Inputs 2 and 3 write buckets, so each is blind to the ones it
    //    writes · measured: with this input missing, a bucket default on `resistances` passed 5/5
    //    while the same mutant on the other three died, purely because no input left `resistances`
    //    absent. Sees NOTHING at the leaf: with no bucket present, zod never descends that far.
    const emptyStore = characterSchema.parse({ ...base, overrides: { defenses: {} } });
    expect(emptyStore.overrides).toEqual({ defenses: {} });

    // 2. The realistic authored note: one bucket, one suppression. Adds no bucket-level coverage
    //    that input 1 lacks · state its reach exactly, because the loose version of this sentence
    //    ("catches a default on any bucket") was FALSE: it catches a bucket default on the three
    //    siblings it does not write and nothing at all on `resistances`, the one it does. What it
    //    pins is the end-to-end shape a real note round-trips to, one level up from the leaf.
    const oneBucket = characterSchema.parse({
      ...base,
      overrides: { defenses: { resistances: { remove: ["Psychic"] } } },
    });
    expect(oneBucket.overrides).toEqual({ defenses: { resistances: { remove: ["Psychic"] } } });

    // 3. All four buckets present with `remove` ABSENT. The only input that can see a `.default([])`
    //    on a leaf: inputs 1 and 2 cannot, input 1 because it never reaches a bucket and input 2
    //    because it supplies `remove`. NOTE THE ASYMMETRY WITH languages/tools · those carry TWO
    //    leaves, so writing one of them (`{ add: [...] }`) already exercises the other's default. A
    //    defenses bucket has exactly ONE leaf, so an empty bucket is the only way to reach that
    //    default at all (measured: a leaf default survived 5/5 before this input existed). All four
    //    buckets, not one, because the leaf default is declared per bucket.
    const emptyBuckets = characterSchema.parse({
      ...base,
      overrides: {
        defenses: { resistances: {}, immunities: {}, vulnerabilities: {}, condition_immunities: {} },
      },
    });
    expect(emptyBuckets.overrides).toEqual({
      defenses: { resistances: {}, immunities: {}, vulnerabilities: {}, condition_immunities: {} },
    });
  });
});
