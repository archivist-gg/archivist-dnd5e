import { describe, it, expect } from "vitest";
import { featureSchema } from "@archivist-gg/dnd5e/schemas/feature-schema";

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
