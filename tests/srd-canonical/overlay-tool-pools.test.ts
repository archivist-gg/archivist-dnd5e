import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as yaml from "js-yaml";
import { loadOverlay } from "../../tools/srd-canonical/sources/overlay";
import { bareSlug } from "../../tools/srd-canonical/merger-rules/class-merge";
import { ALL_TOOLS, ARTISANS_TOOLS, MUSICAL_INSTRUMENTS, GAMING_SETS } from "../../src/types/choice";
import type { Choice } from "../../src/types/choice";
import cls2014 from "../../src/srd/data/runtime/class.2014.json";
import cls2024 from "../../src/srd/data/runtime/class.2024.json";
import sub2014 from "../../src/srd/data/runtime/subclass.2014.json";
import sub2024 from "../../src/srd/data/runtime/subclass.2024.json";

/**
 * P3a task 7 · overlay tool pools.
 *
 * Everything authored in the overlays is INERT until the next SRD regeneration,
 * which this phase does NOT run. So these tests are the ONLY thing standing
 * between a mis-keyed slug and a permanent, invisible defect: `ALL_TOOLS` is a
 * plain `string[]` and the YAML literals are parsed at runtime, so TypeScript
 * gives exactly ZERO compile-time protection over what the overlays author.
 *
 * Two structural rules every assertion here obeys:
 *   1. `[].every(...)` returns TRUE, so a bare `every` passes when the read
 *      returns an empty array, which is exactly what a wrong YAML path
 *      expression produces. Every subset assertion is paired with a
 *      `toHaveLength(n)`.
 *   2. Both overlays are read through `loadOverlay`, never raw `yaml.load`.
 *      `loadOverlay` runs `overlaySchema.safeParse`, and NOTHING ELSE in this
 *      suite parses the real `srd-5e.yaml` (overlay.test.ts loads a fixture
 *      copy; feat-merge.test.ts reads the 2024 file as raw text), so without
 *      this file the 2014 entries would ship unvalidated.
 */

const OVERLAY_2014 = path.resolve(__dirname, "../../tools/srd-canonical/overlays/srd-5e.yaml");
const OVERLAY_2024 = path.resolve(__dirname, "../../tools/srd-canonical/overlays/srd-2024.yaml");

/** The `from` pool of the `domain: "tool"` select-proficiency in a choices list. */
function toolPool(choices: Choice[] | undefined): string[] | undefined {
  const ch = (choices ?? []).find(
    (c): c is Extract<Choice, { kind: "select-proficiency" }> =>
      c.kind === "select-proficiency" && c.domain === "tool",
  );
  return ch?.from;
}

function toolChoice(choices: Choice[] | undefined): Extract<Choice, { kind: "select-proficiency" }> | undefined {
  return (choices ?? []).find(
    (c): c is Extract<Choice, { kind: "select-proficiency" }> =>
      c.kind === "select-proficiency" && c.domain === "tool",
  );
}

