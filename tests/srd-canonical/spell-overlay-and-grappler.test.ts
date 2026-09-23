import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import { overlaySchema } from "../../tools/srd-canonical/overlay.schema";
import { spellMergeRule, toSpellCanonical } from "../../tools/srd-canonical/merger-rules/spell-merge";
import { featMergeRule, toFeatCanonical } from "../../tools/srd-canonical/merger-rules/feat-merge";
import { unresolvedSpellKeys } from "../../tools/srd-canonical/validate-overlays";
import type { CanonicalEntry } from "../../tools/srd-canonical/merger";
import type { Overlay } from "../../tools/srd-canonical/overlay.schema";

const OVERLAYS = path.resolve(__dirname, "../../tools/srd-canonical/overlays");
const load = (f: string) => overlaySchema.parse(yaml.load(fs.readFileSync(path.join(OVERLAYS, f), "utf8"))) as Overlay;

describe("the `spells:` overlay section (schema)", () => {
  it("admits casting_options, damage_roll and damage_types by bare spell slug", () => {
    expect(overlaySchema.safeParse({ spells: { "ice-knife": {
      damage_roll: "2d6", damage_types: ["cold", "piercing"],
      casting_options: [{ type: "slot_level_2", damage_roll: "3d6" }] } } }).success).toBe(true);
  });
  it("is STRICT: an unknown field, a non-dice roll, or an option type that is not slot_level_<N> / player_level_<N> refuses", () => {
    expect(overlaySchema.safeParse({ spells: { x: { damage: "2d6" } } }).success).toBe(false);
    expect(overlaySchema.safeParse({ spells: { x: { damage_roll: "two dice" } } }).success).toBe(false);
    expect(overlaySchema.safeParse({ spells: { x: { casting_options: [{ type: "higher", damage_roll: "3d6" }] } } }).success).toBe(false);
    expect(overlaySchema.safeParse({ spells: { x: { casting_options: [{ type: "slot_level_2", damage_roll: "3d6", foo: 1 }] } } }).success).toBe(false);
  });
});

function spellEntry(overlay: unknown): CanonicalEntry {
  return {
    slug: "srd-2024_spell_ice-knife", edition: "2024", kind: "spell",
    base: { key: "srd-2024_ice-knife", name: "Ice Knife", level: 1, school: { key: "conjuration" }, casting_time: "action",
      desc: "d", damage_roll: "1d10", damage_types: ["piercing", "cold"],
      casting_options: [{ type: "slot_level_2", damage_roll: "2d10" }, { type: "slot_level_3", damage_roll: "3d10" }] },
    structured: { level: 1, damageInflict: ["cold", "piercing"],
      entries: ["On a hit, {@damage 1d10} Piercing damage. Each creature takes {@damage 2d6} Cold damage."],
      entriesHigherLevel: [{ type: "entries", entries: ["{@scaledamage 2d6|1-9|1d6}"] }] } as never,
    activation: null, overlay,
  };
}

describe("toSpellCanonical · a `spells:` overlay entry replaces what it names", () => {
  it("the SHIPPED 2024 overlay corrects Ice Knife: the cold 2d6 is the base, the upcast rows add 1d6 each, cold first", () => {
    const overlay = spellMergeRule.pickOverlay(load("srd-2024.yaml"), "srd-2024_ice-knife");
    const out = toSpellCanonical(spellEntry(overlay));
    expect(out.damage_roll).toBe("2d6");
    expect(out.damage).toEqual({ types: ["cold", "piercing"] });
    expect(out.casting_options).toEqual([2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ type: `slot_level_${n}`, damage_roll: `${n + 1}d6` })));
  });
  it("without the overlay, Open5e's wrong rows stand (the control: the overlay is what moves it)", () => {
    const out = toSpellCanonical(spellEntry(null));
    expect(out.casting_options?.[0]).toEqual({ type: "slot_level_2", damage_roll: "2d10" });
  });
  it("every shipped `spells:` key names a spell in that edition's Open5e cache (a misspelled key would author nothing)", () => {
    expect(unresolvedSpellKeys(load("srd-2024.yaml"), "2024")).toEqual([]);
    expect(unresolvedSpellKeys(load("srd-5e.yaml"), "2014")).toEqual([]);
    expect(unresolvedSpellKeys({ spells: { "ice-knive": {} } } as never, "2024")).toEqual(["ice-knive"]);
  });
});

describe("Grappler (SRD 5.1) · an overlay action_cost reaches the canonical feat", () => {
  const grappler = (overlay: unknown): CanonicalEntry => ({
    slug: "srd-5e_feat_grappler", edition: "2014", kind: "feat",
    base: { key: "srd_grappler", name: "Grappler", desc: "You've developed the skills necessary to hold your own in close-quarters grappling.",
      type: "General", benefits: [{ desc: "You can use your action to try to pin a creature grappled by you." }] },
    structured: null, activation: null, overlay,
  });
  it("the SHIPPED 5e overlay gives Grappler action_cost: action", () => {
    const out = toFeatCanonical(grappler(featMergeRule.pickOverlay(load("srd-5e.yaml"), "srd_grappler")));
    expect(out.action_cost).toBe("action");
  });
  it("with no overlay and no activation there is no action_cost (the control)", () => {
    expect(toFeatCanonical(grappler(null)).action_cost).toBeUndefined();
  });
});
