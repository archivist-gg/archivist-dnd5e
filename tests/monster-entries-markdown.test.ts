import { describe, it, expect } from "vitest";
import { entriesToMarkdown } from "../src/monster/monster.format";

/** R4-G6 §8.3 · the 5etools entry-tree node vocabulary to markdown (the STRING is the tested unit; the live verify
 *  sees the rendered tables). */
describe("entriesToMarkdown", () => {
  it("strings, entries with a run-in name, an untyped node, lists and items", () => {
    const md = entriesToMarkdown([
      "On initiative count 20, the dragon can take a lair action.",
      { type: "entries", name: "Additional Lair Action", entries: ["It may also do this."] },
      { name: "Untyped", entries: ["A feature-shaped node with no type."], rendering_hint: "" },
      { type: "list", style: "list-hang-notitle", items: [{ type: "item", name: "Whispers", entry: "The dragon whispers." }, "A plain item"] },
    ]);
    expect(md).toBe([
      "On initiative count 20, the dragon can take a lair action.",
      "**Additional Lair Action.** It may also do this.",
      "**Untyped.** A feature-shaped node with no type.",
      "- **Whispers.** The dragon whispers.\n- A plain item",
    ].join("\n\n"));
  });
  it("tables: caption, colLabels, rows, an object cell flattened", () => {
    const md = entriesToMarkdown([{ type: "table", caption: "Madness", colLabels: ["d6", "Flaw"], colStyles: ["col-2", "col-10"], rows: [["1", "Paranoia"], ["2", { type: "entries", entries: ["Object cell"] }]] }]);
    expect(md).toBe("**Madness**\n\n| d6 | Flaw |\n| --- | --- |\n| 1 | Paranoia |\n| 2 | Object cell |");
    expect(entriesToMarkdown([{ type: "table", colLabels: ["a"], rows: [["x"]] }])).toBe("| a |\n| --- |\n| x |");
  });
  /**
   * R4-G7 T8 wave E, B026-D6 and B026-D8 (both measured live in W-Er on the deployed pair).
   * D6: Andir Valmakos's Variants table carries `[[Player's Handbook (2014)/Spells/Longstrider|longstrider]]` in a cell;
   * the alias pipe was read as a fourth column delimiter, GFM dropped the cells beyond the three header columns and the
   * cell ended at the raw `[[...Longstrider` with no link at all (the live read: `rawWikilink: true`, 0 `a.internal-link`
   * in the table). Obsidian renders `[[target\|alias]]` inside a table as ONE link with its alias: MEASURED in the W-Er
   * table lab, plain and inside a blockquote. Corpus: 11 of the 31 entry-tree tables, in 10 notes, carry such a link; 0
   * cell anywhere already carries an escaped pipe.
   * D8 (the engine half): 15 of the 31 tables author `text-center` / `text-right` in `colStyles`, which this function
   * ignored entirely, emitting `---` for every column; the plugin then centred every cell from its own table rule, so
   * Andir's nine-line prose column rendered centred line by line. Obsidian emits the GFM alignment as an `align`
   * ATTRIBUTE (measured in the same lab), which the plugin's own arms read.
   */
  it("wave E B026-D6: a pipe inside a cell is escaped, so an aliased wikilink stays one cell", () => {
    const md = entriesToMarkdown([{ type: "table", colLabels: ["A", "B"], rows: [["1", "see [[x/y|z]]."]] }]);
    expect(md).toContain("[[x/y\\|z]]");
    const row = md.split("\n")[2];
    expect(row.split(/(?<!\\)\|/).map((c) => c.trim()).filter((c) => c.length > 0)).toEqual(["1", "see [[x/y\\|z]]."]);
  });

  it("wave E B026-D6: a pipe in a column LABEL is escaped too, and an already-escaped pipe is not doubled", () => {
    const md = entriesToMarkdown([{ type: "table", colLabels: ["d100", "Effect|Flaw"], rows: [["01", "a \\| b"]] }]);
    expect(md.split("\n")[0]).toBe("| d100 | Effect\\|Flaw |");
    expect(md.split("\n")[2]).toBe("| 01 | a \\| b |");
  });

  it("wave E B026-D8: colStyles become the table's alignment row", () => {
    expect(entriesToMarkdown([{ type: "table", colLabels: ["Level", "Hit Points", "New Features"], colStyles: ["col-2 text-center", "col-2", "col-8"], rows: [["2nd", "16", "x"]] }]))
      .toBe("| Level | Hit Points | New Features |\n| :---: | --- | --- |\n| 2nd | 16 | x |");
    expect(entriesToMarkdown([{ type: "table", colLabels: ["a", "b"], colStyles: ["text-right", "col-2 text-center"], rows: [["1", "2"]] }]))
      .toBe("| a | b |\n| ---: | :---: |\n| 1 | 2 |");
    // no colStyles, or a style that names no alignment, keeps the plain row
    expect(entriesToMarkdown([{ type: "table", colLabels: ["a"], colStyles: ["col-12"], rows: [["x"]] }])).toBe("| a |\n| --- |\n| x |");
  });

  it("insets and variants are blockquotes; a spellcasting node renders its lines; unknown types recurse", () => {
    expect(entriesToMarkdown([{ type: "variant", name: "Summon Devil (1/Day)", entries: ["The devil has a 30 percent chance."] }])).toBe("> **Summon Devil (1/Day)**\n>\n> The devil has a 30 percent chance.");
    expect(entriesToMarkdown([{ type: "spellcasting", name: "Innate", will: ["a"] }])).toBe("At Will: a");
    expect(entriesToMarkdown([{ type: "somethingNew", entries: ["kept"], weird: 1 }])).toBe("kept");
    expect(entriesToMarkdown([{ type: "somethingNew" }])).toBe("");
  });
  it("a malformed spellcasting node renders its header entries and never throws", () => {
    expect(entriesToMarkdown([{ type: "spellcasting", headerEntries: ["The knight casts:"], will: "fireball" }])).toBe("The knight casts:");
    expect(entriesToMarkdown([{ type: "spellcasting", headerEntries: ["The knight casts:"], spells: { "1x": { spells: ["a"] } } }])).toBe("The knight casts:");
    expect(entriesToMarkdown([{ type: "spellcasting", headerEntries: ["The knight casts:"], spells: { "0": null } }])).toBe("The knight casts:");
  });
  it("a non-iterable hidden, headerEntries or footerEntries yields the group lines instead of throwing", () => {
    expect(entriesToMarkdown([{ type: "spellcasting", hidden: 5, will: ["a"] }])).toBe("At Will: a");
    expect(entriesToMarkdown([{ type: "spellcasting", headerEntries: 5, will: ["a"] }])).toBe("At Will: a");
    expect(entriesToMarkdown([{ type: "spellcasting", footerEntries: 5, will: ["a"] }])).toBe("At Will: a");
  });
  it("a null spell ELEMENT yields no spell instead of throwing, in every group that reaches spellText", () => {
    expect(entriesToMarkdown([{ type: "spellcasting", headerEntries: ["The knight casts:"], will: [null] }])).toBe("The knight casts:");
    expect(entriesToMarkdown([{ type: "spellcasting", headerEntries: ["The knight casts:"], ritual: [null] }])).toBe("The knight casts:");
    expect(entriesToMarkdown([{ type: "spellcasting", headerEntries: ["The knight casts:"], daily: { "1": [null] } }])).toBe("The knight casts:");
    expect(entriesToMarkdown([{ type: "spellcasting", headerEntries: ["The knight casts:"], recharge: { "6": [null] } }])).toBe("The knight casts:");
    expect(entriesToMarkdown([{ type: "spellcasting", will: [null, "a"] }])).toBe("At Will: a");   // the survivors still render
  });
});
