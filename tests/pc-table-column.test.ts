import { describe, it, expect } from "vitest";
import { readTableColumn, diceColumnAt, unarmedDieColumnFor } from "../src/pc/pc.table-column";

const table = {
  2: { columns: { "Interdict Boons": 1, "Cantrips": "2" } },
  7: { columns: { "Interdict Boons": 3 } },
};

describe("readTableColumn", () => {
  it("reads a numeric column at a level", () => {
    expect(readTableColumn(table, 7, ["Interdict Boons"])).toBe(3);
  });
  it("parses a string-numeric column", () => {
    expect(readTableColumn(table, 2, ["Cantrips"])).toBe(2);
  });
  it("tries keys in order and returns the first hit", () => {
    expect(readTableColumn(table, 2, ["Missing", "Interdict Boons"])).toBe(1);
  });
  it("returns null when the level/column is absent", () => {
    expect(readTableColumn(table, 5, ["Interdict Boons"])).toBeNull();
    expect(readTableColumn(undefined, 2, ["x"])).toBeNull();
  });
});

describe("diceColumnAt (R4-G6b §5.3)", () => {
  const table = { 1: { columns: { "Martial Arts": "1d6", "Focus Points": 2, constructor: "1d20" } }, 5: { columns: { "Martial Arts": "1d8" } } };
  it("returns the dice cell as a string and null for an integer cell or a missing level", () => {
    expect(diceColumnAt(table, 1, "Martial Arts")).toBe("1d6");
    expect(diceColumnAt(table, 5, "Martial Arts")).toBe("1d8");
    expect(diceColumnAt(table, 1, "Focus Points")).toBeNull();
    expect(diceColumnAt(table, 3, "Martial Arts")).toBeNull();
    expect(diceColumnAt(undefined, 1, "Martial Arts")).toBeNull();
  });
  it("reads only own properties and only a dice-shaped cell", () => {
    expect(diceColumnAt(table, 1, "toString")).toBeNull();
    expect(diceColumnAt({ 1: { columns: { X: "d6" } } }, 1, "X")).toBeNull();
  });
  it("unarmedDieColumnFor is an own-property lookup", () => {
    expect(unarmedDieColumnFor("martial-arts")).toBe("Martial Arts");
    expect(unarmedDieColumnFor("constructor")).toBeUndefined();
    expect(unarmedDieColumnFor("unarmored-defense")).toBeUndefined();
  });
});
