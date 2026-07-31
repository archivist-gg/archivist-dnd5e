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
  // and silently keeps the LAST value. Measured on the pinned js-yaml 4.3.0:
  // `state.json` is read in exactly ONE place, the duplicate-key branch itself,
  // so the flag has no other effect at all. That holds in every artifact the
  // package ships, and the one that matters here is the ESM bundle: dnd5e is
  // `"type": "module"`, so `import "js-yaml"` resolves dist/js-yaml.mjs, NOT
  // the CJS bundle an earlier version of this comment cited.
  //
  // Deliberately NO file:line · a bare pointer is precisely what went stale the
  // last time this was written down. Re-derive at source level in
  // node_modules/js-yaml/lib/loader.js, the only unbundled artifact: a single
  // `state.json`, inside the duplicate-key branch. (The dist bundles are built
  // from that file. js-yaml.min.js mangles `state`, so it has zero textual
  // `state.json` hits · grep it for "duplicated mapping key" instead.)
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
