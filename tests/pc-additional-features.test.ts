/**
 * `character.additional_features` — the DM-grant path.
 *
 * Before this, a feature granted directly to a character had nowhere to live: the engine reaches an
 * optional-feature only through a POOL seeded by a class/subclass/race choice, so a campaign boon had
 * to be welded onto a race note to render at all.
 *
 * The load-bearing case is the tracker. `walkChoiceGrants` converts an entity to a Feature carrying
 * `{id, name, description, effects, action}` and drops `uses` — fine for a pool pick, whose tracker
 * `resolveResourceIndex` builds from `resolved.pools`, and fatal for a grant with no pool, which would
 * render as a card with no counter. `collectAdditionalFeatures` carries `uses` across as the feature's
 * own `resources[]`, so the existing feature-resource walk indexes it with no pool involved.
 */
import { describe, it, expect } from "vitest";
import { buildMockRegistry } from "./mock-entity-registry";
import { collectAdditionalFeatures } from "../src/pc/pc.resolver";
import { resolveFeatureResources } from "../src/pc/pc.resources";
import type { Character } from "../src/pc/pc.types";

const SANITY = {
  slug: "me_optional-feature_sanity",
  name: "Sanity",
  edition: "2014",
  source: "Homebrew",
  feature_type: "campaign",
  description: "A track of the mind's hold.",
  prerequisites: [],
  available_to: [],
  effects: [],
  uses: {
    max: 65,
    recharge: "custom",
    recovery: [{ id: "sanity:lr", name: "Long Rest", amount: 1, reset: "long-rest", restores: "uses" }],
  },
};
const HERO = {
  slug: "me_optional-feature_hero-points", name: "Hero Points", edition: "2014", source: "Homebrew",
  feature_type: "campaign", description: "Table currency.", prerequisites: [], available_to: [],
  effects: [], uses: { max: 3, recharge: "long-rest" },
};
const PROSE = {
  slug: "me_optional-feature_prose", name: "Prose Uses", edition: "2014", source: "Homebrew",
  feature_type: "campaign", description: "x", prerequisites: [], available_to: [],
  effects: [], uses: { max: "as the DM decides", recharge: "long-rest" },
};
const REACTION = {
  slug: "me_optional-feature_shield", name: "Ward", edition: "2014", source: "Homebrew",
  feature_type: "campaign", description: "x", prerequisites: [], available_to: [],
  effects: [], action_cost: "reaction", uses: { max: 2, recharge: "short-rest" },
};

const reg = buildMockRegistry([SANITY, HERO, PROSE, REACTION].map((d) => ({
  slug: d.slug, entityType: "optional-feature", data: d, name: d.name,
})));

const charWith = (additional: Character["additional_features"]): Character =>
  ({ additional_features: additional }) as unknown as Character;

describe("collectAdditionalFeatures", () => {
  it("resolves a bare slug string into a campaign-sourced feature", () => {
    const w: string[] = [];
    const out = collectAdditionalFeatures(charWith(["me_optional-feature_hero-points"]), reg, w);
    expect(w).toEqual([]);
    expect(out).toHaveLength(1);
    expect(out[0].feature.name).toBe("Hero Points");
    expect(out[0].source).toEqual({ kind: "campaign", slug: "me_optional-feature_hero-points" });
  });

  it("accepts a wikilink as readily as a bare slug", () => {
    const w: string[] = [];
    const out = collectAdditionalFeatures(charWith(["[[me_optional-feature_hero-points]]"]), reg, w);
    expect(w).toEqual([]);
    expect(out[0].feature.name).toBe("Hero Points");
  });

  it("CARRIES uses across as the feature's own resources — the whole point", () => {
    const w: string[] = [];
    const out = collectAdditionalFeatures(charWith(["me_optional-feature_sanity"]), reg, w);
    expect(out[0].feature.resources).toEqual([{
      id: "me_optional-feature_sanity",
      name: "Sanity",
      max_formula: "65",
      reset: "custom",
      recovery: [{ id: "sanity:lr", name: "Long Rest", amount: 1, reset: "long-rest", restores: "uses" }],
    }]);
  });

  it("so the EXISTING feature-resource walk indexes it, with no pool involved", () => {
    const out = collectAdditionalFeatures(charWith(["me_optional-feature_sanity"]), reg, []);
    const index = resolveFeatureResources(out);
    const r = index.get("me_optional-feature_sanity");
    expect(r, "the grant must appear in the resource index").toBeTruthy();
    expect(r!.maxFormula).toBe("65");
    expect(r!.reset).toBe("custom");
    expect(r!.recovery, "partial recovery must survive into ResolvedResource").toHaveLength(1);
  });

  it("carries the action cost so a granted reaction routes off Passive", () => {
    const out = collectAdditionalFeatures(charWith(["me_optional-feature_shield"]), reg, []);
    expect(out[0].feature.action).toBe("reaction");
  });



  it("warns and skips an unresolvable slug rather than throwing", () => {
    const w: string[] = [];
    const out = collectAdditionalFeatures(charWith(["me_optional-feature_nope"]), reg, w);
    expect(out).toEqual([]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/not found in compendium as optional-feature/);
  });

  it("renders a prose uses.max as a feature with NO resource, and says so", () => {
    const w: string[] = [];
    const out = collectAdditionalFeatures(charWith(["me_optional-feature_prose"]), reg, w);
    expect(out).toHaveLength(1);
    expect(out[0].feature.resources).toBeUndefined();
    expect(w[0]).toMatch(/prose uses\.max/);
  });

  it("is empty and silent when the character declares none", () => {
    const w: string[] = [];
    expect(collectAdditionalFeatures(charWith(undefined), reg, w)).toEqual([]);
    expect(w).toEqual([]);
  });
});

