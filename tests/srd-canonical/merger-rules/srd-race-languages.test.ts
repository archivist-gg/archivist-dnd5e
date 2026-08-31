import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractLanguagesFromTraits } from "../../../tools/srd-canonical/merger-rules/race-merge";

// The parser INPUT is the pre-canonical OpenTrait shape { name, desc, type? }
// (race-merge.ts). The field is `desc`, NOT the canonical species JSON `description`.
describe("extractLanguagesFromTraits", () => {
  it("parses fixed languages and discards trailing descriptive prose (Dragonborn)", () => {
    const t = [{
      name: "Languages",
      desc: "You can speak, read, and write Common and Draconic. Draconic is thought to be one of the oldest languages and is often used in the study of magic.",
    }];
    expect(extractLanguagesFromTraits(t)).toEqual({ fixed: ["common", "draconic"] });
  });

  it("strips the choice clause and keeps fixed only (Half-Elf)", () => {
    const t = [{
      name: "Languages",
      desc: "You can speak, read, and write Common, Elvish, and one extra language of your choice.",
    }];
    expect(extractLanguagesFromTraits(t)).toEqual({ fixed: ["common", "elvish"] });
  });

  it("keeps only Common when the rest is a choice clause (Human)", () => {
    const t = [{
      name: "Languages",
      desc: "You can speak, read, and write Common and one extra language of your choice.",
    }];
    expect(extractLanguagesFromTraits(t)).toEqual({ fixed: ["common"] });
  });

  it("gates against KNOWN_LANGUAGES, dropping tokens outside the SRD set", () => {
    const t = [{
      name: "Languages",
      desc: "You can speak, read, and write Common, Elvish, and Aklo.",
    }];
    expect(extractLanguagesFromTraits(t)).toEqual({ fixed: ["common", "elvish"] });
  });

  it("dedupes and sorts the fixed slugs", () => {
    const t = [{
      name: "Languages",
      desc: "You can speak, read, and write Draconic, Common, and Draconic.",
    }];
    expect(extractLanguagesFromTraits(t)).toEqual({ fixed: ["common", "draconic"] });
  });

  it("returns empty when there is no Languages trait (2024 species)", () => {
    expect(extractLanguagesFromTraits([])).toEqual({ fixed: [] });
  });

  it("returns empty when the anchor phrase is absent", () => {
    const t = [{ name: "Languages", desc: "The Elvish tongue flows like a river through the trees." }];
    expect(extractLanguagesFromTraits(t)).toEqual({ fixed: [] });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // R4-G1b §4.5 · THE GENERATOR GATE.
  //
  // `race-merge.ts` builds `KNOWN_LANGUAGES = new Set(ALL_LANGUAGES)` and filters
  // prose tokens through it, so `ALL_LANGUAGES` is DATA to this generator: widening
  // the constant can change SRD output with no source edit here at all. G1b adds
  // `druidic` and `thieves'-cant`; this guard is the evidence that the shipped
  // output did NOT move.
  //
  // CORPUS: `src/srd/data/canonical/species.2014.json`, used as a PROXY for the real
  // Open5e input (a cache/network fetch that is not in this repo). It is the closest
  // in-repo stand-in for the prose the parser actually sees.
  //
  // ⚠️ THE MAPPING IS LOAD-BEARING: the parser reads `t.desc` (see this file's header),
  // the canonical JSON stores `description`. Feeding the canonical traits raw returns
  // `{ fixed: [] }` for EVERY species, which passes against ANY vocabulary — that
  // unmapped read was executed at T0 as the negative control. Keep `desc: description`.
  //
  // BASELINE: hard-coded from the PRE-widening measurement (T0's
  // `g1b-t0-language-baseline.txt`), never re-derived from `ALL_LANGUAGES` — deriving
  // it would make the guard a tautology. Nine of the thirteen 2014 species carry a
  // `Languages` trait (nine distinct fragments); none mentions druidic or any cant.
  // 2024 species carry no `Languages` trait at all, so their union is empty.
  //
  // MUTANT (§9.2, the one stated direction): remove `elvish` from STANDARD_LANGUAGES
  // and this goes red — Elf and Half-Elf are its carriers in this corpus.
  type CanonicalSpecies = { traits?: { name: string; description: string }[] };
  const unionOf = (file: string): string[] => {
    const species = JSON.parse(
      readFileSync(resolve(__dirname, `../../../src/srd/data/canonical/${file}`), "utf8"),
    ) as CanonicalSpecies[];
    const union = new Set<string>();
    for (const s of species) {
      const traits = (s.traits ?? []).map((t) => ({ name: t.name, desc: t.description }));
      for (const l of extractLanguagesFromTraits(traits).fixed) union.add(l);
    }
    return [...union].sort();
  };

  it("guards the widened vocabulary against the shipped species corpus (proxy for the Open5e input)", () => {
    expect(unionOf("species.2014.json")).toEqual(
      ["common", "draconic", "dwarvish", "elvish", "gnomish", "halfling", "infernal", "orc"]);
    expect(unionOf("species.2024.json")).toEqual([]);
  });
});
