/**
 * THE EMIT SANITISER: the one place that guarantees no upstream-tool markup reaches a
 * shipped artifact, and that a later regeneration cannot reintroduce it.
 *
 * The canonical pipeline merges an Open5e SRD base layer with a structured-rules JSON dump
 * (see `README.md` and `config.ts`). The dump is a tooling format: its prose carries curly
 * reference tags (`{@damage 2d6}`, `{@variantrule Cover|XPHB|Total Cover}`), source-book
 * abbreviation suffixes on cross-references (`fireball|xphb`), template pointers
 * (`{#itemEntry Armor of Resistance|XDMG}`), third-party VTT database ids (`foundryId`), and
 * editorial asides written by the dump's own contributors (`{@note …}`). None of that is SRD
 * text and none of it may ship.
 *
 * Every emit path runs through here:
 *   - `index.ts` sanitises each canonical batch before `src/srd/data/canonical/*.json` and
 *     before `projectToRuntime` feeds `src/srd/data/runtime/*.json`;
 *   - `to-md.ts` sanitises AFTER `rewriteCrossRefs`, so the bundle keeps the vault wikilinks
 *     and backtick roll tags that pass already produces, and this one removes only what it
 *     leaves behind.
 *
 * Two rules live UPSTREAM of this module rather than in it, because they need data this
 * module does not have and must not re-read:
 *   - `{#itemEntry …}` is RESOLVED against the dump's own `itemEntry` template table in
 *     `expand-variants.ts` (the referenced entry's own text, never invented prose). The
 *     `{#itemEntry` rule below is the fail-closed backstop for anything that still arrives.
 *   - the `{@note …}` editorial aside is dropped as a whole `entries` element in
 *     `expand-variants.ts`, before the elements are joined into one description string. It has
 *     to be, because `rewriteCrossRefs` mangles the aside's nested `{@link …|url}` into a
 *     half-literal that no later pass could key on. The `note` rule below is that rule's
 *     backstop on the canonical / runtime paths, which never see `rewriteCrossRefs`.
 *
 * Pure. No I/O. Deterministic. A string with nothing to clean is returned by reference.
 */

/**
 * Source-book abbreviations the dump uses as a cross-reference suffix. A CLOSED list on
 * purpose: `classes.*.json` descriptions carry markdown tables whose cells are pipe-delimited,
 * and the bundle's own wikilinks are `[[target|display]]`. A general "strip everything after a
 * pipe" rule would eat both.
 */
const SOURCE_CODES = [
  "XPHB", "XDMG", "XMM", "XGE", "TCE", "SCAG", "VGM", "MTF", "FTD", "ERLW", "MPMM",
  "PHB", "DMG", "MM",
];

const SOURCE_ALT = SOURCE_CODES.join("|");

/**
 * A bare `Name|SOURCE|Display` residue: the upstream tag's braces are already gone (the SRD 5.2
 * creature text arrives from Open5e in exactly this shape), so there is no terminator telling a
 * pattern where `Display` ends. Deleting `Name|SOURCE|` is the correct rendering, because upstream
 * renders such a reference as its display text, and it is only correct when `Name` is known,
 * because `Name` cannot be recovered from the left context: "the Ooze Cube [Area of Effect]"
 * and "a 20-foot-radius Sphere [Area of Effect]" both end in a reference whose name is only the
 * last words, and "It has Cover" is all Title Case but only "Cover" is the name.
 *
 * Measured over the shipped tree: five names, 23 occurrences, all in SRD 5.2 creature prose.
 * The siblings of the same upstream family are listed alongside them so the common next case is
 * already covered. Anything not in this list falls to the two-part rule and prints a warning.
 */
const BARE_REFERENCE_NAMES = [
  "Sphere [Area of Effect]",
  "Cylinder [Area of Effect]",
  "Cube [Area of Effect]",
  "Cone [Area of Effect]",
  "Line [Area of Effect]",
  "Emanation [Area of Effect]",
  "Short Rest",
  "Long Rest",
  "Cover",
  "Concentration",
];

