/**
 * Validates the hand-authored SRD overlays through the real loader + Zod
 * schema, without running the full canonical build. Exits nonzero if either
 * overlay fails schema validation.
 *
 * Run: npx tsx tools/srd-canonical/validate-overlays.ts   (from the dnd5e repo root)
 */
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadOverlay } from "./sources/overlay";

// ESM, like config.ts: this file is loaded as a module (package.json "type": "module"), so
// `__dirname` is not defined and every run threw a ReferenceError before it read a single overlay.
// Found and fixed at R4-G7 T5, when the step that authors the overlays asked for this check.
const overlayDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "overlays");
const FILES = ["srd-5e.yaml", "srd-2024.yaml"];

async function main(): Promise<void> {
  let failed = false;

  for (const file of FILES) {
    const filePath = path.join(overlayDir, file);
    try {
      const overlay = await loadOverlay(filePath);
      const classFeatures = Object.keys(overlay.class_features ?? {}).length;
      const classes = Object.keys(overlay.classes ?? {}).length;
      const raceTraits = Object.keys(overlay.race_traits ?? {}).length;
      console.log(
        `OK  ${file}: ${classFeatures} class-feature, ${classes} class, ${raceTraits} race-trait entries`,
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

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
