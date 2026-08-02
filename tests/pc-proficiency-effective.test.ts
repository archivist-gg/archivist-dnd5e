import { describe, expect, it } from "vitest";
import { computeEffectiveProficiencies } from "../src/pc/pc.decision-engine";

const dwarf = (overrides: Record<string, unknown> = {}) =>
  ({
    race: { name: "Dwarf", languages: { fixed: ["common", "dwarvish"] } },
    classes: [], feats: [], background: undefined,
    definition: { origin_choices: {}, overrides },
  }) as never;

describe("computeEffectiveProficiencies", () => {
  it("returns granted languages with their granting entity", () => {
    const eff = computeEffectiveProficiencies(dwarf());
    expect(eff.languages.map((e) => e.value)).toEqual(["common", "dwarvish"]);
    expect(eff.languages[1]).toMatchObject({ label: "Dwarvish", origin: "grant", sources: ["Dwarf"] });
  });

  it("SUPPRESSES a granted language (decision 10)", () => {
    const eff = computeEffectiveProficiencies(dwarf({ languages: { remove: ["dwarvish"] } }));
    expect(eff.languages.map((e) => e.value)).toEqual(["common"]);
  });

  it("adds a manual vocabulary entry as origin=manual", () => {
    const eff = computeEffectiveProficiencies(dwarf({ languages: { add: ["elvish"] } }));
    expect(eff.languages.find((e) => e.value === "elvish")).toMatchObject({
      label: "Elvish", origin: "manual", sources: [],
    });
  });

  it("keeps a CUSTOM entry verbatim, preserving the user's casing", () => {
    const eff = computeEffectiveProficiencies(dwarf({ languages: { add: ["MCDM Cant"] } }));
    // Off-vocabulary AND user-typed => verbatim. Humanizing would render "Mcdm Cant".
    // Select by VALUE, not by `origin`: selecting on the field under assertion would
    // turn an origin regression into "expected undefined to match object" instead of a
    // value diff, and would stop the selector being independent of the assertion.
    expect(eff.languages.find((e) => e.value === "MCDM Cant")).toMatchObject({
      label: "MCDM Cant", origin: "custom", sources: [],
    });
  });

  it("keeps origin=grant when a granted value is ALSO manually added (spec §4.1)", () => {
    // NOT the precedence GUARD (`rank[origin] < rank[existing.origin]`), which is
    // unreachable by construction and deliberately untested. This is the reachable
    // NON-DOWNGRADE path: a grant that also appears in `add[]` must keep its grant
    // dress and its sources. A regression to an unconditional
    // `byValue.set(probe.value, probe)` on collision would flip it to `manual` with
    // an empty `sources`, and the "keeps EVERY granting entity when two entities
    // grant one value" test cannot detect that, because both sides THERE have
    // equal origin. (Cite sibling tests by NAME · ordinals renumber silently
    // every time a test is inserted above them.)
    const eff = computeEffectiveProficiencies(dwarf({ languages: { add: ["dwarvish"] } }));
    expect(eff.languages.map((e) => e.value)).toEqual(["common", "dwarvish"]);  // still ONE row
    expect(eff.languages.find((e) => e.value === "dwarvish")).toMatchObject({
      label: "Dwarvish", origin: "grant", sources: ["Dwarf"],
    });
  });

  it("survives a fixture whose definition has no overrides key at all", () => {
    // dnd5e tests are typechecked by NOTHING, so fixtures build `definition: {}` by cast.
    const r = { race: undefined, classes: [], feats: [], definition: {} } as never;
    expect(() => computeEffectiveProficiencies(r)).not.toThrow();
  });

  it("orders rows by LABEL, not by the order the sources were walked", () => {
    // Insertion order here is grants(common, dwarvish) THEN adds(abyssal), so a
    // Map-order return puts "Abyssal" last. Today's aggregate returns
    // `[...languages].sort()` over the display strings (pc.proficiencies.ts:104-107);
    // returning insertion order would silently reorder every sheet row and falsify
    // spec §3.3's "byte-identical to today's" guarantee. Nothing else in either
    // suite catches it: the aggregate tests use toContain and the panel test mocks
    // the aggregate wholesale, and the other cases here happen to be already sorted.
    const eff = computeEffectiveProficiencies(dwarf({ languages: { add: ["abyssal"] } }));
    expect(eff.languages.map((e) => e.label)).toEqual(["Abyssal", "Common", "Dwarvish"]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // The THIRD label branch (spec §3.3): off-vocabulary GRANT/PICK prose renders
  // `humanizeProficiency(toProfSlug(raw))`, byte-identical to the module-private
  // prettyName, NOT verbatim. Verbatim is reserved for values the user typed.
  //
  // This branch is LIVE in shipped data. Census over src/srd/data/runtime/*.json
  // against ALL_TOOLS finds exactly FOUR off-vocabulary fixed grants, all in
  // classToolFixed: Bard and Monk in both editions. The 2014 Monk below is the
  // one that carries a U+2019, and so the only one where "humanize" and
  // "verbatim" differ by more than casing · a blanket verbatim rule would put a
  // curly apostrophe on screen, undoing the fold R4-P3a landed.
  // ───────────────────────────────────────────────────────────────────────────
  it("humanizes an OFF-VOCABULARY GRANT rather than passing it through verbatim", () => {
    const monk2014 = {
      race: undefined,
      classes: [{
        entity: {
          slug: "monk", name: "Monk",
          // Verbatim from src/srd/data/runtime/class.2014.json · note the U+2019.
          proficiencies: { tools: { fixed: ["Choose one type of artisan’s tools or one musical instrument"] } },
        },
        level: 1, subclass: null, choices: {},
      }],
      background: undefined, feats: [], features: [],
      definition: { origin_choices: {}, overrides: {} },
    } as never;

    const eff = computeEffectiveProficiencies(monk2014);

    expect(eff.tools).toHaveLength(1);
    expect(eff.tools[0]).toMatchObject({
      // Off-vocabulary, so `value` is the raw string · U+2019 and all.
      value: "Choose one type of artisan’s tools or one musical instrument",
      // ...but the LABEL is humanized through toProfSlug, which folds U+2019 to
      // ASCII. This exact string is what the sheet renders today.
      label: "Choose One Type Of Artisan's Tools Or One Musical Instrument",
      origin: "grant",
      sources: ["Monk"],
    });
    // Belt and braces: no curly apostrophe may reach the display string.
    expect(eff.tools[0].label).not.toContain("’");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Spec §7.2: the double-grant collision is ALREADY SHIPPED. A 2014 Rogue's
  // `proficiencies.tools.fixed = ["Thieves’ tools"]` (U+2019, prose) and a 2024
  // Criminal background's `tool_proficiencies[0].items = ["thieves'-tools"]`
  // (U+0027, slug) fold to ONE `toProfSlug`, so the pair is one value with two
  // granting entities.
  //
  // This was the ONLY assertion in either repo on `ProficiencyGrant.source`,
  // because `collectProficiencySources` mapped every bucket down to `e.value`
  // and threw the granting entity away. R4-P3b T8 reshaped that intermediate to
  // keep `{value, source}`, and pc-proficiencies-aggregate.test.ts now pins the
  // armor side too · this stays the only one on the language/tool side. It pins
  // provenance AND the documented walk order (class → race → background →
  // feats, spec §4.1) in a single `toEqual`.
  // ───────────────────────────────────────────────────────────────────────────
  it("keeps EVERY granting entity when two entities grant one value (spec §7.2)", () => {
    const rogueCriminal = {
      race: undefined,
      classes: [{
        entity: {
          slug: "rogue", name: "Rogue",
          proficiencies: { tools: { fixed: ["Thieves’ tools"] } },  // U+2019, 2014 prose
        },
        level: 1, subclass: null, choices: {},
      }],
      background: {
        slug: "criminal", name: "Criminal",
        tool_proficiencies: [{ kind: "fixed", items: ["thieves'-tools"] }],  // U+0027, 2024 slug
        language_proficiencies: [],
      },
      feats: [], features: [],
      definition: { origin_choices: {}, overrides: {} },
    } as never;

    const eff = computeEffectiveProficiencies(rogueCriminal);

    // ONE row, not two: the two spellings fold under toProfSlug.
    expect(eff.tools.map((e) => e.value)).toEqual(["thieves'-tools"]);
    // Both entities kept, in walk order: class before background.
    expect(eff.tools[0]).toMatchObject({
      label: "Thieves' Tools", origin: "grant", sources: ["Rogue", "Criminal"],
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // R4-P3b §14: re-pinned here after the "choose N" placeholder limb was
  // deleted. pc-proficiencies-aggregate.test.ts' "emits 'choose N' for a partial
  // pick" `it` was removed with its subject, and it carried the ONLY assertion
  // in either repo that a PARTIALLY resolved pick folds into the language set.
  // The surviving aggregate coverage exercises the FULLY resolved case only, so
  // without this a fold that dropped every under-filled choice would go green:
  // the count-2/one-picked shape is the live one on a half-built character, and
  // it is the shape the sheet must still show.
  //
  // Asserted on computeEffectiveProficiencies, which is where the fold actually
  // lives (`push(v, "pick")`); aggregateProficiencies passes its output through
  // unmodified. `origin` is asserted too, not just membership: a pick that
  // arrived as a "grant" would still satisfy a bare toContain while meaning the
  // provenance walk had broken.
  // ───────────────────────────────────────────────────────────────────────────
  it("folds a PARTIALLY resolved pick (1 of 2) into the effective set as origin=pick", () => {
    const halfPicked = {
      race: {
        name: "Half-Elf",
        languages: { fixed: ["common"] },
        choices: [],
        traits: [{ name: "Versatile", choices: [
          { kind: "select-proficiency", id: "langs", count: 2, domain: "language",
            from: ["elvish", "dwarvish", "giant"] },
        ] }],
      },
      classes: [], feats: [], background: undefined, features: [],
      // ONE of the two allowed picks is made · the choice stays under-filled.
      definition: { origin_choices: { "race:langs": ["elvish"] }, overrides: {} },
    } as never;

    const eff = computeEffectiveProficiencies(halfPicked);

    expect(eff.languages.find((e) => e.value === "elvish")).toMatchObject({
      label: "Elvish", origin: "pick", sources: [],
    });
    // The grant is untouched, and the UNPICKED options never leak in: an
    // under-filled choice contributes exactly its made picks, not its pool.
    expect(eff.languages.map((e) => e.value)).toEqual(["common", "elvish"]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // R4-P3c: a tool/language granted by a feature EFFECT folds in HERE, not in a
  // second composer. Routing it through this function is what buys the rest for
  // free: `overrides.tools.remove` already subtracts inside this function, and
  // buildDecisionLedger's picker exclusion already reads this function, so an
  // effect grant becomes suppressible and un-offerable by construction rather
  // than by a new store. The suppression half is asserted after a POSITIVE
  // control, or the negative passes vacuously against a build that never folded
  // the grant at all.
  // ───────────────────────────────────────────────────────────────────────────

  /** A Rock Gnome whose Tinker trait grants tinker's-tools by effect.
   *  `overrides` is threaded so the suppression half can be exercised. */
  function rockGnome(overrides: unknown = {}) {
    return {
      definition: { overrides },
      classes: [], race: { slug: "srd-5e_race_rock-gnome", name: "Rock Gnome", languages: { fixed: [] } },
      background: null, feats: [], pools: [], state: {},
      features: [{
        feature: {
          id: "tinker", name: "Tinker", activatable: false,
          effects: [{ kind: "proficiency", proficiency_type: "tool", value: "tinker's-tools" }],
        },
        source: { kind: "race", slug: "srd-5e_race_rock-gnome" },
      }],
    } as never;
  }

  it("folds an effect-granted tool in as a grant, and it is suppressible", () => {
    expect(computeEffectiveProficiencies(rockGnome()).tools.map((e) => e.value)).toContain("tinker's-tools");
    const suppressed = rockGnome({ tools: { remove: ["tinker's-tools"] } });
    expect(computeEffectiveProficiencies(suppressed).tools.map((e) => e.value)).not.toContain("tinker's-tools");
  });
});