/** Object keys that never ship, whatever their value. */
const DROP_KEYS = new Set(["foundryId"]);

/** Escape a literal for use inside a RegExp source. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const BARE_REFERENCE_RES = BARE_REFERENCE_NAMES.map(
  name => new RegExp(`${escapeRe(name)}\\|(?:${SOURCE_ALT})\\|`, "gi"),
);

/**
 * Two-part suffix: `fireball|xphb` → `fireball`. The suffix must follow a word character, a
 * closing bracket or a closing parenthesis, and must not itself be followed by a letter or a
 * digit, so a markdown table cell (`| DMG |`, a space after the pipe) is never touched.
 */
const TWO_PART_SUFFIX = new RegExp(`(?<=[\\w\\)\\]])\\|(?:${SOURCE_ALT})(?![A-Za-z0-9])`, "gi");

/** Any surviving three-part residue, for the warning. */
const UNKNOWN_THREE_PART = new RegExp(`\\S*\\|(?:${SOURCE_ALT})\\|`, "gi");

/** A template pointer. Upstream replaces the whole element, so a partial match is still removed. */
const ITEM_ENTRY_POINTER = /\{#itemEntry[^{}]*\}/g;

/** One curly tag with no nested tag inside it. Applied to a fixpoint, so nesting resolves inner-first. */
const INNERMOST_TAG = /\{@([a-zA-Z0-9]+)(?:\s+([^{}]*))?\}/g;

const warned = new Set<string>();

function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[sanitize] ${message}`);
}

/**
 * The display text of a reference body. Upstream's reference form is
 * `name|SOURCE|display`; with no display it renders the name. A trailing `#anchor` on the name
 * is an upstream deep-link fragment and is not part of the name.
 */
function referenceDisplay(body: string): string {
  const parts = body.split("|");
  const chosen = parts.length >= 3 && parts[2].trim() !== "" ? parts[2] : parts[0];
  return chosen.split("#")[0].trim();
}

/**
 * Render one curly tag as the text a reader should see.
 *
 * The roll-bearing tags render to this project's own backtick inline-tag vocabulary rather than
 * to bare text, because that is EXACTLY what `src/dnd/prose-tags.convert5eToolsTags` produces
 * for them at render time today. Emitting the backtick form at build time therefore removes the
 * upstream markup from the shipped data without changing a single rendered pixel; unwrapping to
 * bare text would silently downgrade 193 rollable damage and dice chips to plain prose.
 */
function renderTag(tag: string, rawBody: string): string {
  const body = rawBody.trim();
  switch (tag.toLowerCase()) {
    // Editorial aside written by the dump's contributors. Never SRD text.
    case "note":
      return "";
    case "damage":
      return `\`damage:${body}\``;
    case "dice":
      return `\`roll:${body}\``;
    case "d20":
      return `\`roll:d20${body}\``;
    case "dc":
      return `\`dc:${body}\``;
    case "hit":
      return `\`atk:+${body}\``;
    case "h":
      return "Hit: ";
    case "recharge":
      return body === "" ? "(Recharge)" : `(Recharge ${body}-6)`;
    case "chance":
      return `${body}% chance`;
    case "b":
    case "bold":
    case "action":
    case "status":
    case "ability":
    case "feat":
    case "disease":
    case "hazard":
      return `**${referenceDisplay(body)}**`;
    case "i":
    case "italic":
    case "spell":
    case "book":
    case "adventure":
      return `_${referenceDisplay(body)}_`;
    case "s":
    case "strike":
      return `~~${referenceDisplay(body)}~~`;
    // `link` is `text|url` and `filter` is `text|…facets`: their later pipe-separated parts are
    // a URL and a facet list, never a display override, so both take the FIRST part and never
    // go through `referenceDisplay`'s three-part rule.
    case "link":
    case "filter":
      return body.split("|")[0].trim();
    default:
      return referenceDisplay(body);
  }
}

/**
 * Tidy what a removal left behind. Only ever applied to a string that changed, and deliberately
 * minimal: collapsing runs of spaces would destroy the column alignment of the markdown tables
 * in the class descriptions, and stripping a trailing double space would destroy a markdown hard
 * line break. Removing a whole `{@note …}` element is the only thing that leaves a blank-line
 * run, and that is what this fixes.
 */
function tidy(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * The one text rule. Returns the input by reference when there is nothing to clean.
 *
 * `where` names the entity for the unknown-residue warning; it never affects the output.
 */
export function sanitizeText(text: string, where = "<unknown>"): string {
  if (
    !text.includes("{@") &&
    !text.includes("{#itemEntry") &&
    !text.includes("|")
  ) {
    return text;
  }

  let out = text.replace(ITEM_ENTRY_POINTER, "");

  // Curly tags, inner-first, to a fixpoint. The bound is a safety net against a pathological
  // input, not an expected path: the deepest nesting in the shipped data is two levels.
  for (let pass = 0; pass < 8; pass++) {
    const next = out.replace(INNERMOST_TAG, (_m, tag: string, body: string | undefined) =>
      renderTag(tag, body ?? ""),
    );
    if (next === out) break;
    out = next;
  }

  // Bare (brace-less) three-part references with a known name.
  for (const re of BARE_REFERENCE_RES) out = out.replace(re, "");

  // Anything three-part still standing has a name this module does not know. Say so loudly:
  // the two-part rule below will remove the source code, which leaves the name and the display
  // text side by side. That is marker-free and loses no rules text, but it reads oddly, and the
  // fix is one line in BARE_REFERENCE_NAMES.
  //
  // Wikilink spans are excluded from the check, not from the cleanup: `[[target|alias]]` puts a
  // legitimate pipe on both sides of a suffixed target (`[[…/Fire Bolt|xphb|fire bolt|xphb]]`,
  // which the two-part rule below repairs into a working link), and that is not a three-part
  // reference.
  const unknown = out.replace(/\[\[[^[\]]*\]\]/g, "").match(UNKNOWN_THREE_PART);
  if (unknown) {
    for (const hit of unknown) {
      warnOnce(
        `unknown three-part reference ${JSON.stringify(hit)} in , ` +
        `add its name to BARE_REFERENCE_NAMES in tools/srd-canonical/sanitize.ts`,
      );
    }
  }

  // Two-part suffixes.
  out = out.replace(TWO_PART_SUFFIX, "");

  return out === text ? text : tidy(out);
}

const DROP = Symbol("drop");

function walk(value: unknown, where: string): unknown | typeof DROP {
  if (typeof value === "string") return sanitizeText(value, where);
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const next = walk(item, where);
      if (next !== DROP) out.push(next);
    }
    return out;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    let droppedKey = false;
    for (const [k, v] of Object.entries(record)) {
      if (DROP_KEYS.has(k)) {
        droppedKey = true;
        continue;
      }
      const next = walk(v, where);
      // An array that a dropped key emptied carries no information; the schemas make every one
      // of these fields optional, so the key goes rather than shipping `effects: []`.
      if (next === DROP) continue;
      if (Array.isArray(next) && next.length === 0 && Array.isArray(v) && v.length > 0) continue;
      out[k] = next;
    }
    // An object whose ONLY content was a dropped key is not an empty object, it is a removed
    // one: all 83 shipped VTT ids are the sole key of their `effects` element.
    if (droppedKey && Object.keys(out).length === 0) return DROP;
    return out;
  }
  return value;
}

/**
 * Deep-sanitise one emitted record: every string through {@link sanitizeText}, every
 * {@link DROP_KEYS} key removed, and any container a removal emptied removed with it.
 *
 * Copy-on-write is deliberately NOT attempted: the caller writes the result straight to disk and
 * the batch is a few thousand small records.
 */
export function sanitizeEmitted<T>(value: T, where = "<unknown>"): T {
  const out = walk(value, where);
  return (out === DROP ? undefined : out) as T;
}
