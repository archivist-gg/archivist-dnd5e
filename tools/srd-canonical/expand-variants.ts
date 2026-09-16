import { buildCanonicalSlug } from "./merger";

/**
 * A base item eligible for variant expansion. The 5etools `magicvariants`
 * data targets bases by a mix of flag fields (`weapon`, `sword`, `axe`,
 * `armor`, `shield`, `arrow`, `bolt`), the short type code (`M`, `R`,
 * `HA`, `MA`, `LA`, `S`, `A`, `AF`), the `weaponCategory` (`simple` /
 * `martial`), and explicit `name`+`source` pairs. The optional fields
 * here mirror those columns from `items-base.json`.
 */
export interface BaseItem {
  name: string;
  slug: string;
  base_item_type: "weapon" | "armor" | "shield";
  /** 5etools short type code (e.g. "M", "R", "HA", "MA", "LA", "S", "A"). */
  type?: string;
  /** 5etools source code (e.g. "PHB", "XPHB"). */
  source?: string;
  weaponCategory?: string;
  weapon?: boolean;
  armor?: boolean;
  shield?: boolean;
  sword?: boolean;
  axe?: boolean;
  arrow?: boolean;
  bolt?: boolean;
  dmgType?: string;
  [key: string]: unknown;
}

export interface VariantRule {
  name: string;
  type?: string;
  requires?: Array<Record<string, unknown>>;
  inherits?: Record<string, unknown>;
}

export interface ExpandedItem {
  slug: string;
  name: string;
  edition: "2014" | "2024";
  source: string;
  type: string;
  rarity?: string;
  tier?: "major" | "minor";
  base_item: string;
  bonuses?: { weapon_attack?: number; weapon_damage?: number; ac?: number };
  attunement: { required: boolean };
  description: string;
  weight?: number;
}

/**
 * One shared prose template from the structured-rules dump's `itemEntry` table, keyed by name
 * and source. A variant whose `inherits.entries` is a `{#itemEntry Name|SOURCE}` pointer carries
 * NO prose of its own: the pointer IS the whole description, and upstream replaces it with this
 * template's `entriesTemplate` filled from the referencing variant's own fields.
 */
export interface ItemEntryTemplate {
  name: string;
  source: string;
  entriesTemplate: unknown[];
}

/** A pointer with no `|SOURCE` resolves against the 2014 source, which is where the bare form lives. */
const DEFAULT_ITEM_ENTRY_SOURCE = "DMG";

