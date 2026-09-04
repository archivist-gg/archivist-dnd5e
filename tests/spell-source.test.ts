/**
 * R4-G3b §6 · the ONE spell-source routing descriptor table.
 *
 * Provenance: every case in this file was RED before Task 7 (dnd5e base 429fb57) for one and the same
 * reason: `src/pc/spell-source.ts` did not exist, so vitest failed the whole file at module load
 * ("Error: Cannot find module '../src/pc/spell-source' imported from tests/spell-source.test.ts", 0 tests
 * collected). The per-case notes below therefore record what each assertion pins about the SHIPPED table,
 * not a value the pre-Task-7 tree produced.
 *
 * The table is read-only policy data. `class` / `feat` / `item` reproduce the routing the plugin's
 * Spells tab hardcoded in thirteen `source ===` arms before Task 7; `race` routes like `feat`;
 * `domain` is declared and produced by nothing (no grant producer hardcodes it; only a hand-authored
 * `spells.known[].source: domain` in the YAML reaches a sheet carrying it, via normalizeKnownSpell).
 */
import { describe, it, expect } from "vitest";
import { SPELL_SOURCE, spellSource, type SpellSourceDescriptor } from "../src/pc/spell-source";
import type { ResolvedSpell } from "../src/pc/pc.types";

const row = (source: ResolvedSpell["source"]): SpellSourceDescriptor =>
  spellSource({ source } as Pick<ResolvedSpell, "source">);

describe("SPELL_SOURCE · the routing descriptor table", () => {
  it("has exactly one descriptor per member of the ResolvedSpell.source union", () => {
    expect(Object.keys(SPELL_SOURCE).sort()).toEqual(["class", "domain", "feat", "item", "race"]);
  });

  it("class reproduces the pre-Task-7 class routing: spellbook, preparable, no own ability, not a grant", () => {
    // The empty-state gate counted feat + item only, so a class row never lifted it.
    expect(row("class")).toEqual({
      ownAbility: false, section: "spellbook", freeCastWhenNoSlot: false, showInPrepare: true, countsAsGranted: false,
    });
  });

  it("feat reproduces the pre-Task-7 feat routing: own ability, free cast with no slot, counts as granted", () => {
    // cast-view's `s.source === "feat"` free-cast arm and the DC/attack own-ability arm, as data.
    expect(row("feat")).toEqual({
      ownAbility: true, section: "spellbook", freeCastWhenNoSlot: true, showInPrepare: true, countsAsGranted: true,
    });
  });

  it("item reproduces the pre-Task-7 scroll routing: the consumable section, never in the Prepare list", () => {
    // The four `s.source !== "item"` arms and the two `=== "item"` arms, as one section value.
    expect(row("item")).toEqual({
      ownAbility: false, section: "consumable", freeCastWhenNoSlot: false, showInPrepare: false, countsAsGranted: true,
    });
  });

  it("race routes exactly like feat (the §6 change: a race grant is an own-ability grant)", () => {
    expect(row("race")).toEqual(row("feat"));
    expect(row("race").countsAsGranted).toBe(true);
  });

  it("domain is declared and routes like a class row (no grant producer emits it today)", () => {
    expect(row("domain")).toEqual({
      ownAbility: false, section: "spellbook", freeCastWhenNoSlot: false, showInPrepare: true, countsAsGranted: false,
    });
  });

  it("spellSource reads the table by the row's own source", () => {
    expect(spellSource({ source: "item" } as Pick<ResolvedSpell, "source">)).toBe(SPELL_SOURCE.item);
    expect(spellSource({ source: "race" } as Pick<ResolvedSpell, "source">)).toBe(SPELL_SOURCE.race);
  });
});
