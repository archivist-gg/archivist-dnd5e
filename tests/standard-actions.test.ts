/**
 * R4-G7 T8 RIDER-22 (F-STDACT, inv-3 §4) · the standard combat actions are dnd5e data, one list per edition.
 *
 * The plugin's Actions tab printed ONE hardcoded union of both editions (16 names), so a 2014 character read Influence,
 * Magic, Study and Utilize and never Use an Object, and a 2024 character read Cast a Spell, Grapple, Improvise and Shove.
 * 2014 is the PHB chapter 9 list. 2024 is the shipped union minus those four 2014-era entries; no rules glossary document
 * ships in the SRD 2024 bundle, so it was checked against the bundle's own prose instead: the SRD 2024 documents name ten
 * of the twelve as "the <X> action" (Attack, Dash, Disengage, Dodge, Hide, Influence, Magic, Search, Study, Utilize) and
 * none of Cast a Spell, Grapple, Improvise or Shove as an action.
 */
import { describe, it, expect } from "vitest";
import { STANDARD_ACTIONS } from "../src/dnd/constants";

describe("STANDARD_ACTIONS (R4-G7 T8 RIDER-22)", () => {
  it("2014 lists the PHB's ten actions, Use an Object included", () => {
    expect(STANDARD_ACTIONS["2014"]).toEqual([
      "Attack", "Cast a Spell", "Dash", "Disengage", "Dodge", "Help", "Hide", "Ready", "Search", "Use an Object",
    ]);
  });
  it("2024 lists the twelve 2024 actions, none of the 2014-era entries", () => {
    expect(STANDARD_ACTIONS["2024"]).toEqual([
      "Attack", "Dash", "Disengage", "Dodge", "Help", "Hide", "Influence", "Magic", "Ready", "Search", "Study", "Utilize",
    ]);
  });
});
