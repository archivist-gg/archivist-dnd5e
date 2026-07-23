import { describe, it, expect } from "vitest";
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
});
