import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadOverlay } from "../../tools/srd-canonical/sources/overlay";
import type { Overlay } from "../../tools/srd-canonical/overlay.schema";
import { raceMergeRule, toRaceCanonical } from "../../tools/srd-canonical/merger-rules/race-merge";
import type { CanonicalEntry } from "../../tools/srd-canonical/merger";
import { projectToRuntime } from "../../tools/srd-canonical/to-runtime";
import { buildMockRegistry } from "../mock-entity-registry";
import { PCResolver } from "../../src/pc/pc.resolver";
import { recalc } from "../../src/pc/pc.recalc";
import { aggregateProficiencies, type ProficiencyAggregate } from "../../src/pc/pc.proficiencies";
import type { Character, DerivedStats, ResolvedCharacter } from "../../src/pc/pc.types";
import type { EntityRegistry } from "@archivist-gg/core";

// R4-P4 task 13: the AUTHORED-GRANT CHAIN, pinned end to end.
//
// R4-P3c authored five SRD-2014 species traits that state a proficiency in prose
// and previously granted nothing. Every test it shipped stops at a seam: the
// overlay parses, the merge keys, the effect walk collects. NONE of them join the
// authored YAML to what a player actually sees. The whole-branch review closed
// that gap by hand, with a THROWAWAY probe that loaded the real `srd-5e.yaml`
// through the real `loadOverlay`, applied the real `race-merge` keying onto the
// real `race.2014.json`, then ran `PCResolver` to `recalc` to
// `aggregateProficiencies`. It was deleted after use. This file is that probe
// made permanent · same real symbols, same three traces, no new invention.
//
// It lives in dnd5e and not in the plugin because the chain reaches
// `tools/srd-canonical/**`, which is not in this package's `exports` map and is
// therefore unreachable from a plugin test.
//
// WHY THE BASE TRAITS ARE STRIPPED OF `effects` BELOW: post-regeneration
// `race.2014.json` already carries the authored effects, so a test that merely
// read it would stay green after the overlay was gutted · it would pin the
// generator's OUTPUT, not the authoring. `speciesBase` therefore rebuilds the
// Open5e-shaped base from the runtime record with `effects` dropped, and the
// overlay is the only thing that can put them back. The Step-4 mutation control
// is what proves it: deleting `dwarven-combat-training.effects` from a scratch
// copy of the YAML turns assertion 1 red.

const RUNTIME_DIR = path.resolve(__dirname, "../../src/srd/data/runtime");

// Env-overridable ONLY so the mutation control can point a throwaway run at a
// MUTATED COPY of the overlay under /tmp without touching the committed YAML.
// Unset in every normal run, including CI, where the real file is read.
const OVERLAY = process.env.ARCHIVIST_GRANT_CHAIN_OVERLAY
  ?? path.resolve(__dirname, "../../tools/srd-canonical/overlays/srd-5e.yaml");

type Row = Record<string, unknown>;

const readRuntime = (file: string): Row[] =>
  JSON.parse(fs.readFileSync(path.join(RUNTIME_DIR, file), "utf8")) as Row[];

const rowBySlug = (rows: Row[], slug: string): Row => {
  const row = rows.find(r => r.slug === slug);
  if (!row) throw new Error(`runtime row not found: ${slug}`);
  return row;
};

const RACES = readRuntime("race.2014.json");
const CLASSES = readRuntime("class.2014.json");
const WEAPONS = readRuntime("weapon.2014.json");

// `loadOverlay` is async; loading it once here keeps both helpers synchronous,
// which is what lets each assertion read as one straight line.
let overlay: Overlay;
beforeAll(async () => {
  overlay = await loadOverlay(OVERLAY);
});

/** The Open5e-shaped base the merger consumes, rebuilt from the shipped runtime
 *  species record. `desc` (Open5e) vs `description` (runtime) is a real rename,
 *  and `effects` is dropped on purpose · see the header. `subspecies_of` is
 *  nulled because the runtime carries a wikilink where Open5e carries a bare key,
 *  and nothing downstream of the resolver reads the field at all. */
function speciesBase(slug: string): Row {
  const runtime = rowBySlug(RACES, slug);
  const traits = (runtime.traits as Array<{ name: string; description?: string }>).map(t => ({
    name: t.name,
    desc: t.description ?? "",
  }));
  return {
    key: slug,
    name: runtime.name,
    desc: runtime.description ?? "",
    is_subspecies: false,
    subspecies_of: null,
    traits,
  };
}

/** overlay YAML -> pickOverlay -> toRaceCanonical -> projectToRuntime: the real
 *  generator path for one species, run in-process. */
function mergedSpecies(slug: string): Row {
  const entry: CanonicalEntry = {
    slug,
    edition: "2014",
    kind: "race",
    base: speciesBase(slug) as never,
    structured: null,
    activation: null,
    overlay: raceMergeRule.pickOverlay(overlay, slug),
  };
  return projectToRuntime("race", toRaceCanonical(entry) as unknown as Row);
}

interface ChainOpts {
  race: string;
  cls: string;
  level: number;
  /** Bare weapon names, e.g. `["battleaxe"]`, equipped and resolved from `weapon.2014.json`. */
  equipped?: string[];
  /** Values for `overrides.tools.remove`, for the suppression half of assertion 3. */
  suppressTools?: string[];
}

