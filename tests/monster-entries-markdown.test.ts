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
  it("tables: caption, colLabels, rows, colStyles ignored, an object cell flattened", () => {
    const md = entriesToMarkdown([{ type: "table", caption: "Madness", colLabels: ["d6", "Flaw"], colStyles: ["col-2", "col-10"], rows: [["1", "Paranoia"], ["2", { type: "entries", entries: ["Object cell"] }]] }]);
    expect(md).toBe("**Madness**\n\n| d6 | Flaw |\n| --- | --- |\n| 1 | Paranoia |\n| 2 | Object cell |");
    expect(entriesToMarkdown([{ type: "table", colLabels: ["a"], rows: [["x"]] }])).toBe("| a |\n| --- |\n| x |");
  });
  it("insets and variants are blockquotes; a spellcasting node renders its lines; unknown types recurse", () => {
    expect(entriesToMarkdown([{ type: "variant", name: "Summon Devil (1/Day)", entries: ["The devil has a 30 percent chance."] }])).toBe("> **Summon Devil (1/Day)**\n>\n> The devil has a 30 percent chance.");
    expect(entriesToMarkdown([{ type: "spellcasting", name: "Innate", will: ["a"] }])).toBe("At Will: a");
    expect(entriesToMarkdown([{ type: "somethingNew", entries: ["kept"], weird: 1 }])).toBe("kept");
    expect(entriesToMarkdown([{ type: "somethingNew" }])).toBe("");
  });
});
