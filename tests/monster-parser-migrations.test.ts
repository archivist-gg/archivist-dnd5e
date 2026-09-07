import { describe, it, expect } from "vitest";
import { parseMonster } from "../src/monster/monster.parser";

function ok(body: string) {
  const r = parseMonster(body);
  if (!r.success) throw new Error(`refused: ${r.error}`);
  return r.data as unknown as Record<string, unknown>;   // `Monster` to Record needs the `unknown` hop (TS2352: Gate 2 I-5)
}
function refused(body: string): string {
  const r = parseMonster(body);
  return r.success ? "" : r.error;
}

describe("migrateLegacy keeps the hand parser's tolerances (R4-G6 §4.1)", () => {
  it("step 1: legendary alias moves and the source key is deleted; a numeric legendary_actions becomes the uses count", () => {
    const m = ok("name: X\nlegendary:\n  - name: Tail\n    entries: ['...']\nlegendary_actions: 4");
    expect((m.legendary_actions as unknown[]).length).toBe(1);
    expect(m.legendary_action_uses).toBe(4);
    expect(m.raw).toBeUndefined();
  });
  it("step 1: numeric legendary_actions beside a present legendary_action_uses is dropped, not refused", () => {
    const m = ok("name: X\nlegendary_actions: 3\nlegendary_action_uses: 2");
    expect(m.legendary_action_uses).toBe(2);
    expect(m.legendary_actions).toBeUndefined();
  });
  it("step 2: scalar ac / hp and an ac of numbers", () => {
    expect(ok("name: X\nac: 15\nhp: 7").ac).toEqual([{ ac: 15 }]);
    expect(ok("name: X\nac: 15\nhp: 7").hp).toEqual({ average: 7 });
    expect(ok("name: X\nac: [15]").ac).toEqual([{ ac: 15 }]);
  });
  it("step 3: a numeric cr", () => {
    expect(ok("name: X\ncr: 5").cr).toBe("5");
    expect(ok("name: X\ncr: 0.25").cr).toBe("0.25");
  });
  it("step 4: numeric strings coerce on the named leaves incl. speed modes; other strings refuse loudly", () => {
    expect(ok('name: X\npassive_perception: "12"').passive_perception).toBe(12);
    expect(ok('name: X\nskills:\n  Perception: "+7"').skills).toEqual({ Perception: 7 });
    expect(ok('name: X\nhp:\n  average: "52"').hp).toEqual({ average: 52 });
    expect(ok('name: X\nabilities:\n  str: "12"').abilities).toMatchObject({ str: 12 });
    expect(ok('name: X\nspeed:\n  walk: "30"').speed).toEqual({ walk: 30 });
    expect(ok('name: X\nac:\n  - ac: "15"').ac).toEqual([{ ac: 15 }]);
    expect(ok('name: X\nsaves:\n  wis: "+5"').saves).toEqual({ wis: 5 });
    expect(refused('name: X\npassive_perception: "high"')).toMatch(/passive_perception/);
    expect(refused('name: X\nspeed:\n  walk: "30 ft."')).toMatch(/speed/);
    expect(refused("name: X\nimage: ''")).toMatch(/image/);
    expect(refused("name: X\nac:\n  - ac: fifteen")).toMatch(/"path": \[\s*"ac",\s*0,\s*"ac"\s*\]/);
    expect(refused("name: X\nhp:\n  average: lots")).toMatch(/"path": \[\s*"hp",\s*"average"\s*\]/);
    expect(refused("name: X\ninitiative:\n  advantage_mode: 7")).toMatch(/"path": \[\s*"initiative"\s*\]/);
  });
  /* GREEN at their first run: they pin SHIPPED behaviour (spec §4.1, invariant 6). The hand parser dropped all three
   * silently; the codec refuses them loudly, each at its own zod issue path. The step-2 lift is NUMBERS only, so a
   * QUOTED `hp: "52"` / `ac: "15"` never reaches the object / array shape the schema declares. */
  it("the three refusals the hand parser used to drop silently: a quoted hp, a quoted ac, a non-string name", () => {
    expect(refused('name: X\nhp: "52"')).toMatch(/"path": \[\s*"hp"\s*\]/);
    expect(refused('name: X\nac: "15"')).toMatch(/"path": \[\s*"ac"\s*\]/);
    expect(refused("name: 5")).toMatch(/"path": \[\s*"name"\s*\]/);
  });
  it("step 5: the generic non-finite scrub", () => {
    expect(ok("name: X\nhp:\n  average: .nan\n  formula: 2d8").hp).toEqual({ formula: "2d8" });
    expect(ok("name: X\nspeed:\n  fly: .nan\n  walk: 30").speed).toEqual({ walk: 30 });
    expect(ok("name: X\nac:\n  - ac: .nan").ac).toEqual([{}]);
  });
  it("step 6: a missing ability score is 10", () => {
    expect(ok("name: X\nabilities:\n  str: 12").abilities).toEqual({ str: 12, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
    expect(refused("name: X\nabilities: strong")).toMatch(/abilities/);
  });
  it("step 7: a bare senses / languages string becomes a one-element array", () => {
    expect(ok("name: X\nsenses: darkvision 60 ft.").senses).toEqual(["darkvision 60 ft."]);
    expect(ok("name: X\nlanguages: Common").languages).toEqual(["Common"]);
  });
  it("step 8: desc becomes description; a bad recharge is deleted", () => {
    const m = ok("name: X\ntraits:\n  - name: T\n    desc: prose\n    recharge:\n      type: weird\n      param: 5");
    expect((m.traits as { description?: string; recharge?: unknown }[])[0]).toEqual({ name: "T", description: "prose" });
  });
  it("step 9: a null on a declared leaf is deleted; senses / languages / group nulls are kept", () => {
    const m = ok("name: X\ncr:\nsize:\ntype:\nalignment:\nsubtype:\ncolumns:\nlegendary_resistance:\npassive_perception:\nhp:\nac:\nspeed:\ntraits:\nsaves:\n  wis:\nsenses:\nlanguages:\ngroup:");
    expect(Object.keys(m).sort()).toEqual(["group", "languages", "name", "saves", "senses"]);
    expect(m.senses).toBeNull();
    expect(m.saves).toEqual({});
  });
  it("step 9 nested: nulls one level down are deleted, an ability null becomes 10, a null array element is removed", () => {
    expect(ok("name: X\nhp:\n  average:\n  formula: 2d8").hp).toEqual({ formula: "2d8" });
    expect(ok("name: X\nac:\n  - ac:\n  - ac: 12").ac).toEqual([{}, { ac: 12 }]);
    expect(ok("name: X\nspeed:\n  walk:\n  fly: 30").speed).toEqual({ fly: 30 });
    expect(ok("name: X\ninitiative:\n  proficiency:").initiative).toEqual({});
    expect(ok("name: X\nabilities:\n  str:\n  dex: 12").abilities).toMatchObject({ str: 10, dex: 12 });
    expect(ok("name: X\nlanguages:\n  - Common\n  -").languages).toEqual(["Common"]);
  });
  it("step 4: an object speed value's number and initiative.proficiency coerce too", () => {
    expect(ok('name: X\nspeed:\n  walk:\n    number: "30"\n    condition: (hover)').speed).toEqual({ walk: { number: 30, condition: "(hover)" } });
    expect(ok('name: X\ninitiative:\n  proficiency: "2"').initiative).toEqual({ proficiency: 2 });
  });
  it("the order: the scrub and the null step precede the ?? 10 fill", () => {
    expect(ok("name: X\nabilities:\n  str: .nan\n  dex: 12").abilities).toMatchObject({ str: 10, dex: 12 });
  });
  it("the name-only trait parses (the un-refined feature object)", () => {
    expect((ok("name: X\ntraits:\n  - name: Amphibious").traits as unknown[]).length).toBe(1);
  });
  it("the Legendary-Resistance splice still runs after the schema", () => {
    const m = ok("name: Aboleth\ncr: 10\ntraits:\n  - name: Legendary Resistance (3/Day)\n    desc: If it fails a save it can succeed instead.");
    expect(m.legendary_resistance).toBe(3);
    expect((m.traits as { name: string }[]).some((t) => /Legendary Resistance/.test(t.name))).toBe(false);
  });
  it("the converter shapes pass verbatim (no decode at parse time)", () => {
    const m = ok("name: X\nsize:\n  - G\ntype:\n  type: dragon\n  tags:\n    - chromatic\nalignment:\n  - C\n  - E\ncr:\n  cr: '11'\n  xp_lair: 8400\nlanguages: null\nrendering_hint: ''");
    expect(m.size).toEqual(["G"]);
    expect(m.type).toEqual({ type: "dragon", tags: ["chromatic"] });
    expect(m.alignment).toEqual(["C", "E"]);
    expect(m.cr).toEqual({ cr: "11", xp_lair: 8400 });
    expect(m.languages).toBeNull();
  });
});