describe("authored tool `from` pools are subsets of the tool vocabulary", () => {
  it("Soldier 2024 background: the gaming-set pair", async () => {
    const overlay = await loadOverlay(OVERLAY_2024);
    const from = toolPool(overlay.backgrounds?.soldier?.choices);
    expect(from).toHaveLength(2);
    expect(from!.every((s) => GAMING_SETS.includes(s))).toBe(true);
    expect(from).toEqual(GAMING_SETS);
    expect(toolChoice(overlay.backgrounds?.soldier?.choices)).toMatchObject({ id: "tool", count: 1 });
  });

  it("Dwarf 2014 Tool Proficiency trait: three artisan's tools, canonical slugs", async () => {
    const overlay = await loadOverlay(OVERLAY_2014);
    const from = toolPool(overlay.race_traits?.["tool-proficiency"]?.choices);
    expect(from).toHaveLength(3);
    expect(from!.every((s) => ARTISANS_TOOLS.includes(s))).toBe(true);
    // Pinned literally: this is the re-slug from the old prose spellings
    // ("smith's tools"), and a typo here is invisible until the regen.
    expect(from).toEqual(["smith's-tools", "brewer's-supplies", "mason's-tools"]);
  });

  it.each([
    { edition: "2014", file: OVERLAY_2014 },
    { edition: "2024", file: OVERLAY_2024 },
  ])("Bard $edition: three musical instruments from the full instrument list", async ({ file }) => {
    const overlay = await loadOverlay(file);
    const choice = toolChoice(overlay.classes?.bard?.choices);
    expect(choice).toMatchObject({ kind: "select-proficiency", id: "tool", domain: "tool", count: 3 });
    const from = choice?.from;
    expect(from).toHaveLength(10);
    expect(from!.every((s) => MUSICAL_INSTRUMENTS.includes(s))).toBe(true);
    expect(from).toEqual(MUSICAL_INSTRUMENTS);
  });

  it.each([
    { edition: "2014", file: OVERLAY_2014 },
    { edition: "2024", file: OVERLAY_2024 },
  ])("Monk $edition: one artisan's tool or musical instrument (27 options)", async ({ file }) => {
    const overlay = await loadOverlay(file);
    const choice = toolChoice(overlay.classes?.monk?.choices);
    expect(choice).toMatchObject({ kind: "select-proficiency", id: "tool", domain: "tool", count: 1 });
    const from = choice?.from;
    expect(from).toHaveLength(27);
    expect(from!.every((s) => ARTISANS_TOOLS.includes(s) || MUSICAL_INSTRUMENTS.includes(s))).toBe(true);
    expect(from).toEqual([...ARTISANS_TOOLS, ...MUSICAL_INSTRUMENTS]);
  });

  // Exhaustive sweep: catches any FUTURE authored tool pool too, not just the
  // four entries this task added.
  //
  // "Anywhere" is RECURSIVE. A select-inline option's nested `choices` are
  // authored decisions like any other, and the flat predecessor of this walk
  // descended into NONE of them. The 2024 overlay has 9 select-inline options
  // carrying nested choices, 3 of which already hold a domain:"tool" choice
  // (feat_features.skilled.choices[0].options[1..3], the Skilled feat's tool
  // branches), so a bogus slug authored into a constrained pool at any of those
  // sites was invisible: the flat walk collected 3, matched `expected: 3` and
  // went green. Those branches are precisely where the next constrained tool
  // pool would be authored.
  //
  // Both counts are pinned LITERALLY, deliberately NOT derived from the data
  // under test · that is what makes them an exhaustiveness guard rather than a
  // bare maintenance touchpoint:
  //   - `expected` counts EVERY domain:"tool" choice, `from` or not, so a newly
  //     authored nested choice cannot slip past the walk unnoticed.
  //   - `expectedPooled` pins how many of those carry a `from`. The subset loop
  //     is gated on `from` (a from-less choice enumerates ALL_TOOLS and has no
  //     pool to check), so by rule 1 at the top of this file that gated loop
  //     needs its own length pin: without it, converting the last pooled choice
  //     to from-less would leave the subset check silently vacuous.
  // Today: 2014 has 3 tool choices, all 3 pooled. 2024 has 6, of which 3 are
  // pooled (Bard, Monk, Soldier) and 3 are the from-less Skilled branches.
  it.each([
    { edition: "2014", file: OVERLAY_2014, expected: 3, expectedPooled: 3 },
    { edition: "2024", file: OVERLAY_2024, expected: 6, expectedPooled: 3 },
  ])("every domain:tool `from` anywhere in the $edition overlay is a subset of ALL_TOOLS", async ({ file, expected, expectedPooled }) => {
    const overlay = await loadOverlay(file);
    const found: Array<{ where: string; from?: string[] }> = [];
    const collect = (where: string, choices: Choice[] | undefined): void => {
      (choices ?? []).forEach((c, i) => {
        const at = `${where}.choices[${i}]`;
        if (c.kind === "select-proficiency" && c.domain === "tool") {
          found.push({ where: at, from: c.from });
        }
        if (c.kind === "select-inline") {
          (c.options ?? []).forEach((opt, j) => collect(`${at}.options[${j}]`, opt.choices));
        }
      });
    };
    for (const [k, v] of Object.entries(overlay.class_features ?? {})) collect(`class_features.${k}`, v.choices);
    for (const [k, v] of Object.entries(overlay.race_traits ?? {})) collect(`race_traits.${k}`, v.choices);
    for (const [k, v] of Object.entries(overlay.feat_features ?? {})) collect(`feat_features.${k}`, v.choices);
    for (const [k, v] of Object.entries(overlay.background_features ?? {})) collect(`background_features.${k}`, v.choices);
    for (const [k, v] of Object.entries(overlay.classes ?? {})) collect(`classes.${k}`, v.choices);
    for (const [k, v] of Object.entries(overlay.races ?? {})) collect(`races.${k}`, v.choices);
    for (const [k, v] of Object.entries(overlay.backgrounds ?? {})) collect(`backgrounds.${k}`, v.choices);

    expect(found.map((p) => p.where)).toHaveLength(expected);
    const pooled = found.filter((p): p is { where: string; from: string[] } => !!p.from);
    expect(pooled.map((p) => p.where)).toHaveLength(expectedPooled);
    for (const p of pooled) {
      const strays = p.from.filter((s) => !ALL_TOOLS.includes(s));
      expect(strays, `${p.where} authored slugs outside ALL_TOOLS`).toEqual([]);
    }
  });

  /**
   * `loadOverlay` used to pass `{ json: true }` to `yaml.load` under a comment
   * claiming that is what makes js-yaml error on duplicate map keys. Measured on
   * the pinned js-yaml 4.3.0, `json: true` does the OPPOSITE: it is the
   * JSON.parse-compatibility flag, so a duplicate key silently keeps the LAST
   * value, while the DEFAULT options throw "duplicated mapping key". The flag
   * has been dropped, so `loadOverlay` now genuinely has the detection that the
   * design spec and the task brief both already believed it had.
   *
   * This test is KEPT as belt and braces even though the loader is fixed: it
   * names the two shipped overlays explicitly and re-reads them with the
   * throwing default itself, so it keeps failing loudly no matter what a future
   * refactor does to `loadOverlay`. A duplicated `choices:` key of exactly the
   * kind authored into four class blocks here cannot be swallowed unnoticed.
   */
  it.each([
    { edition: "2014", file: OVERLAY_2014 },
    { edition: "2024", file: OVERLAY_2024 },
  ])("the $edition overlay has no duplicate map keys, independent of loadOverlay", ({ file }) => {
    expect(() => yaml.load(fs.readFileSync(file, "utf8"))).not.toThrow();
  });
});

