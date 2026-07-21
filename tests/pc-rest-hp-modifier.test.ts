import { describe, it, expect } from "vitest";
import { characterSchema } from "../src/pc/pc.schema";
import { computeRestPlan } from "../src/pc/pc.rest";
import type { Character, ResolvedCharacter, DerivedStats } from "../src/pc/pc.types";

// Minimal valid character literal (mirrors tests/pc-schema.test.ts's minimalCharacter
// and tests/pc-schema-hp-overrides.test.ts's base). Self-contained: computeRestPlan's
// only other caller in this repo is a heavy smoke test whose fixtures aren't
// importable across the repo boundary, so this test builds its own.
const base = {
  name: "T", edition: "2024", ability_method: "manual",
  class: [{ name: "[[c]]", level: 1 }],
  abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  state: { hp: { current: 1, max: 1, temp: 0 } },
};

function withOverrides(overrides: Record<string, unknown>): Character {
  return characterSchema.parse({ ...base, overrides }) as unknown as Character;
}

const resolved = { totalLevel: 1, classes: [] } as unknown as ResolvedCharacter;
const derived = { hp: { max: 10, current: 10, temp: 0 } } as unknown as DerivedStats;

describe("computeRestPlan · hp-modifier-reset (P5 T5)", () => {
  it("long rest offers hp-modifier-reset only when a modifier is set", () => {
    const plan = computeRestPlan(withOverrides({ hp: { modifier: -5 } }), resolved, derived, null, "long");
    expect(plan.categories).toContainEqual({ id: "hp-modifier-reset", label: "Max HP Modifier", preview: "-5 → cleared" });

    const planPos = computeRestPlan(withOverrides({ hp: { modifier: 10 } }), resolved, derived, null, "long");
    expect(planPos.categories.find((c) => c.id === "hp-modifier-reset")?.preview).toBe("+10 → cleared");

    const none = computeRestPlan(withOverrides({}), resolved, derived, null, "long");
    expect(none.categories.some((c) => c.id === "hp-modifier-reset")).toBe(false);

    const short = computeRestPlan(withOverrides({ hp: { modifier: -5 } }), resolved, derived, null, "short");
    expect(short.categories.some((c) => c.id === "hp-modifier-reset")).toBe(false);
  });
});
