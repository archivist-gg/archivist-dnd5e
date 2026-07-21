import { describe, it, expect } from "vitest";
import { SYNTHETIC_ARMOR_SEEDS } from "../tools/srd-canonical/data/synthetic-armor-seeds";

describe("SYNTHETIC_ARMOR_SEEDS", () => {
  it("provides a 2014 Shield mirroring the 2024 shield physical shape (source SRD 5.1)", () => {
    const seeds = SYNTHETIC_ARMOR_SEEDS["2014"];
    const shield = seeds.find((s) => s.name === "Shield");
    expect(shield).toBeDefined();
    expect(shield).toMatchObject({
      name: "Shield",
      source: "SRD 5.1",
      category: "heavy",
      ac: { base: 2, add_dex: false },
      stealth_disadvantage: false,
    });
  });
});
