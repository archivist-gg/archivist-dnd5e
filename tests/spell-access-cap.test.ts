import { describe, it, expect } from "vitest";
import { classSpellCandidates } from "../src/spell/spell.access";
import { EntityRegistry } from "@archivist-gg/core";

// ---------------------------------------------------------------------------
// R4-G2 Task 5 · spec §8.1 / §11 floor 10 · the 1000-spell cap.
//
// FIXTURE RULE (Gate 2 I-5): this MUST be a real core `EntityRegistry`. The
// repo's ad-hoc `search` stub idiom ignores its `limit` argument, which would
// make this floor vacuously green even against the un-lifted cap. Core's
// `search` honours `limit` by construction (`entity-registry.ts:145`), so the
// pre-fix run really does come back with exactly 1,000.
// ---------------------------------------------------------------------------

const TOTAL = 1001;

function bigSpellRegistry(): EntityRegistry {
  const reg = new EntityRegistry();
  for (let i = 0; i < TOTAL; i++) {
    // Zero-padded so the name sort is total and the last-registered spell is
    // also the LAST one alphabetically — the entry a slice(0, 1000) drops.
    const n = String(i).padStart(4, "0");
    reg.register({
      slug: `srd-2024_spell-${n}`,
      name: `Spell ${n}`,
      entityType: "spell",
      filePath: `s/${n}.md`,
      data: { slug: `srd-2024_spell-${n}`, name: `Spell ${n}`, level: 1, classes: ["wizard"] },
      compendium: "SRD 2024",
      readonly: true,
      homebrew: false,
    });
  }
  return reg;
}

describe("classSpellCandidates — the enumeration cap", () => {
  it("RED-FIRST: returns every spell past the 1,000th (showAll)", () => {
    const candidates = classSpellCandidates(bigSpellRegistry(), [], 0, new Set(), true);
    // Pre-fix: EXACTLY 1000 — the `search(query, "spell", 1000)` slice.
    expect(candidates).toHaveLength(TOTAL);
  });

  it("RED-FIRST: the 1,001st spell is REACHABLE by name, not merely counted", () => {
    const candidates = classSpellCandidates(bigSpellRegistry(), [], 0, new Set(), true);
    // "Spell 1000" sorts LAST, so it is precisely the row the old slice dropped.
    expect(candidates.map((c) => c.name)).toContain("Spell 1000");
    expect(candidates[candidates.length - 1].slug).toBe("srd-2024_spell-1000");
  });

  it("RED-FIRST: the class/level gate also sees past the 1,000th", () => {
    // The gate runs AFTER enumeration, so a capped pool silently hides in-class
    // spells too. `maxLevel` 1 admits every fixture spell (all level 1).
    const candidates = classSpellCandidates(bigSpellRegistry(), ["srd-2024_wizard"], 1, new Set(), false);
    expect(candidates).toHaveLength(TOTAL);
  });

  it("CONTROL (green both sides by design): known slugs still drop, a name query still filters", () => {
    // Membership, not count, so the assertion is cap-independent: both halves of
    // this case sit inside the first 1,000 either way.
    const reg = bigSpellRegistry();
    const slugs = classSpellCandidates(reg, [], 0, new Set(["srd-2024_spell-0000"]), true)
      .map((c) => c.slug);
    expect(slugs).not.toContain("srd-2024_spell-0000");
    expect(slugs).toContain("srd-2024_spell-0001");
    // "Spell 099" matches exactly Spell 0990..Spell 0999 (a name like "Spell 0099"
    // does not contain the substring), so the query path is pinned at 10.
    expect(classSpellCandidates(reg, [], 0, new Set(), true, "Spell 099")).toHaveLength(10);
  });
});
