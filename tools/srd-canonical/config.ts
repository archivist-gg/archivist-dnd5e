import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CanonicalBuildConfig {
  /** Where to fetch Open5e (HTTP or use cached files). */
  open5eApi: string;
  open5eCacheDir: string;

  /** Path to the local structured-rules data dump root.
   *  Read from STRUCTURED_RULES_PATH env var; no default. */
  structuredRulesPath: string;

  /** Path to overlay YAML files (per edition). OVERLAY_DIR overrides it (mutation controls). */
  overlayDir: string;

  /** Output roots. */
  canonicalOutDir: string;       // committed canonical JSON
  runtimeOutDir: string;         // committed slim runtime JSON
  bundleOutDir: string;          // .compendium-bundle/ — copied to user vault on install

  /** Edition flag — both means run twice in sequence. */
  editions: ("2014" | "2024")[];

  /** When true, ignore Open5e disk cache and refetch. */
  refreshOpen5e: boolean;
}

export function loadConfig(): CanonicalBuildConfig {
  const args = process.argv.slice(2);
  const has = (flag: string) => args.includes(flag);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const editionArg = get("--edition");
  const editions: ("2014" | "2024")[] =
    editionArg === "2014" ? ["2014"] :
    editionArg === "2024" ? ["2024"] :
    ["2014", "2024"];

  const structuredRulesPath = process.env.STRUCTURED_RULES_PATH;
  if (!structuredRulesPath) {
    throw new Error(
      "STRUCTURED_RULES_PATH env var is required. " +
      "Set it to the external structured-rules data dump root (e.g. /path/to/structured-rules/data)."
    );
  }

  // __dirname = archivist-dnd5e/tools/srd-canonical
  const dnd5ePkg = path.resolve(__dirname, "..", "..");             // archivist-dnd5e
  // The vault bundle lives in the SIBLING obsidian plugin repo (post repo-split).
  // BUNDLE_OUT_DIR env overrides the default sibling-plugin location.
  const bundleOutDir = process.env.BUNDLE_OUT_DIR
    ? path.resolve(process.env.BUNDLE_OUT_DIR)
    : path.resolve(dnd5ePkg, "..", "archivist-obsidian", ".compendium-bundle");
  // CANONICAL_OUT_DIR / RUNTIME_OUT_DIR mirror BUNDLE_OUT_DIR above, and exist for the same reason
  // it does: so a build can be pointed somewhere that is not the tracked tree. Added at R4-G7 T5,
  // where a mutation control has to re-run the WHOLE generator against a deliberately broken overlay
  // and compare the output · with only BUNDLE_OUT_DIR overridable that run would rewrite
  // `src/srd/data/` in place, which is the one thing a mutant must never do.
  return {
    open5eApi: "https://api.open5e.com/v2",
    open5eCacheDir: path.join(__dirname, ".cache", "open5e"),
    structuredRulesPath,
    overlayDir: process.env.OVERLAY_DIR ? path.resolve(process.env.OVERLAY_DIR) : path.join(__dirname, "overlays"),
    // Canonical + runtime SRD JSON live inside the dnd5e package.
    canonicalOutDir: process.env.CANONICAL_OUT_DIR
      ? path.resolve(process.env.CANONICAL_OUT_DIR)
      : path.join(dnd5ePkg, "src", "srd", "data", "canonical"),
    runtimeOutDir: process.env.RUNTIME_OUT_DIR
      ? path.resolve(process.env.RUNTIME_OUT_DIR)
      : path.join(dnd5ePkg, "src", "srd", "data", "runtime"),
    bundleOutDir,
    editions,
    refreshOpen5e: has("--refresh-open5e"),
  };
}
