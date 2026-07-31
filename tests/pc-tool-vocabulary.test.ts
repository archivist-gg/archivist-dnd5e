import { describe, it, expect } from "vitest";
import { ARTISANS_TOOLS, MUSICAL_INSTRUMENTS, GAMING_SETS, OTHER_TOOLS, ALL_TOOLS } from "../src/types/choice";
import { toProfSlug } from "../src/pc/pc.proficiency-normalize";

describe("tool vocabulary", () => {
  it("has the SRD counts and composes in subset order", () => {
    expect(ARTISANS_TOOLS).toHaveLength(17);
    expect(MUSICAL_INSTRUMENTS).toHaveLength(10);
    expect(GAMING_SETS).toHaveLength(2);
    expect(OTHER_TOOLS).toHaveLength(6);
    expect(ALL_TOOLS).toHaveLength(35);
    expect(ALL_TOOLS).toEqual([...ARTISANS_TOOLS, ...MUSICAL_INSTRUMENTS, ...GAMING_SETS, ...OTHER_TOOLS]);
  });

  it("is already canonical and collision-free under toProfSlug", () => {
    for (const t of ALL_TOOLS) expect(toProfSlug(t)).toBe(t);
    expect(new Set(ALL_TOOLS.map(toProfSlug)).size).toBe(ALL_TOOLS.length);
  });

  it("retains apostrophes, matching the slugs background-merge already emits", () => {
    expect(ALL_TOOLS).toContain("thieves'-tools");
    expect(ALL_TOOLS).toContain("calligrapher's-supplies");
  });
});