const STANDALONE_POINTER = /^\{#itemEntry\s+([^{}]*)\}$/;
const MUSTACHE_SLOT = /\{\{([^{}]*)\}\}/g;

/**
 * An editorial aside written by the structured-rules dump's own contributors, not SRD text.
 * Upstream writes them as a standalone `{@note …}` element of `entries`, and every one of the
 * shipped occurrences has that shape. It is dropped HERE, as a whole element, rather than in the
 * emit sanitiser, because the markdown writer's cross-reference pass mangles the aside's nested
 * `{@link …|url}` into a half-literal that no later pass can key on: leave it to the backstop
 * and 37 of the 45 shipped copies survive.
 */
function isEditorialNote(entry: unknown): boolean {
  return typeof entry === "string" && /^\{@note\b/.test(entry.trim());
}

/** Upstream's `getFullImmRes` join: one verbatim, two with "and", three or more with an Oxford comma. */
function formatImmResList(values: readonly string[]): string {
  if (values.length === 1) return values[0];
  const separator = values.length > 2 ? ", " : " ";
  return `${values.slice(0, -1).join(separator)}${separator}and ${values[values.length - 1]}`;
}

function resistWords(inherits: Record<string, unknown>): string[] | null {
  const value = inherits.resist;
  if (!Array.isArray(value) || value.length === 0) return null;
  if (!value.every((v): v is string => typeof v === "string")) return null;
  return value;
}

/**
 * Fill the four mustache slots the shared templates use from the REFERENCING variant's own
 * `inherits`. Returns null when any slot cannot be filled, so the caller can leave the pointer
 * standing and warn rather than emit a half-written sentence.
 */
function fillTemplateSlots(text: string, inherits: Record<string, unknown>): string | null {
  let failed = false;
  const filled = text.replace(MUSTACHE_SLOT, (_m, body: string) => {
    const key = body.trim();
    if (key === "item.resist" || key === "getFullImmRes item.resist") {
      const words = resistWords(inherits);
      if (!words) { failed = true; return ""; }
      return key === "item.resist" ? words[0] : formatImmResList(words);
    }
    if (key === "item.detail1" || key === "item.detail2") {
      const detail = inherits[key.slice("item.".length)];
      if (typeof detail !== "string" || detail === "") { failed = true; return ""; }
      return detail;
    }
    failed = true;
    return "";
  });
  return failed ? null : filled;
}

/**
 * Replace each standalone `{#itemEntry …}` pointer in `entries` with the referenced template's
 * own text, filled from `inherits`. Never invents prose: a pointer that cannot be resolved is
 * left exactly as it is and reported, and the emit sanitiser then strips it rather than shipping
 * a template directive as a description.
 */
function resolveItemEntryPointers(
  entries: unknown[],
  inherits: Record<string, unknown>,
  templates: readonly ItemEntryTemplate[],
  where: string,
): unknown[] {
  if (!entries.some(e => typeof e === "string" && e.includes("{#itemEntry"))) return entries;
  const out: unknown[] = [];
  for (const entry of entries) {
    const match = typeof entry === "string" ? STANDALONE_POINTER.exec(entry.trim()) : null;
    if (!match) {
      out.push(entry);
      continue;
    }
    const parts = match[1].split("|");
    const name = parts[0].trim();
    const source = parts.length >= 2 && parts[1].trim() !== "" ? parts[1].trim() : DEFAULT_ITEM_ENTRY_SOURCE;
    const template = templates.find(
      t => t.name.toLowerCase() === name.toLowerCase() && t.source.toLowerCase() === source.toLowerCase(),
    );
    const nodes = template?.entriesTemplate;
    if (!Array.isArray(nodes) || nodes.length === 0) {
      console.warn(`[expand-variants] ${where}: no itemEntry template "${name}|${source}"; pointer left unresolved`);
      out.push(entry);
      continue;
    }
    let ok = true;
    const filled: unknown[] = [];
    for (const node of nodes) {
      if (typeof node !== "string") { filled.push(node); continue; }
      const text = fillTemplateSlots(node, inherits);
      if (text === null) { ok = false; break; }
      filled.push(text);
    }
    if (!ok) {
      console.warn(`[expand-variants] ${where}: itemEntry template "${name}|${source}" has a slot this variant cannot fill; pointer left unresolved`);
      out.push(entry);
      continue;
    }
    out.push(...filled);
  }
  return out;
}

export function expandVariants(
  baseItems: BaseItem[],
  variants: VariantRule[],
  edition: "2014" | "2024",
  itemEntryTemplates: readonly ItemEntryTemplate[] = [],
): ExpandedItem[] {
  const out: ExpandedItem[] = [];
  for (const variant of variants) {
    const matchingBases = pickMatchingBases(baseItems, variant);
    for (const base of matchingBases) {
      out.push(applyVariantToBase(variant, base, edition, itemEntryTemplates));
    }
  }
  return out;
}

/**
 * Test whether a single `requires` clause matches a base item. A clause is
 * an object with one or more flag/value entries; ALL entries must match
 * (logical AND within a clause). The list of clauses is OR'd by the caller.
 */
function clauseMatches(req: Record<string, unknown>, b: BaseItem): boolean {
  for (const [k, v] of Object.entries(req)) {
    switch (k) {
      case "baseItem": {
        if (typeof v !== "string") return false;
        const reqSlug = v.split("|")[0];
        if (b.slug !== reqSlug) return false;
        break;
      }
      case "name": {
        if (typeof v !== "string" || b.name !== v) return false;
        break;
      }
      case "source": {
        if (typeof v !== "string" || (b.source !== undefined && b.source !== v)) return false;
        break;
      }
      case "type": {
        // 5etools type codes can carry a source suffix ("M|XPHB"); strip it.
        if (typeof v !== "string") return false;
        const reqType = v.split("|")[0];
        const baseType = (b.type ?? "").split("|")[0];
        if (baseType !== reqType) return false;
        break;
      }
      case "weaponCategory": {
        if (typeof v !== "string" || b.weaponCategory !== v) return false;
        break;
      }
      case "weapon":
        if (!truthy(v) || b.base_item_type !== "weapon") return false;
        break;
      case "armor":
        if (!truthy(v) || b.base_item_type !== "armor") return false;
        break;
      case "shield":
        if (!truthy(v) || b.base_item_type !== "shield") return false;
        break;
      case "sword":
      case "axe":
      case "arrow":
      case "bolt":
        if (!truthy(v) || b[k] !== true) return false;
        break;
      case "dmgType":
        if (typeof v !== "string" || b.dmgType !== v) return false;
        break;
      default:
        // Unknown key — treat as no-match to avoid over-expanding into
        // requirements we don't yet model (e.g. firearm, tattoo).
        return false;
    }
  }
  return true;
}

function truthy(v: unknown): boolean {
  return v === true || v === "true";
}

function pickMatchingBases(baseItems: BaseItem[], variant: VariantRule): BaseItem[] {
  if (!variant.requires || variant.requires.length === 0) return baseItems;
  // Each entry in `requires` is an OR'd alternative; a base matches if any clause matches.
  return baseItems.filter(b => variant.requires!.some(req => clauseMatches(req, b)));
}

function bonusNumber(field: unknown): number {
  if (typeof field === "number") return field;
  if (typeof field === "string") return Number(field.replace("+", "")) || 0;
  return 0;
}

function compendiumLabel(edition: "2014" | "2024"): string {
  return edition === "2014" ? "SRD 5e" : "SRD 2024";
}

function baseSubfolder(b: BaseItem): "Weapons" | "Armor" {
  // Shields use the Armor folder in our bundle.
  return b.base_item_type === "weapon" ? "Weapons" : "Armor";
}

/**
 * Build the expanded entry's `name`. Prefer the variant's explicit
 * `inherits.namePrefix` (e.g. "+1 ", "Frost Brand "); otherwise fall
 * back to a "+N" suffix derived from `bonusWeapon`/`bonusAc`.
 */
function expandedName(variant: VariantRule, base: BaseItem): string {
  const inherits = variant.inherits ?? {};
  const namePrefix = inherits.namePrefix;
  if (typeof namePrefix === "string" && namePrefix.length > 0) {
    // `namePrefix` strings already end with a trailing space ("+1 ", "Frost Brand ").
    if (namePrefix.startsWith("+")) {
      // "+N " patterns are written as suffix in our naming convention:
      // "Longsword +1" rather than "+1 Longsword".
      return `${base.name} ${namePrefix.trim()}`;
    }
    return `${namePrefix}${base.name}`;
  }
  const bWeapon = bonusNumber(inherits.bonusWeapon);
  const bAc = bonusNumber(inherits.bonusAc);
  const bonus = bWeapon || bAc;
  if (bonus > 0) return `${base.name} +${bonus}`;
  // No prefix/bonus signal — fall back to comma-suffix using variant name.
  return `${base.name}, ${variant.name}`;
}

function applyVariantToBase(
  variant: VariantRule,
  base: BaseItem,
  edition: "2014" | "2024",
  itemEntryTemplates: readonly ItemEntryTemplate[] = [],
): ExpandedItem {
  const inherits = variant.inherits ?? {};
  const compendium = compendiumLabel(edition);
  const subfolder = baseSubfolder(base);
  const name = expandedName(variant, base);

  const bWeapon = bonusNumber(inherits.bonusWeapon);
  const bAc = bonusNumber(inherits.bonusAc);
  let bonuses: ExpandedItem["bonuses"] | undefined;
  if (bWeapon > 0) {
    bonuses = bonuses ?? {};
    bonuses.weapon_attack = bWeapon;
    bonuses.weapon_damage = bWeapon;
  }
  if (bAc > 0) {
    bonuses = bonuses ?? {};
    bonuses.ac = bAc;
  }

  const reqAttune = inherits.reqAttune === true || typeof inherits.reqAttune === "string";
  const rarity = typeof inherits.rarity === "string" ? inherits.rarity : undefined;
  const tier: "major" | "minor" | undefined = (() => {
    if (inherits.tier === "major" || inherits.tier === "minor") return inherits.tier;
    if (typeof inherits.tier === "number" && inherits.tier >= 1) return "major";
    if (typeof inherits.tier === "string") {
      const n = Number.parseInt(inherits.tier, 10);
      if (!Number.isNaN(n) && n >= 1) return "major";
    }
    return undefined;
  })();

  // Weight inherits from the base item (variant rules don't override weight).
  const weight = typeof base.weight === "number" ? base.weight : undefined;

  return {
    // Variants are always magic items → type token "item" (== entity_type).
    // (Previously emitted a BARE unprefixed slug — a pre-existing bug.)
    slug: buildCanonicalSlug(edition, "item", name),
    name,
    edition,
    source: edition === "2014" ? "SRD 5.1" : "SRD 5.2",
    type: base.base_item_type,
    rarity,
    tier,
    base_item: `[[${compendium}/${subfolder}/${base.name}]]`,
    ...(bonuses ? { bonuses } : {}),
    attunement: { required: reqAttune },
    description: buildDescription(variant, base, inherits, itemEntryTemplates),
    ...(weight !== undefined ? { weight } : {}),
  };
}

/**
 * Replace `{=fieldName}` template references in a string with the matching
 * `inherits[fieldName]` value. Optional `/format` suffixes (e.g. `{=name/u}`
 * for uppercase) are stripped — the raw value is substituted. References to
 * fields not present on `inherits` are left untouched so the surface bug is
 * still visible.
 */
function substituteTemplateVars(text: string, inherits: Record<string, unknown>): string {
  return text.replace(/\{=([^}/]+)(?:\/[^}]+)?\}/g, (match, rawKey: string) => {
    const key = rawKey.trim();
    const value = inherits[key];
    if (typeof value === "string" || typeof value === "number") return String(value);
    return match;
  });
}

function buildDescription(
  variant: VariantRule,
  base: BaseItem,
  inherits: Record<string, unknown>,
  itemEntryTemplates: readonly ItemEntryTemplate[] = [],
): string {
  const entries = inherits.entries;
  if (Array.isArray(entries)) {
    const where = `${variant.name} (${base.name})`;
    const resolved = resolveItemEntryPointers(entries as unknown[], inherits, itemEntryTemplates, where)
      .filter(e => !isEditorialNote(e));
    const text = resolved.filter((e): e is string => typeof e === "string").join("\n\n");
    if (text.length > 0) return substituteTemplateVars(text, inherits);
  }
  const bonusStr = (inherits.bonusWeapon ?? inherits.bonusAc ?? "") as string;
  if (bonusStr) {
    return `A magical version of the ${base.name.toLowerCase()} that grants its wielder a ${bonusStr} bonus.`;
  }
  return `A magical version of the ${base.name.toLowerCase()}: ${variant.name}.`;
}
