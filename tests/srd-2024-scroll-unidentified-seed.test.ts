import { describe, it, expect } from "vitest";
import runtimeItems from "../src/srd/data/runtime/item.2024.json";
import canonicalItems from "../src/srd/data/canonical/synthetic-item-seeds.2024.json";
import { parseItem } from "../src/item/item.parser";

// Regression guard for the synthetic SRD-2024 seeds: the 10 Spell Scrolls and
// 7 Unidentified placeholders are authored in a committed generator source
// (tools/srd-canonical/data/synthetic-item-seeds.ts) and emitted reproducibly —
// canonical to synthetic-item-seeds.2024.json, runtime APPENDED onto
// item.2024.json. These assertions fail loudly if a future regen drops them,
// and pin the marker fields (scroll_level / unidentified / masked_category) the
// scroll + identify systems depend on. Slugs are the canonical 3-part form
// (`srd-2024_item_<name>`) minted by buildCanonicalSlug.

type Item = { slug?: string; type?: string; scroll_level?: number; unidentified?: boolean; masked_category?: string; rarity?: string };

const runtime = runtimeItems as Item[];
const canonical = canonicalItems as Item[];
const bySlug = (arr: Item[], slug: string) => arr.filter((x) => x.slug === slug);

const SCROLL_LEVELS: Array<[string, number]> = [
  ["srd-2024_item_spell-scroll-cantrip", 0],
  ["srd-2024_item_spell-scroll-1st-level", 1],
  ["srd-2024_item_spell-scroll-2nd-level", 2],
  ["srd-2024_item_spell-scroll-3rd-level", 3],
  ["srd-2024_item_spell-scroll-4th-level", 4],
  ["srd-2024_item_spell-scroll-5th-level", 5],
  ["srd-2024_item_spell-scroll-6th-level", 6],
  ["srd-2024_item_spell-scroll-7th-level", 7],
  ["srd-2024_item_spell-scroll-8th-level", 8],
  ["srd-2024_item_spell-scroll-9th-level", 9],
];

const PLACEHOLDERS: Array<[string, string]> = [
  ["srd-2024_item_unidentified-potion", "potion"],
  ["srd-2024_item_unidentified-scroll", "scroll"],
  ["srd-2024_item_unidentified-wondrous-item", "wondrous item"],
  ["srd-2024_item_unidentified-weapon", "weapon"],
  ["srd-2024_item_unidentified-armor", "armor"],
  ["srd-2024_item_unidentified-ring", "ring"],
  ["srd-2024_item_unidentified-wand", "wand"],
];

describe("SRD 2024 seed: Spell Scrolls carry scroll_level", () => {
  for (const surface of [
    { name: "runtime", arr: runtime },
    { name: "canonical", arr: canonical },
  ] as const) {
    for (const [slug, level] of SCROLL_LEVELS) {
      it(`${surface.name}: ${slug} exists once with type scroll + scroll_level ${level}`, () => {
        const hits = bySlug(surface.arr, slug);
        expect(hits).toHaveLength(1);
        expect(hits[0].type).toBe("scroll");
        expect(hits[0].scroll_level).toBe(level);
      });
    }
  }

  // The brief's named anchors, asserted explicitly.
  it("srd-2024_item_spell-scroll-3rd-level is scroll_level 3, type scroll (runtime + canonical)", () => {
    for (const arr of [runtime, canonical]) {
      const it3 = bySlug(arr, "srd-2024_item_spell-scroll-3rd-level")[0];
      expect(it3).toBeDefined();
      expect(it3.scroll_level).toBe(3);
      expect(it3.type).toBe("scroll");
    }
  });

  it("srd-2024_item_spell-scroll-cantrip is scroll_level 0 (runtime + canonical)", () => {
    for (const arr of [runtime, canonical]) {
      expect(bySlug(arr, "srd-2024_item_spell-scroll-cantrip")[0]?.scroll_level).toBe(0);
    }
  });
});

describe("SRD 2024 seed: Unidentified placeholders carry unidentified + masked_category", () => {
  for (const surface of [
    { name: "runtime", arr: runtime },
    { name: "canonical", arr: canonical },
  ] as const) {
    for (const [slug, cat] of PLACEHOLDERS) {
      it(`${surface.name}: ${slug} exists once with unidentified + masked_category ${cat}`, () => {
        const hits = bySlug(surface.arr, slug);
        expect(hits).toHaveLength(1);
        expect(hits[0].unidentified).toBe(true);
        expect(hits[0].masked_category).toBe(cat);
        // type is a VALID enum member (== masked_category), never a fake value.
        expect(hits[0].type).toBe(cat);
      });
    }
  }

  it("srd-2024_item_unidentified-potion is unidentified with masked_category potion (runtime + canonical)", () => {
    for (const arr of [runtime, canonical]) {
      const p = bySlug(arr, "srd-2024_item_unidentified-potion")[0];
      expect(p).toBeDefined();
      expect(p.unidentified).toBe(true);
      expect(p.masked_category).toBe("potion");
    }
  });
});

describe("SRD 2024 seed: items parse under the item schema (register as item entities)", () => {
  const YAML = (o: Record<string, unknown>) =>
    Object.entries(o)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : v}`)
      .join("\n");

  it("a seeded scroll parses and keeps scroll_level on the entity", () => {
    const src = bySlug(runtime, "srd-2024_item_spell-scroll-3rd-level")[0];
    const res = parseItem(YAML(src as Record<string, unknown>));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.type).toBe("scroll");
    expect(res.data.scroll_level).toBe(3);
    expect(res.data.raw?.scroll_level).toBeUndefined();
  });

  it("a seeded placeholder parses and keeps unidentified + masked_category on the entity", () => {
    const src = bySlug(runtime, "srd-2024_item_unidentified-potion")[0];
    const res = parseItem(YAML(src as Record<string, unknown>));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.unidentified).toBe(true);
    expect(res.data.masked_category).toBe("potion");
    expect(res.data.raw?.masked_category).toBeUndefined();
  });
});
