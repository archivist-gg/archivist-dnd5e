import { describe, it, expect } from "vitest";
import { featureSchema } from "@archivist-gg/dnd5e/schemas/feature-schema";
import companionBlocks from "./fixtures/companion-cache-47.json";

/** Typed as a plain record ON PURPOSE: a raw JSON import of 47 heterogeneous objects gives TypeScript a large
 *  structural union that nothing here needs, and every assertion below is about the PARSE, not the literal. */
const blocks = companionBlocks as unknown as Array<Record<string, unknown>>;

const base = { name: "Breath Weapon", description: "You exhale destructive energy." };

/** The TEN converter feature-level keys §2.2 declares, each with the value §9.1 requires to
 *  survive into `result.data` VERBATIM. Deep-equalling the whole set — rather than spot-asserting
 *  three of them — is what gives this case kill power over EVERY declaration: delete any one
 *  from featureSchema and that slot parses to `undefined`, so the toEqual goes red. */
const converterKeys: Record<string, unknown> = {
  class_source: "PHB",
  rendering_hint: "",
  subclass_short_name: "Giant",
  subclass_source: "BGG",
  header: 2,
  is_class_feature_variant: true,
  gain_subclass_feature: true,
  gain_subclass_feature_has_content: true,
  type: "inset",
  recharge: { type: "per_day", param: 2 },
};

describe("featureSchema widening (§2.2)", () => {
  it("keeps the converter feature-level key-set verbatim (the 164-row family)", () => {
    const r = featureSchema.safeParse({ ...base, ...converterKeys }) as
      { success: boolean; data?: Record<string, unknown> };
    expect(r.success).toBe(true);
    const survived: Record<string, unknown> = {};
    for (const k of Object.keys(converterKeys)) survived[k] = r.data?.[k];
    expect(survived).toEqual(converterKeys);              // §9.1 · ALL TEN, verbatim
    expect(r.data?.header).toBe(2);                       // a NUMBER on all 1,237 carriers
    expect(r.data?.recharge).toEqual({ type: "per_day", param: 2 });
    expect(r.data?.rendering_hint).toBe("");              // .min(1) here would refuse everything
  });
  it("§9.10 · the Dragonborn Breath Weapon guard: the verbatim bundle block parses ACCEPTED with both keys surviving", () => {
    const r = featureSchema.safeParse({ ...base, action_cost: "action",
      save: { ability: "dex", dc_formula: "8 + {con_mod} + {prof_bonus}" } }) as
      { success: boolean; data?: Record<string, unknown> };
    expect(r.success).toBe(true);
    expect(r.data?.action_cost).toBe("action");
    expect(r.data?.save).toEqual({ ability: "dex", dc_formula: "8 + {con_mod} + {prof_bonus}" });
  });
  it("existing shape untouched: description-or-entries refine still enforced", () =>
    expect(featureSchema.safeParse({ name: "X" }).success).toBe(false));
});

describe("featureSchema · the companion binding (R4-G5 §7.2, G5-UR2)", () => {
  it("RED FIRST: `companion` joins the converter key-set and survives VERBATIM", () => {
    const companion = blocks[0];
    const r = featureSchema.safeParse({ ...base, companion }) as
      { success: boolean; data?: Record<string, unknown> };
    expect(r.data?.companion).toEqual(companion);
    expect(r.success).toBe(true);
  });

  it("ALL 47 cache blocks parse and round-trip byte-identically (§13 row 30; THE instrument for §7)", () => {
    // The census CANNOT see this key in either state: no shipped document carries `companion`, so its four
    // totals are identical before and after. This case is what stands in for it (spec §12.1). Failures are
    // COLLECTED rather than asserted one at a time, so the message names every block that broke.
    const failures: Array<{ index: number; why: string }> = [];
    blocks.forEach((companion, index) => {
      const r = featureSchema.safeParse({ ...base, companion }) as
        { success: boolean; data?: Record<string, unknown> };
      if (!r.success) { failures.push({ index, why: "refused" }); return; }
      if (JSON.stringify(r.data?.companion) !== JSON.stringify(companion)) {
        failures.push({ index, why: "round-trip differs" });
      }
    });
    expect(failures).toEqual([]);
    expect(blocks).toHaveLength(47);
  });

  it("an UNKNOWN closed-vocabulary value still parses (§13 row 29; FIXTURE-ONLY: every shipped block carries a known one)", () => {
    // The enum-refusal control. The converter's own schema also REFINES `turn_order` against its quote; the
    // mirror carries no refine either, which is the second half of the same rule.
    const companion = { ...blocks[0], turn_order: "delegated-to-another-creature" };
    const r = featureSchema.safeParse({ ...base, companion }) as
      { success: boolean; data?: Record<string, unknown> };
    expect((r.data?.companion as { turn_order?: string } | undefined)?.turn_order)
      .toBe("delegated-to-another-creature");
    expect(r.success).toBe(true);
  });

  it("a null in EVERY converter-nullable position still parses (the null-refusal control)", () => {
    // `z.string().optional()` alone REJECTS null (measured), which is why all nine positions carry `.nullable()`.
    const outer = { ...blocks[0], statblock_wikilink: null, turn_order: "unstated",
      turn_order_source_quote: null, lifecycle: null, autonomy: null, base_statblock: null };
    const inner = { ...blocks[0], lifecycle: { created_by: "unstated", recreate_on: null,
      previous_instance_perishes: null, vanishes_if_owner_dies: null, vanishes_after: null, source_quote: "q" } };
    for (const companion of [outer, inner]) {
      const r = featureSchema.safeParse({ ...base, companion }) as
        { success: boolean; data?: Record<string, unknown> };
      expect(r.data?.companion).toEqual(companion);
      expect(r.success).toBe(true);
    }
  });

  it("the widening is ADDITIVE: a feature with no companion is byte-unchanged", () => {
    const r = featureSchema.safeParse({ ...base }) as { success: boolean; data?: Record<string, unknown> };
    expect(r.data).toEqual(base);
    expect("companion" in (r.data ?? {})).toBe(false);
  });
});
