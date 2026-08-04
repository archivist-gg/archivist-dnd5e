import { describe, it, expect } from "vitest";
import { featEntitySchema } from "../../src/feat/feat.schema";
// BOTH from the data module. Importing from ../../tools/srd-canonical/index
// would run main() on import (bare top-level main().catch), which either
// process.exit(1)s the vitest worker or runs a full regeneration.
import {
  SYNTHETIC_FEAT_SEEDS,
  buildSeedCanonicalFeat,
} from "../../tools/srd-canonical/data/synthetic-feat-seeds";

describe("synthetic feat seeds", () => {
  it("the 2014 ASI seed round-trips featEntitySchema", () => {
    const seeds = SYNTHETIC_FEAT_SEEDS["2014"];
    expect(seeds).toHaveLength(1);
    const canonical = buildSeedCanonicalFeat(seeds[0], "2014");
    expect(canonical.slug).toBe("srd-5e_feat_ability-score-improvement");
    const parsed = featEntitySchema.safeParse(canonical);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it("the seed carries no slug of its own · the generator derives it", () => {
    expect(SYNTHETIC_FEAT_SEEDS["2014"][0]).not.toHaveProperty("slug");
  });

  it("the built record keeps the ability-points choice that makes it useful", () => {
    const canonical = buildSeedCanonicalFeat(SYNTHETIC_FEAT_SEEDS["2014"][0], "2014");
    const parsed = featEntitySchema.parse(canonical);
    expect(parsed.choices).toEqual([
      { kind: "ability-points", id: "asi", points: 2, max_per: 2 },
    ]);
    expect(parsed.prerequisites).toEqual([{ kind: "level", min: 4 }]);
    expect(parsed.repeatable).toBe(true);
  });

  it("2024 seeds nothing (its ASI feat already exists)", () => {
    expect(SYNTHETIC_FEAT_SEEDS["2024"]).toBeUndefined();
  });
});
