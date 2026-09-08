import { describe, it, expect } from "vitest";
import { convert5eToolsTags } from "../src/dnd/prose-tags";

// --- convert5eToolsTags (pure string) ---

describe("convert5eToolsTags", () => {
  it("converts {@bold} to **bold**", () => {
    expect(convert5eToolsTags("{@bold dragon}")).toBe("**dragon**");
  });

  it("converts {@italic} to _italic_", () => {
    expect(convert5eToolsTags("{@italic fireball}")).toBe("_fireball_");
  });

  it("converts {@strike} to ~~strike~~", () => {
    expect(convert5eToolsTags("{@strike removed}")).toBe("~~removed~~");
  });

  it("converts {@hit N} to atk tag", () => {
    expect(convert5eToolsTags("{@hit 7}")).toBe("`atk:+7`");
  });

  it("converts {@damage} to damage tag", () => {
    expect(convert5eToolsTags("{@damage 2d6+3}")).toBe("`damage:2d6+3`");
  });

  it("converts {@dc N} to dc tag", () => {
    expect(convert5eToolsTags("{@dc 15}")).toBe("`dc:15`");
  });

  it("converts {@dice} to roll tag", () => {
    expect(convert5eToolsTags("{@dice 4d6}")).toBe("`roll:4d6`");
  });

  it("converts {@recharge N}", () => {
    expect(convert5eToolsTags("{@recharge 5}")).toBe("(Recharge 5-6)");
  });

  it("converts {@spell name} to italic", () => {
    expect(convert5eToolsTags("{@spell fireball}")).toBe("_fireball_");
  });

  it("converts {@action name} to bold", () => {
    expect(convert5eToolsTags("{@action Dodge}")).toBe("**Dodge**");
  });

  it("strips display name from entity refs with pipes", () => {
    expect(convert5eToolsTags("{@spell fireball|PHB}")).toBe("_fireball_");
  });

  it("handles multiple tags in one string", () => {
    const input = "{@atk mw} {@hit 7} to hit, {@h} {@damage 2d6+3} slashing damage.";
    const result = convert5eToolsTags(input);
    expect(result).toBe("Melee Weapon Attack: `atk:+7` to hit, Hit: `damage:2d6+3` slashing damage.");
  });

  // R4 {G5, G6} live rider 3, Z-9-5. 5etools writes `{@h}` immediately before the damage amount, with no
  // space of its own: the tag CARRIES the space in 5etools' own renderer ("Hit: 7 (2d6 + 3)"). The two
  // shapes are pinned together because the rule has to add the space in the first and must not double it
  // in the second, which is the shape the test above already reads.
  it("gives Hit: its space when {@h} abuts the amount, and does not double an authored one", () => {
    expect(convert5eToolsTags("one target. {@h}5 fire damage.")).toBe("one target. Hit: 5 fire damage.");
    expect(convert5eToolsTags("one target. {@h} 5 fire damage.")).toBe("one target. Hit: 5 fire damage.");
  });
});

describe("convert5eToolsTags bare-dice decoration", () => {
  it("wraps bare dice remaining after 5etools rewrites", () => {
    const input = "takes 2d6 fire damage";
    const result = convert5eToolsTags(input);
    expect(result).toBe("takes `dice:2d6` fire damage");
  });

  it("does not re-wrap dice inside a tag it just created", () => {
    // {@damage 2d6+4} -> `damage:2d6+4` -- the backtick-span alternation branch must protect it
    const input = "{@damage 2d6+4} slashing damage";
    const result = convert5eToolsTags(input);
    expect(result).toBe("`damage:2d6+4` slashing damage");
  });

  it("leaves tagless non-dice text unchanged", () => {
    expect(convert5eToolsTags("plain prose")).toBe("plain prose");
  });
});
