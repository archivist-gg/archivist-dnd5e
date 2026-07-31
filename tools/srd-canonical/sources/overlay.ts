import * as fs from "node:fs";
import * as yaml from "js-yaml";
import { overlaySchema, type Overlay } from "../overlay.schema";

export function loadOverlay(filePath: string): Promise<Overlay> {
  if (!fs.existsSync(filePath)) {
    return Promise.reject(new Error(`Overlay not found: ${filePath}`));
  }
  // No options, deliberately. js-yaml's DEFAULT loader THROWS "duplicated
  // mapping key" on a repeated map key, which is the guard we want against
  // copy-paste key collisions in the overlays. `json: true` is the
  // JSON.parse-compatibility flag and does the OPPOSITE: it DISABLES that check
  // and silently keeps the LAST value. Measured on the pinned js-yaml 4.3.0,
  // `state.json` is read in exactly one place, the duplicate-key guard itself
  // (dist/js-yaml.js:1306), so the flag has no other effect at all.
  //
  // This call did pass `{ json: true }`, under a comment asserting the reverse.
  // That falsehood propagated into two downstream design documents before it
  // was measured, so it is spelled out here: do NOT re-add the flag. Note also
  // that `safeLoad` does not exist in js-yaml 4.x · `load` IS the safe loader.
  const raw = yaml.load(fs.readFileSync(filePath, "utf8"));
  const result = overlaySchema.safeParse(raw);
  if (!result.success) {
    return Promise.reject(new Error(`Overlay schema validation failed for ${filePath}:\n${result.error.message}`));
  }
  return Promise.resolve(result.data);
}
