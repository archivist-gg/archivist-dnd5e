/**
 * Validates the hand-authored SRD overlays through the real loader + Zod
 * schema, without running the full canonical build. Exits nonzero if either
 * overlay fails schema validation or authors a `class_features` key that
 * resolves to no emitted feature.
 *
 * Run: npx tsx tools/srd-canonical/validate-overlays.ts   (from the dnd5e repo root)
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadOverlay } from "./sources/overlay";
import { slugifyName } from "./sources/slug-normalize";
import {
  applyNameFixes,
  CLASS_FEATURE_TYPES_EMITTED,
  SUBCLASS_FEATURE_TYPES_EMITTED,
} from "./merger-rules/class-merge";

// ESM, like config.ts: this file is loaded as a module (package.json "type": "module"), so
// `__dirname` is not defined and every run threw a ReferenceError before it read a single overlay.
// Found and fixed at R4-G7 T5, when the step that authors the overlays asked for this check.
const here = path.dirname(fileURLToPath(import.meta.url));
// OVERLAY_DIR mirrors config.ts, so a mutation control can validate a scratch copy without touching the shipped
// overlays. Unset in every normal run.
const overlayDir = process.env.OVERLAY_DIR ? path.resolve(process.env.OVERLAY_DIR) : path.join(here, "overlays");
const cacheDir = path.join(here, ".cache", "open5e");
const FILES: Array<{ file: string; edition: "2014" | "2024" }> = [
  { file: "srd-5e.yaml", edition: "2014" },
  { file: "srd-2024.yaml", edition: "2024" },
];

interface CachedFeature { name: string; feature_type: string }
interface CachedEntry { name: string; subclass_of?: unknown; features?: CachedFeature[] }

/**
 * Every `class_features` overlay key that COULD land on an emitted feature, for one edition.
 *
 * `lookupFeatureOverlay` tries `<owner>:<feature-slug>` first and the bare `<feature-slug>` second, so both forms
 * are resolvable and both are collected. The owner is the vendor-free bare slug of the document, which for a class
 * and for a subclass alike is `slugifyName(entry.name)` (the canonical slug is
 * `<prefix>_<type>_<slugifyName(name)>` and `bareSlug` returns its last component).
 *
 * Three details make this the REAL emitted set rather than an approximation of it, and each is read from the
 * merger rather than re-typed here:
 *   - the kept `feature_type`s differ by document kind (`CLASS_FEATURE_TYPES_EMITTED` vs the narrower
 *     `SUBCLASS_FEATURE_TYPES_EMITTED`), so `subclass_of` decides which set applies;
 *   - the 2024 NAME normaliser runs FIRST, exactly as `toClassCanonical` runs it, so a key must be spelled
 *     against the CORRECTED name (`monk:unarmored-movement`, never the upstream `monk:unarmoed-movement`);
 *   - the slug is `slugifyName(name)`, the same derivation `bucketFeaturesByLevel` uses for `id`.
 */
export function resolvableFeatureKeys(edition: "2014" | "2024", dir: string = cacheDir): Set<string> {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, `classes.${edition}.json`), "utf8")) as
    { results?: CachedEntry[] } | CachedEntry[];
  const entries = Array.isArray(raw) ? raw : (raw.results ?? []);
  const out = new Set<string>();
  for (const entry of entries) {
    const owner = slugifyName(entry.name);
    const kept = entry.subclass_of ? SUBCLASS_FEATURE_TYPES_EMITTED : CLASS_FEATURE_TYPES_EMITTED;
    for (const f of applyNameFixes((entry.features ?? []) as never, edition) as unknown as CachedFeature[]) {
      if (!kept.has(f.feature_type)) continue;
      const slug = slugifyName(f.name);
      out.add(slug);
      out.add(`${owner}:${slug}`);
    }
  }
  return out;
}

/**
 * The `class_features` keys that author NOTHING (R4-G7 T5 fix round 1).
 *
 * `.strict()` closed unknown FIELDS on an overlay entry; it cannot see an unknown KEY, because the key namespace is
 * open by construction. A misspelled one parses clean, validates clean, and is silently never looked up · which is
 * precisely the §8.1 item 3 failure mode (`monk:unarmoed-movement` was the live spelling until this task's
 * normaliser corrected the upstream name, and nothing would have told us if the overlay had kept it).
 */
export function unresolvedClassFeatureKeys(
  overlay: { class_features?: Record<string, unknown> },
  edition: "2014" | "2024",
  dir: string = cacheDir,
): string[] {
  const resolvable = resolvableFeatureKeys(edition, dir);
  return Object.keys(overlay.class_features ?? {}).filter((key) => !resolvable.has(key));
}

/**
 * The `spells:` keys that author NOTHING: a key is a BARE spell slug (`slugifyName(name)`, the lookup
 * `toSpellCanonical` makes), and one that names no spell in the edition's Open5e cache is never read.
 */
export function unresolvedSpellKeys(
  overlay: { spells?: Record<string, unknown> },
  edition: "2014" | "2024",
  dir: string = cacheDir,
): string[] {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, `spells.${edition}.json`), "utf8")) as
    { results?: Array<{ name: string }> } | Array<{ name: string }>;
  const names = new Set((Array.isArray(raw) ? raw : (raw.results ?? [])).map((s) => slugifyName(s.name)));
  return Object.keys(overlay.spells ?? {}).filter((key) => !names.has(key));
}

async function main(): Promise<void> {
  let failed = false;

  for (const { file, edition } of FILES) {
    const filePath = path.join(overlayDir, file);
    try {
      const overlay = await loadOverlay(filePath);
      const classFeatures = Object.keys(overlay.class_features ?? {}).length;
      const classes = Object.keys(overlay.classes ?? {}).length;
      const raceTraits = Object.keys(overlay.race_traits ?? {}).length;
      const unresolved = unresolvedClassFeatureKeys(overlay, edition);
      if (unresolved.length > 0) {
        failed = true;
        console.error(
          `FAIL ${file}: ${unresolved.length} class_features key(s) match no emitted feature and author nothing:\n` +
          unresolved.map((k) => `  - ${k}`).join("\n"),
        );
        continue;
      }
      const unresolvedSpells = unresolvedSpellKeys(overlay, edition);
      if (unresolvedSpells.length > 0) {
        failed = true;
        console.error(
          `FAIL ${file}: ${unresolvedSpells.length} spells key(s) name no spell and author nothing:\n` +
          unresolvedSpells.map((k) => `  - ${k}`).join("\n"),
        );
        continue;
      }
      console.log(
        `OK  ${file}: ${classFeatures} class-feature, ${classes} class, ${raceTraits} race-trait entries` +
        ` (every class-feature key resolves to an emitted feature)`,
      );
    } catch (err) {
      failed = true;
      console.error(`FAIL ${file}:\n${(err as Error).message}`);
    }
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log("All overlays valid.");
}

// Only run when EXECUTED, so the two checks above can be imported by a test without validating anything.
if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
