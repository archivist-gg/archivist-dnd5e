import { describe, it, expect } from "vitest";
import { parseSpell } from "@archivist-gg/dnd5e/spell/spell.parser";

/**
 * R4-G2 Task 1 · spec §2 (the fourteen new keys) and §3 (the `components` / `duration`
 * structured forms normalised inside `parseSpell`).
 *
 * Every literal below is copied from the spec's own tables: §2's key table and §3.3's
 * thirteen-row mapping table, whose inputs are the MEASURED converter variants over the
 * frozen tree `744b2b85…` (186 components-object docs, 35 duration-array docs).
 */

/** A minimal ACCEPTED spell document; the case under test appends its own YAML. */
const fence = (extra: string) => `name: T\nlevel: 1\n${extra}`;

/** [label, appended YAML, pinned output literal] */
type Row = [string, string, string];

// §3.3 rows 1-6 — the components OBJECT collapses to the corpus's own `V, S, M (…)` string.
// Letter order is V, S, M, R; `m` object -> `M (<text>)` (the text already carries cost prose),
// `m` string -> `M (<string>)`, `m: true` -> a bare `M`. `R` is the Acquisitions-Incorporated
// royalty component: an invented-but-decided literal (Gate 0 B-5), no precedent in the string half.
const COMPONENT_ROWS: Row[] = [
  ["row 1 · {m,s,v} with an m object carrying cost (171 docs, the modal key-set)",
    `components:\n  v: true\n  s: true\n  m:\n    text: a gem worth at least 50 gp\n    cost: 5000\n`,
    "V, S, M (a gem worth at least 50 gp)"],
  ["row 2 · {m,r,s} with the m STRING arm (1 doc: Jim's Glowing Coin)",
    `components:\n  s: true\n  m: a coin\n  r: true\n`,
    "S, M (a coin), R"],
  ["row 3 · {r,s,v} (2 docs) — R with no material",
    `components:\n  v: true\n  s: true\n  r: true\n`,
    "V, S, R"],
  ["row 4 · {m,s} (10 docs, e.g. Booming Blade) — cost 10, no v",
    `components:\n  s: true\n  m:\n    text: a melee weapon worth at least 1 sp\n    cost: 10\n`,
    "S, M (a melee weapon worth at least 1 sp)"],
  ["row 5 · {m,v} (2 docs) with the m {consume,text} shape (9 docs)",
    `components:\n  v: true\n  m:\n    text: a pinch of dust\n    consume: true\n`,
    "V, M (a pinch of dust)"],
  ["row 6 · m: true — the BOOLEAN material arm (0 carriers, defensive)",
    `components:\n  m: true\n`,
    "M"],
];

// §3.3 rows 7-13 — the duration ARRAY collapses to the corpus's own lowercase string form.
// `ends` word map: dispel -> dispelled, trigger -> triggered, joined " or ", prefixed "until ".
// timed -> `[up to ]<amount> <unit>[s]`, plural when amount > 1. Concentration is NEVER
// synthesised (the separate `concentration` boolean drives the sheet's `Conc · ` prefix).
const DURATION_ROWS: Row[] = [
  ["row 7 · timed minute, up_to (2 docs, e.g. RaM Thaumaturgy — the only `minute` exercise)",
    `duration:\n  - type: timed\n    duration:\n      type: minute\n      amount: 1\n      up_to: true\n`,
    "up to 1 minute"],
  ["row 8 · permanent, ends [dispel, trigger] (6 docs)",
    `duration:\n  - type: permanent\n    ends: [dispel, trigger]\n`,
    "until dispelled or triggered"],
  ["row 9 · permanent, ends [dispel] (24 docs, the modal duration)",
    `duration:\n  - type: permanent\n    ends: [dispel]\n`,
    "until dispelled"],
  ["row 10 · timed hour 1, up_to (2 docs)",
    `duration:\n  - type: timed\n    duration:\n      type: hour\n      amount: 1\n      up_to: true\n`,
    "up to 1 hour"],
  ["row 11 · timed hour 8, up_to — the PLURAL unit (1 doc)",
    `duration:\n  - type: timed\n    duration:\n      type: hour\n      amount: 8\n      up_to: true\n`,
    "up to 8 hours"],
  ["row 12a · timed hour 1, up_to ABSENT (0 carriers, defensive)",
    `duration:\n  - type: timed\n    duration:\n      type: hour\n      amount: 1\n`,
    "1 hour"],
  ["row 12b · timed hour 8, up_to FALSE (0 carriers, defensive)",
    `duration:\n  - type: timed\n    duration:\n      type: hour\n      amount: 8\n      up_to: false\n`,
    "8 hours"],
  ["row 13 · TWO entries joined with '; ' (0 carriers, defensive)",
    `duration:\n  - type: permanent\n    ends: [dispel]\n  - type: timed\n    duration:\n      type: hour\n      amount: 1\n      up_to: true\n`,
    "until dispelled; up to 1 hour"],
];

