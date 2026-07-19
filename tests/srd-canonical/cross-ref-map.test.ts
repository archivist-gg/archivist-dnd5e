import { describe, it, expect } from "vitest";
import { rewriteCrossRefs } from "../../tools/srd-canonical/cross-ref-map";
import runtime2014 from "../../src/srd/data/runtime/item.2014.json";

describe("rewriteCrossRefs", () => {
  it("rewrites @spell to compendium-qualified wikilink", () => {
    const out = rewriteCrossRefs("Cast {@spell fireball} from your forearm.", "2014");
    expect(out).toBe("Cast [[SRD 5e/Spells/Fireball|fireball]] from your forearm.");
  });

  it("rewrites @condition", () => {
    const out = rewriteCrossRefs("Target becomes {@condition prone}.", "2014");
    expect(out).toBe("Target becomes [[SRD 5e/Conditions/Prone|prone]].");
  });

  it("rewrites @damage to roll-tag", () => {
    const out = rewriteCrossRefs("Deals {@damage 2d6} fire.", "2014");
    expect(out).toBe("Deals `d:2d6` fire.");
  });

  it("rewrites @i italic", () => {
    expect(rewriteCrossRefs("This is {@i fancy}.", "2014")).toBe("This is *fancy*.");
  });

  it("uses 2024 compendium for 2024 edition", () => {
    const out = rewriteCrossRefs("Cast {@spell fireball}.", "2024");
    expect(out).toBe("Cast [[SRD 2024/Spells/Fireball|fireball]].");
  });

  it("strips wrapper for unknown tag, keeps body", () => {
    expect(rewriteCrossRefs("Read {@book DMG}.", "2014")).toBe("Read DMG.");
  });

  it("passes through plain text untouched", () => {
    expect(rewriteCrossRefs("No tags here.", "2014")).toBe("No tags here.");
  });

  it("rewriteCrossRefs commutes with \\n-unescape over the real 2014 item descriptions", () => {
    const unescape = (s: string) => s.replace(/\\n/g, "\n");
    const reEscape = (s: string) => s.replace(/\n/g, "\\n"); // reconstruct the pre-fix literal-\n form
    for (const item of runtime2014 as Array<{ name?: string; description?: unknown }>) {
      if (typeof item.description !== "string" || !item.description) continue;
      const literal = reEscape(item.description);
      for (const ed of ["2014", "2024"] as const) {
        expect(rewriteCrossRefs(unescape(literal), ed), item.name).toBe(unescape(rewriteCrossRefs(literal, ed)));
      }
    }
  });
});
