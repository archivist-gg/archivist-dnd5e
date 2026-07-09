// Scratch-consumer smoke surface — proves the PACKED @archivist/{core,dnd5e}
// tarballs resolve, type-check (bundler + node16), and RUN as real npm packages
// from a throwaway consumer with NO sibling checkouts. Every import is THROUGH
// the package name (never a relative path into a repo), so this file only compiles
// / runs if npm's package-name -> dist resolution + the shipped .d.ts are correct.
//
// Rightsized (Gate-2): parse + subpath-callability + SRD-data inlining, NOT a full
// resolve->recalc (that needs a fully-populated EntityRegistry — the SrdStore->
// EntityRegistry bridge is absent from the packages; domain-sufficiency is already
// proven in-repo by the 3C-R renderer-sufficiency smoke).

// --- barrel imports (index.d.ts + dist/index.js reach) ---
import { EntityRegistry } from "@archivist/core";                    // core barrel export
import { SrdStore } from "@archivist/dnd5e";                         // dnd5e barrel re-export (export * from "./srd-store")

// --- subpath imports (each pulls a subpath .d.ts into the node16 program) ---
import { parsePC } from "@archivist/dnd5e/pc/pc.parser";
import { PCResolver } from "@archivist/dnd5e/pc/pc.resolver";
import { recalc } from "@archivist/dnd5e/pc/pc.recalc";
import { classSpellCandidates } from "@archivist/dnd5e/spell/spell.access"; // real pure fn from a deep subpath

// --- side-effect imports: reach MORE subpath .d.ts (node16 checks only files IN the program) ---
import "@archivist/dnd5e/item/item.actions-map";
import "@archivist/dnd5e/entities/base-item-resolver";
import "@archivist/dnd5e/schemas/feature-schema";                    // force a schema .d.ts into the program

// Smallest known-valid hand-authored PC (canonical zero-obsidian example, copied
// verbatim from tests/renderer-sufficiency.smoke.test.ts CHARACTER_YAML). parsePC
// validates YAML shape only — no registry needed for parse.
const MIN_PC = `
name: Smoke Test Hero
edition: "2014"
race: dark-elf
background: sage
ability_method: standard-array
class:
  - name: wizard
    level: 4
    subclass: bladesinger
    choices:
      4:
        feat: elemental-ward
  - name: warlock
    level: 3
abilities: { str: 14, dex: 12, con: 14, int: 16, wis: 10, cha: 14 }
skills: { proficient: [arcana, investigation], expertise: [] }
spells: { known: [mage-armor], overrides: [] }
equipment:
  - { item: club, equipped: true, slot: mainhand }
  - { item: plate, equipped: true, slot: armor }
  - { item: shield, equipped: true, slot: shield }
  - { item: bracers-of-defense, equipped: true, attuned: true }
currency: { cp: 0, sp: 3, ep: 0, gp: 25, pp: 0 }
state:
  hp: { current: 20, max: 32, temp: 0 }
  hit_dice: {}
  spell_slots: { "1": { used: 1, total: 3 } }
  conditions: []
  exhaustion: 0
  feature_uses: {}
`;

// (a) SRD-data inlining proof — loadFromBundledJson is a NO-ARG SrdStore METHOD.
// If esbuild had NOT inlined the bundled .json/.md SRD into dist, count() === 0.
const srd = new SrdStore();
srd.loadFromBundledJson();
if (srd.count() === 0) throw new Error("SRD data not inlined into the packed dist");

// (b) parse proof — real ParseResult<Character> shape {success,data,error}; proves
// /pc/pc.parser resolves package-name -> dist and executes.
const parsed = parsePC(MIN_PC);
if (!parsed.success) throw new Error("parsePC failed: " + parsed.error);
if (typeof parsed.data.name !== "string") throw new Error("parsed PC missing name");

// (c) subpath-callability proof — every deep export resolves to dist and is callable
// (typeof only — no heavy EntityRegistry population needed for this smoke).
for (const [n, f] of Object.entries({ PCResolver, recalc, EntityRegistry, classSpellCandidates })) {
  if (typeof f !== "function") throw new Error(n + " not callable from package");
}

console.log(`runtime smoke OK (SRD entities inlined: ${srd.count()}; parsed: ${parsed.data.name})`);