describe("spell §3.3 normalisation — one pinned literal per measured variant (§11.2)", () => {
  it.each(COMPONENT_ROWS)("components %s", (_label, yamlFragment, want) => {
    const r = parseSpell(fence(yamlFragment));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.components).toBe(want);
  });

  it.each(DURATION_ROWS)("duration %s", (_label, yamlFragment, want) => {
    const r = parseSpell(fence(yamlFragment));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.duration).toBe(want);
  });

  it("the STRING arms pass through byte-unchanged (862 components / 1,013 duration docs)", () => {
    const r = parseSpell(fence(`components: V, S, M (a tiny ball of bat guano and sulfur)\nduration: instantaneous\n`));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.components).toBe("V, S, M (a tiny ball of bat guano and sulfur)");
      expect(r.data.duration).toBe("instantaneous");
    }
  });

  it("§11.2 CONTROL · a widened-but-UNNORMALISED path would surface toStringSafe's JSON", () => {
    // `toStringSafe` JSON-stringifies an object (archivist-core yaml-utils): widening the schema
    // WITHOUT the normaliser renders `{"v":true,...}` straight into the sheet. This is the kill.
    const r = parseSpell(fence(`components:\n  v: true\n  s: true\n  m:\n    text: a coin\n    cost: 100\n`));
    expect(r.success).toBe(true);
    if (r.success) {
      const c = r.data.components ?? "";
      expect(c.startsWith("{")).toBe(false);
      expect(c.includes('"v":')).toBe(false);
      expect(c).toBe("V, S, M (a coin)");
    }
  });

  it("the m.consume STRING arm parses (measured union: boolean | string)", () => {
    const r = parseSpell(fence(`components:\n  v: true\n  m:\n    text: a diamond worth 300 gp\n    cost: 30000\n    consume: optional\n`));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.components).toBe("V, M (a diamond worth 300 gp)");
  });
});

describe("spell §3.2 fail-loud pins — a NEW converter shape refuses visibly, never normalises wrongly", () => {
  const REFUSALS: Array<[string, string]> = [
    ["an undeclared components key", `components:\n  x: true\n`],
    ["an out-of-vocabulary ends word", `duration:\n  - type: permanent\n    ends: [banish]\n`],
    ["an empty ends array (.nonempty())", `duration:\n  - type: permanent\n    ends: []\n`],
    ["an empty duration array (.nonempty())", `duration: []\n`],
    ["an undeclared timed unit", `duration:\n  - type: timed\n    duration:\n      type: day\n      amount: 1\n`],
    ["an undeclared duration entry type", `duration:\n  - type: forever\n`],
    ["a non-integer timed amount", `duration:\n  - type: timed\n    duration:\n      type: hour\n      amount: 1.5\n`],
  ];
  it.each(REFUSALS)("refuses %s", (_label, yamlFragment) => {
    expect(parseSpell(fence(yamlFragment)).success).toBe(false);
  });
});

describe("spell §2 — the fourteen new keys survive parseSpell (the five-surface pin)", () => {
  const ALL_FOURTEEN =
    `rendering_hint: ''\n` +
    `misc_tags:\n  - SGT\n` +
    `area_tags:\n  - ST\n` +
    `condition_inflict:\n  - blinded\n` +
    `affects_creature_type:\n  - humanoid\n` +
    `spell_attack: ranged\n` +
    `ability_check:\n  - str\n` +
    `damage_resist:\n  - fire\n` +
    `damage_immune:\n  - cold\n` +
    `condition_immune:\n  - charmed\n` +
    `damage_vulnerable:\n  - thunder\n` +
    `has_fluff: true\n` +
    `image: '[[SRD 2024/Images/Spells/A.webp]]'\n` +
    `has_fluff_images: true\n`;

  it("KEY-SET pin (not `in`-presence): all 14 keys are on the returned Spell, with their values", () => {
    const r = parseSpell(fence(ALL_FOURTEEN));
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(Object.keys(r.data).sort()).toEqual([
      "ability_check", "affects_creature_type", "area_tags", "condition_immune",
      "condition_inflict", "damage_immune", "damage_resist", "damage_vulnerable",
      "has_fluff", "has_fluff_images", "image", "level", "misc_tags", "name",
      "rendering_hint", "spell_attack",
    ]);
    expect(r.data.rendering_hint).toBe("");
    expect(r.data.misc_tags).toEqual(["SGT"]);
    expect(r.data.area_tags).toEqual(["ST"]);
    expect(r.data.condition_inflict).toEqual(["blinded"]);
    expect(r.data.affects_creature_type).toEqual(["humanoid"]);
    expect(r.data.spell_attack).toBe("ranged");
    expect(r.data.ability_check).toEqual(["str"]);
    expect(r.data.damage_resist).toEqual(["fire"]);
    expect(r.data.damage_immune).toEqual(["cold"]);
    expect(r.data.condition_immune).toEqual(["charmed"]);
    expect(r.data.damage_vulnerable).toEqual(["thunder"]);
    expect(r.data.has_fluff).toBe(true);
    expect(r.data.image).toBe("[[SRD 2024/Images/Spells/A.webp]]");
    expect(r.data.has_fluff_images).toBe(true);
  });

  it("§11.2a COPY-GUARD · rendering_hint: '' KEEPS the key (a truthiness guard would strip 1,048)", () => {
    const r = parseSpell(fence(`rendering_hint: ''\n`));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.rendering_hint).toBe("");
      expect(Object.keys(r.data)).toContain("rendering_hint");
    }
  });

  it("the image ARRAY arm survives (imageField's second arm)", () => {
    const r = parseSpell(fence(`image:\n  - '[[SRD 2024/Images/Spells/A.webp]]'\n  - '[[SRD 2024/Images/Spells/B.webp]]'\n`));
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.image)
      .toEqual(["[[SRD 2024/Images/Spells/A.webp]]", "[[SRD 2024/Images/Spells/B.webp]]"]);
  });

  it("spell_attack is an ENUM: melee accepted, psychic refused (measured: ranged 44 / melee 33)", () => {
    const ok = parseSpell(fence(`spell_attack: melee\n`));
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.spell_attack).toBe("melee");
    expect(parseSpell(fence(`spell_attack: psychic\n`)).success).toBe(false);
  });
});
