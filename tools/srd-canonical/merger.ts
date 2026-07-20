import type { Open5eEntry } from "./sources/open-srd";
import type { StructuredEntry } from "./sources/structured-rules";
import type { ActivationEntry } from "./sources/activation";
import type { Overlay } from "./overlay.schema";
import { slugifyName } from "./sources/slug-normalize";

/**
 * Compendium-name prefix for the canonical slug. Slugs are
 * `<prefix>_<entity_type>_<slugifyName(entity.name)>` so they are globally
 * unique across compendiums AND across entity types (registry treats slug as
 * a global key). The type token prevents same-name cross-type collisions
 * (e.g. armor "Shield" vs the "Shield" spell).
 */
export const COMPENDIUM_PREFIX_BY_EDITION: Record<"2014" | "2024", string> = {
  "2014": "srd-5e",
  "2024": "srd-2024",
};

/**
 * Build the canonical, type-namespaced slug for an entity.
 *
 * `entityType` MUST be the singular canonical type token (`OPEN5E_KIND_TO_ENTITY`
 * in index.ts, e.g. `armor|weapon|item|spell|monster|class|subclass|background|
 * race|feat|optional-feature|condition`) — the SAME value the MD writer emits
 * to frontmatter `entity_type`. This keeps the invariant slug-type-token ===
 * entity_type. `slugifyName` maps every non-alnum run (incl. `_`) to `-`, so
 * the name portion can never contain the `_` delimiter.
 */
export function buildCanonicalSlug(
  edition: "2014" | "2024",
  entityType: string,
  name: string,
): string {
  return `${COMPENDIUM_PREFIX_BY_EDITION[edition]}_${entityType}_${slugifyName(name)}`;
}

export interface CanonicalEntry {
  slug: string;
  edition: "2014" | "2024";
  kind: string;
  /** Base layer (Open5e). */
  base: Open5eEntry;
  /** Enrichment layer (structured rules). */
  structured: StructuredEntry | null;
  /** Activation layer (foundry). */
  activation: ActivationEntry | null;
  /** Overlay layer (per-kind specific subset). May be null when overlay has no entry for this slug. */
  overlay: unknown;
}

export interface MergeInputs {
  edition: "2014" | "2024";
  kind: string;
  /**
   * Singular canonical entity-type token (= OPEN5E_KIND_TO_ENTITY[kind], or the
   * literal per-callsite type such as "subclass"). Threaded into the slug so the
   * emitted slug's type-token === the emitted `entity_type`. Distinct from
   * `kind`, which stays the (often plural) Open5e collection name used for I/O
   * paths and structured joins.
   */
  entityKind: string;
  open5e: Open5eEntry[];
  structured: StructuredEntry[];
  activation: Map<string, ActivationEntry>;
  overlay: Overlay;
}

export interface MergeRule {
  kind: string;
  /** Pluck overlay subset for this kind. Returns null when no overlay applies. */
  pickOverlay(overlay: Overlay, slug: string): unknown;
}

export function mergeKind(rule: MergeRule, inputs: MergeInputs): CanonicalEntry[] {
  // Structured-rules entries are name-keyed (no Open5e document prefix), so we
  // index them by the bare slug derived from the entry name and look them up
  // by the bare slug derived from the Open5e entry name. This decouples the
  // structured join from the Open5e key shape (which carries an `srd_` /
  // `srd-2024_` document prefix) and makes the join work whether the upstream
  // key is bare or prefixed.
  const structuredBySlug = new Map<string, StructuredEntry>();
  for (const e of inputs.structured) {
    const slug = (e as { slug?: string; name: string }).slug
      ?? slugifyName(e.name);
    structuredBySlug.set(slug, e);
  }
  return inputs.open5e.map((base): CanonicalEntry => ({
    slug: buildCanonicalSlug(inputs.edition, inputs.entityKind, base.name),
    edition: inputs.edition,
    kind: inputs.kind,
    base,
    structured: structuredBySlug.get(slugifyName(base.name)) ?? null,
    activation: inputs.activation.get(base.key) ?? null,
    overlay: rule.pickOverlay(inputs.overlay, base.key),
  }));
}