/**
 * Id-uniqueness. `pc.decision-engine.ts` reads every level-1 decision through
 * `readAt(1)(id)`, which indexes `c.choices[1][id]` · a FLAT per-level
 * namespace shared by:
 *   - every level-1 class feature choice,
 *   - every level-1 subclass feature choice, when subclass_level === 1,
 *   - the synthesized `"skills"` row (pc.decision-engine.ts:408-410),
 *   - the synthesized `equipment-{i}` rows (pc.decision-engine.ts:648), which
 *     `class-chronicle.ts:244` additionally filters out of the owned strip by
 *     prefix, so an authored `equipment-*` id would be counted in the browse
 *     preview and silently dropped from the strip.
 * So an entity-level class choice sharing an id with any of those collides
 * exactly. Level-1 feature ids are read from the GENERATED runtime data, which
 * is the honest snapshot of what those levels currently contain.
 *
 * NB this lives here and not in `tools/srd-canonical/validate-overlays.ts`,
 * which has zero callers (absent from package.json scripts and from the
 * tri-repo gate) and would be dead on arrival.
 */
interface FeatureLike { choices?: Array<{ id: string }> }
interface ClassLike { slug: string; subclass_level?: number | null; features_by_level?: Record<string, FeatureLike[]> }
interface SubclassLike { slug: string; parent_class?: string; features_by_level?: Record<string, FeatureLike[]> }

/** "[[SRD 5e/Classes/Sorcerer]]" -> "sorcerer" */
function parentClassBare(ref: string | undefined): string {
  const inner = (ref ?? "").replace(/^\[\[|\]\]$/g, "");
  return (inner.split("/").pop() ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

const RESERVED_L1_IDS = ["skills"];
const RESERVED_L1_PREFIX = "equipment-";

describe.each([
  { edition: "2014", file: OVERLAY_2014, classes: cls2014 as unknown as ClassLike[], subclasses: sub2014 as unknown as SubclassLike[] },
  { edition: "2024", file: OVERLAY_2024, classes: cls2024 as unknown as ClassLike[], subclasses: sub2024 as unknown as SubclassLike[] },
])("entity-level class choice ids are unique in the level-1 namespace ($edition)", ({ file, classes, subclasses }) => {
  it("no authored class-level choice id collides with a level-1 feature or reserved id", async () => {
    const overlay = await loadOverlay(file);
    const authored = Object.entries(overlay.classes ?? {}).filter(([, v]) => (v.choices?.length ?? 0) > 0);
    // Vacuity guard: an empty `authored` would make every loop below trivially pass.
    expect(authored.length).toBeGreaterThan(0);

    for (const [bare, override] of authored) {
      const cls = classes.find((c) => bareSlug(c.slug) === bare);
      if (!cls) throw new Error(`overlay classes.${bare} has no generated class entry`);

      const l1Ids = new Set<string>(RESERVED_L1_IDS);
      for (const f of cls.features_by_level?.["1"] ?? []) for (const ch of f.choices ?? []) l1Ids.add(ch.id);
      if (cls.subclass_level === 1) {
        for (const sc of subclasses.filter((s) => parentClassBare(s.parent_class) === bare)) {
          for (const f of sc.features_by_level?.["1"] ?? []) for (const ch of f.choices ?? []) l1Ids.add(ch.id);
        }
      }

      const seen = new Set<string>();
      for (const ch of override.choices ?? []) {
        expect(l1Ids.has(ch.id), `classes.${bare}: choice id "${ch.id}" collides with a level-1 id`).toBe(false);
        expect(ch.id.startsWith(RESERVED_L1_PREFIX), `classes.${bare}: choice id "${ch.id}" uses the reserved equipment- namespace`).toBe(false);
        expect(seen.has(ch.id), `classes.${bare}: duplicate class-level choice id "${ch.id}"`).toBe(false);
        seen.add(ch.id);
      }
    }
  });
});