/** Shared spine of the two named helpers: build the registry from the MERGED
 *  species plus the shipped class/weapon records, resolve, and hand both back.
 *  A resolver warning means a slug missed the registry, which would make every
 *  assertion below vacuous, so it is promoted to a throw. */
function resolveFor(opts: ChainOpts): { resolved: ResolvedCharacter; registry: EntityRegistry } {
  const weapons = (opts.equipped ?? []).map(name => rowBySlug(WEAPONS, `srd-5e_weapon_${name}`));
  const registry = buildMockRegistry([
    { slug: opts.race, entityType: "race", name: mergedSpecies(opts.race).name as string, data: mergedSpecies(opts.race) },
    { slug: opts.cls, entityType: "class", name: rowBySlug(CLASSES, opts.cls).name as string, data: rowBySlug(CLASSES, opts.cls) },
    ...weapons.map(w => ({ slug: w.slug as string, entityType: "weapon", name: w.name as string, data: w })),
  ]);

  const character = {
    name: "Grant Chain",
    edition: "2014",
    race: `[[${opts.race}]]`,
    subrace: null,
    background: null,
    class: [{ name: `[[${opts.cls}]]`, level: opts.level, subclass: null, choices: {} }],
    abilities: { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 10 },
    ability_method: "manual",
    skills: { proficient: [], expertise: [] },
    spells: { known: [], overrides: [] },
    equipment: weapons.map(w => ({ item: `[[${w.slug as string}]]`, equipped: true })),
    overrides: opts.suppressTools ? { tools: { remove: opts.suppressTools } } : {},
    state: { hp: { current: 8, max: 8, temp: 0 }, hit_dice: {}, spell_slots: {}, concentration: null, conditions: [] },
  } as unknown as Character;

  const result = new PCResolver(registry).resolve(character);
  if (result.warnings.length > 0) {
    throw new Error(`resolver warnings (a slug missed the registry): ${result.warnings.join(" | ")}`);
  }
  return { resolved: result.character, registry };
}

/** The real engine's derived output for a minimal PC. */
function derivedFor(opts: ChainOpts): DerivedStats {
  const { resolved, registry } = resolveFor(opts);
  return recalc(resolved, registry);
}

/** The real engine's DISPLAY aggregate for a minimal PC. */
function aggregateFor(opts: ChainOpts): ProficiencyAggregate {
  return aggregateProficiencies(resolveFor(opts).resolved);
}

const ROGUE = "srd-5e_class_rogue";

describe("authored-grant chain: overlay YAML to the sheet (R4-P4 task 13)", () => {
  // Rogue is proficient with `simple` weapons plus four martial FIXED names
  // (hand crossbows, longswords, rapiers, shortswords). BATTLEAXE is
  // martial-melee and on none of those lists, so `proficient: true` can only
  // have come from Dwarven Combat Training. Handaxe and light hammer are
  // `simple-ranged` in `weapon.2014.json` · asserting on either would pass
  // vacuously off the class's `simple` category with the trait deleted.
  it("a Dwarf's authored weapon grant reaches a PROFICIENT attack row", () => {
    const d = derivedFor({
      race: "srd-5e_race_dwarf", cls: ROGUE, level: 1, equipped: ["battleaxe"],
    });
    const row = d.attacks.find(a => a.name === "Battleaxe");
    expect(row).toBeDefined();
    expect(row!.proficient).toBe(true);

    // The control that makes the row above mean something: the same Rogue with a
    // non-Dwarf species is NOT proficient with the same weapon.
    const control = derivedFor({
      race: "srd-5e_race_elf", cls: ROGUE, level: 1, equipped: ["battleaxe"],
    });
    expect(control.attacks.find(a => a.name === "Battleaxe")!.proficient).toBe(false);
  });

  // BASE Elf (`srd-5e_race_elf`), never High Elf: `subspecies_of` has zero
  // readers, so a subrace resolves only its own traits and carries no Keen
  // Senses. Verifying on High Elf would read as a defect where there is none.
  it("the Elf skill arm reaches passive Perception", () => {
    const d = derivedFor({ race: "srd-5e_race_elf", cls: ROGUE, level: 1 });
    expect(d.skills.perception.proficiency).toBe("proficient");
    // 10 + wis mod (+1 at 12) + proficiency bonus (+2 at level 1) = 13.
    expect(d.passives.perception).toBe(13);

    const control = derivedFor({ race: "srd-5e_race_dwarf", cls: ROGUE, level: 1 });
    expect(control.skills.perception.proficiency).toBe("none");
    expect(control.passives.perception).toBe(11);
  });

  // The chip's source line names the SPECIES ("Rock Gnome"), not the trait
  // ("Tinker") · R4-P3c's binding user ruling.
  it("the Rock Gnome tool arm yields a chip sourced by SPECIES name, and it is suppressible", () => {
    const agg = aggregateFor({ race: "srd-5e_race_rock-gnome", cls: ROGUE, level: 1 });
    expect(agg.tools).toContainEqual(expect.objectContaining({
      value: "tinker's-tools", sources: ["Rock Gnome"], origin: "grant",
    }));

    const suppressed = aggregateFor({
      race: "srd-5e_race_rock-gnome", cls: ROGUE, level: 1, suppressTools: ["tinker's-tools"],
    });
    expect(suppressed.tools.map(t => t.value)).not.toContain("tinker's-tools");
  });
});
