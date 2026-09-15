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
    // Map-order return puts "Abyssal" last. The bucket this replaced (the return
    // of `aggregateProficiencies` in pc.proficiencies.ts) returned
    // `[...languages].sort()` over the display strings, and that function now
    // passes this output straight through;
    // returning insertion order would silently reorder every sheet row and falsify
    // spec §3.3's "byte-identical to today's" guarantee. Nothing else in either
    // suite catches it: the aggregate tests use toContain and the panel test mocks
    // the aggregate wholesale, and the other cases here happen to be already sorted.
    const eff = computeEffectiveProficiencies(dwarf({ languages: { add: ["abyssal"] } }));
    expect(eff.languages.map((e) => e.label)).toEqual(["Abyssal", "Common", "Dwarvish"]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // The THIRD label branch (spec §3.3): an off-vocabulary GRANT/PICK renders
  // `proficiencyLabel(raw)`, byte-identical to the module-private prettyName,
  // NOT the raw string. The raw string is reserved for values the user typed.
  // Since R4-G7 T8 RIDER-14 that label keeps authored PROSE casing (a phrase
  // carrying uppercase) instead of title-casing it word by word, and still folds.
  //
  // This branch is LIVE in the converter corpus, not in the SRD (measured
  // 2026-09-15 against ALL_TOOLS): the SRD runtime class JSON and the bundle grant
  // fixed tools only to Druid and Rogue, all vocabulary hits, while the converter's
  // class documents carry SEVEN off-vocabulary `tools.fixed` values (three
  // Artificers; Bard and Monk in both Player's Handbooks), none with a U+2019. The
  // fixture below is therefore HAND-WRITTEN, a Monk-shaped value given a U+2019 so
  // the label and the raw value differ by more than casing · a blanket raw rule
  // would put a curly apostrophe on screen, undoing the fold R4-P3a landed.
  // ───────────────────────────────────────────────────────────────────────────
  it("labels an OFF-VOCABULARY GRANT through the fold rather than passing the raw string through", () => {
    const monk2014 = {
      race: undefined,
      classes: [{
        entity: {
          slug: "monk", name: "Monk",
          // Hand-written (no shipped class grant is off-vocabulary AND curly) · note the U+2019.
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
      // ...but the LABEL folds U+2019 to ASCII. The value is authored prose (it
      // carries an uppercase letter), so its casing is kept as authored (R4-G7 T8
      // RIDER-14; it read "Choose One Type Of Artisan's Tools Or One Musical
      // Instrument" before).
      label: "Choose one type of artisan's tools or one musical instrument",
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

  // ───────────────────────────────────────────────────────────────────────────
  // R4-P4 (P3c carry-forward 8): the LANGUAGE half of the same limb.
  //
  // `grants.effectLanguages` sits in the `domain === "languages"` grantBuckets
  // alongside its `effectTools` twin, but until these cases it was covered by
  // NOTHING: P3c removed it from that array and the whole suite stayed green.
  // pc-proficiency-grants.test.ts pins the COLLECTOR (that the bucket is filled,
  // with the canonical slug and the granting entity's display name) · what was
  // unpinned is that computeEffectiveProficiencies then FOLDS the bucket.
  // These are CHARACTERISATION cases: they passed on first run, and the mutation
  // above is what makes them worth having.
  //
  // The general keying rule, unchanged: `proficiencyEntryFor` keys a value the
  // vocabulary MISSES on the RAW string (only a HIT is folded through toProfSlug),
  // so an off-vocabulary language spelled two ways becomes two rows carrying the
  // SAME label. The effect side always arrives canonical (classifyProficiencyEffect
  // slugs it), so the spelling that has to coincide is the entity grant's.
  // What the file still exercises of that rule, and what it no longer does:
  // `MCDM Cant` above is the CUSTOM branch — a user-typed add, keyed on its raw
  // string and rendered verbatim (origin "custom"), not a grant at all. The 2014
  // Monk above is the grant-side vocabulary MISS: raw value as the key, label
  // humanized. Neither SPLITS a row, because each carries a single spelling.
  // The split itself — one language spelled two ways becoming two rows under one
  // label — is exercised NOWHERE in this file any more. Delta 5 retired it here
  // BY DESIGN; the rule above is stated for the reader, not pinned by this file.
  //
  // THIS family no longer exercises it. R4-G1b put `thieves'-cant` INTO
  // ALL_LANGUAGES (SECRET_LANGUAGES), which is the phase's deliberate fifth
  // user-visible delta: the prose spelling `Thieves' Cant` and the pre-slugged
  // effect grant now both HIT the vocabulary, `matchPool` canonicalizes them onto
  // the same key, and what used to be two rows with one label is ONE row carrying
  // both sources. That is the repair of exactly the duplicate-row defect P3c
  // named — pre-declared and adjudicated, not an accident of the widening.
  // ───────────────────────────────────────────────────────────────────────────

  /** A Rogue whose Thieves' Cant feature grants the language by EFFECT.
   *  "thieves'-cant" IS in ALL_LANGUAGES since R4-G1b (SECRET_LANGUAGES, beside
   *  "druidic"; the list is 8 standard + 8 exotic + 2 secret), and the authored
   *  value carries the U+2019 the 2014 SRD prose uses, which toProfSlug folds
   *  onto that same ASCII slug.
   *  `raceLanguages` threads a SECOND granting entity for the dedupe half,
   *  `overrides` the suppression half. */
  function cantRogue(opts: { overrides?: unknown; raceLanguages?: string[] } = {}) {
    return {
      definition: { overrides: opts.overrides ?? {} },
      classes: [{
        entity: { slug: "srd-5e_class_rogue", name: "Rogue" }, subclass: null, level: 1, choices: {},
      }],
      race: opts.raceLanguages
        ? { slug: "srd-5e_race_human", name: "Human", languages: { fixed: opts.raceLanguages } }
        : undefined,
      background: null, feats: [], pools: [], state: {},
      features: [{
        feature: {
          id: "thieves-cant", name: "Thieves' Cant", activatable: false,
          effects: [{ kind: "proficiency", proficiency_type: "language", value: "Thieves’ Cant" }],
        },
        source: { kind: "class", slug: "srd-5e_class_rogue" },
      }],
    } as never;
  }

  it("folds an effect-granted LANGUAGE in as a grant, carrying the granting entity", () => {
    const eff = computeEffectiveProficiencies(cantRogue());
    // The ONLY language on this character, so a dropped fold empties the list
    // rather than merely thinning one row's provenance.
    expect(eff.languages).toHaveLength(1);
    expect(eff.languages[0]).toMatchObject({
      value: "thieves'-cant",
      label: "Thieves' Cant",
      origin: "grant",
      sources: ["Rogue"],
    });
  });

  it("dedupes an effect-granted language against an identically-spelled entity grant", () => {
    // Race and effect agree byte-for-byte on the key, so they fold to ONE row
    // and the effect only appends its source. Walk order: race bucket before the
    // effect bucket, which goes last.
    const shared = computeEffectiveProficiencies(cantRogue({ raceLanguages: ["thieves'-cant"] }));
    expect(shared.languages).toHaveLength(1);
    expect(shared.languages[0]).toMatchObject({
      value: "thieves'-cant", label: "Thieves' Cant", origin: "grant", sources: ["Human", "Rogue"],
    });

    // The NEW characterisation (R4-G1b delta 5). Respell the race's grant as
    // prose and it no longer splits: `thieves'-cant` is in the vocabulary now, so
    // `matchPool` canonicalizes the prose spelling onto the pool slug and the two
    // grants FOLD to ONE row carrying BOTH sources. Before the widening this same
    // input produced two rows, values ["Thieves' Cant", "thieves'-cant"], both
    // rendering the identical label — the duplicate-row defect. Asserted as the
    // whole row, not just the values, so a regression that folded the key while
    // dropping a source would still be caught.
    const prose = computeEffectiveProficiencies(cantRogue({ raceLanguages: ["Thieves' Cant"] }));
    expect(prose.languages.map((e) => e.value)).toEqual(["thieves'-cant"]);
    expect(prose.languages.map((e) => e.label)).toEqual(["Thieves' Cant"]);
    expect(prose.languages[0]).toMatchObject({ origin: "grant", sources: ["Human", "Rogue"] });
  });

  it("suppresses an effect-granted language via overrides.languages.remove", () => {
    // Positive control in the same case: a negative asserted alone would pass
    // against a build that never folded the grant at all (the file's convention,
    // see the effect-granted TOOL case above).
    expect(computeEffectiveProficiencies(cantRogue()).languages.map((e) => e.value))
      .toEqual(["thieves'-cant"]);

    const bySlug = cantRogue({ overrides: { languages: { remove: ["thieves'-cant"] } } });
    expect(computeEffectiveProficiencies(bySlug).languages).toEqual([]);

    // The suppression filter runs toProfSlug over BOTH sides, so the PROSE
    // spelling suppresses the same row. Since R4-G1b that AGREES with the dedupe
    // key above rather than differing from it: with `thieves'-cant` in the
    // vocabulary both sides now fold, so suppression and dedupe answer alike.
    // Still worth pinning: a suppression narrowed to exact equality would leave
    // the row on screen with the remove silently inert.
    const byProse = cantRogue({ overrides: { languages: { remove: ["Thieves’ Cant"] } } });
    expect(computeEffectiveProficiencies(byProse).languages).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// R4-G4 §9.3 · Tier B (UR1): the per-tool manual tri, `overrides.tools.proficiency`.
//
// A tools-shaped twin of the `dwarf()` builder above. `features` is supplied
// (empty by default) because the file's other class-bearing fixtures do; the
// third-leg fixture below fills it with the DATA-expertise effect.
// ───────────────────────────────────────────────────────────────────────────
const rogue = (overrides: Record<string, unknown> = {}) =>
  ({
    race: null,
    classes: [{
      entity: {
        slug: "rogue", name: "Rogue",
        proficiencies: { tools: { fixed: ["thieves' tools", "herbalism kit"] } },
      },
      subclass: null, level: 1, choices: {},
    }],
    feats: [], background: undefined, features: [], pools: [], state: {},
    definition: { origin_choices: {}, overrides },
  }) as never;

/** A 2014 Rogue 6 whose Expertise feature grants thieves' tools with `expertise: true`
 *  on the EFFECT · the shape `tests/pc-proficiencies-aggregate.test.ts` uses for the same
 *  data, and the only way to reach the tri's "proficient clears a data expertise" arm.
 *  `source` is mandatory on a fixture feature: `collectProficiencyEffectGrants`
 *  dereferences `rf.source.kind` with no guard. */
const rogueWithDataExpertise = (overrides: Record<string, unknown> = {}) =>
  ({
    race: null,
    classes: [{
      entity: { slug: "rogue", name: "Rogue", proficiencies: { tools: { fixed: ["thieves' tools"] } } },
      subclass: null, level: 6, choices: {},
    }],
    feats: [], background: undefined, pools: [], state: {},
    features: [{
      feature: {
        id: "rogue:expertise", name: "Expertise",
        effects: [{ kind: "proficiency", proficiency_type: "tool", value: "thieves' tools", expertise: true }],
      },
      source: { kind: "class", slug: "rogue" },
    }],
    definition: { origin_choices: {}, overrides },
  }) as never;

describe("computeEffectiveProficiencies · the manual tools tri (R4-G4 §9.3, UR1)", () => {
  it("R4-G4 §9.3 (RED FIRST): a manual expertise beats a plain data grant and a manual none suppresses one", () => {
    const eff = computeEffectiveProficiencies(rogue({ tools: { proficiency: { "thieves'-tools": "expertise", "herbalism-kit": "none" } } }));
    expect(eff.tools.map((e) => [e.value, e.expertise ?? false])).toEqual([["thieves'-tools", true]]);
  });

  it("R4-G4 §9.3: a manual proficient CLEARS a data expertise (the reachable-from-a-note leg)", () => {
    // Addendum H(2), stated where it can be read: no modal click ever persists
    // `proficient` for a DATA-expertise tool. The modal cycle on such a chip is
    // expertise -> none -> (the candidate pip clears the tri) -> expertise, and
    // `setToolProficiency`'s `proficient` writes the ABSENT key. This leg is
    // therefore reached ONLY by a hand-edited character note, which is exactly
    // what this fixture is. It is the `else delete entry.expertise` arm (m29b):
    // without it the flag survives and the read below is `true`.
    const eff = computeEffectiveProficiencies(rogueWithDataExpertise({ tools: { proficiency: { "thieves'-tools": "proficient" } } }));
    expect(eff.tools.find((e) => e.value === "thieves'-tools")?.expertise ?? false).toBe(false);
    // The tool is still KNOWN · `proficient` clears the flag, it does not suppress the row.
    expect(eff.tools.map((e) => e.value)).toEqual(["thieves'-tools"]);
    // The positive control in the same case: without the override the SAME fixture
    // reads expertise, so a build that never folded the effect grant at all cannot
    // pass the assertion above (the file's convention for negative claims).
    expect(computeEffectiveProficiencies(rogueWithDataExpertise()).tools[0].expertise).toBe(true);
  });

  it("R4-G4 §9.3: a tri for a tool the character does NOT have grants it, as a hand-edited note asks", () => {
    // The `!entry` limb: `expertise` (or `proficient`) on an absent tool pushes it
    // through the same `push` the manual `add[]` uses, so `origin` reads `manual`
    // for a vocabulary hit. Mirrors the skills tri, which sets proficiency whether
    // or not the character had the skill.
    const eff = computeEffectiveProficiencies(rogue({ tools: { proficiency: { "forgery-kit": "expertise" } } }));
    expect(eff.tools.find((e) => e.value === "forgery-kit")).toMatchObject({
      label: "Forgery Kit", origin: "manual", expertise: true,
    });
  });

  it("R4-G4 §9.3: languages get NO tri · a `proficiency` key under overrides.languages is inert", () => {
    // §9.3's closing sentence, pinned. `build(domain)`'s tri read is an explicit
    // tools branch, so this cannot silently start working for languages.
    const eff = computeEffectiveProficiencies(dwarf({ languages: { proficiency: { dwarvish: "none" } } }));
    expect(eff.languages.map((e) => e.value)).toEqual(["common", "dwarvish"]);
  });
});