describe("presentation keys ride the resource", () => {
  const BAND = {
    slug: "me_optional-feature_band", name: "Banded", edition: "2014", source: "Homebrew",
    feature_type: "campaign", description: "x", prerequisites: [], available_to: [], effects: [],
    rendering_hint: "counter", surface: "band",
    uses: { max: 65, recharge: "custom" },
  };
  const reg2 = buildMockRegistry([{ slug: BAND.slug, entityType: "optional-feature", data: BAND, name: BAND.name }]);

  it("carries rendering_hint and surface onto the feature's resource", () => {
    const out = collectAdditionalFeatures(
      ({ additional_features: ["me_optional-feature_band"] }) as unknown as Character, reg2, []);
    expect(out[0].feature.resources?.[0]).toMatchObject({ rendering_hint: "counter", surface: "band" });
  });

  it("and through into ResolvedResource, where the renderer reads them", () => {
    const out = collectAdditionalFeatures(
      ({ additional_features: ["me_optional-feature_band"] }) as unknown as Character, reg2, []);
    const r = resolveFeatureResources(out).get("me_optional-feature_band");
    expect(r?.renderingHint).toBe("counter");
    expect(r?.surface).toBe("band");
  });

  it("omits both when the note declares neither — the tab is the default home", () => {
    const out = collectAdditionalFeatures(
      ({ additional_features: ["me_optional-feature_sanity"] }) as unknown as Character, reg, []);
    const r = resolveFeatureResources(out).get("me_optional-feature_sanity");
    expect(r?.renderingHint).toBeUndefined();
    expect(r?.surface).toBeUndefined();
  });
});

/**
 * A MAX-LESS counter (hero points, table currency handed out and spent with no ceiling).
 * The approved design draws it as a bare number, and `renderCounterShape` already prints
 * one when `max <= 0` — the open question was whether a note can ever GET there, i.e.
 * whether `uses.max: 0` survives the grant path into a seeded resource.
 */
describe("a max-less counter (hero points)", () => {
  const HEROZ = {
    slug: "me_optional-feature_hero-points-open", name: "Hero Points", edition: "2014",
    source: "Homebrew", feature_type: "campaign", description: "Table currency, no ceiling.",
    prerequisites: [], available_to: [], effects: [],
    rendering_hint: "counter", surface: "tab",
    uses: { max: 0, recharge: "custom" },
  };
  const reg3 = buildMockRegistry([{ slug: HEROZ.slug, entityType: "optional-feature", data: HEROZ, name: HEROZ.name }]);

  it("carries max 0 through as a resource rather than warning it away as prose", () => {
    const w: string[] = [];
    const out = collectAdditionalFeatures(
      ({ additional_features: [HEROZ.slug] }) as unknown as Character, reg3, w);
    expect(w, "0 is a NUMBER; the prose branch must not claim it").toEqual([]);
    expect(out[0].feature.resources?.[0]).toMatchObject({ max_formula: "0", reset: "custom" });
  });

  it("and reaches the resource index, where the renderer finds max 0 and prints a bare count", () => {
    const out = collectAdditionalFeatures(
      ({ additional_features: [HEROZ.slug] }) as unknown as Character, reg3, []);
    const r = resolveFeatureResources(out).get(HEROZ.slug);
    expect(r, "a max-less counter must still be an indexed resource").toBeTruthy();
    expect(r!.maxFormula).toBe("0");
  });
});
