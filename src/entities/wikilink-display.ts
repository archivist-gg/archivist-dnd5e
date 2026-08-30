/** The human name of a wikilink target: `[[Player's Handbook (2024)/OptionalFeatures/Pact of the Blade]]` →
 *  "Pact of the Blade"; `[[path|Alias]]` → "Alias". The converter emits vault PATHS with no alias. */
export function wikilinkDisplayName(link: string): string {
  const inner = link.trim().replace(/^\[\[/, "").replace(/\]\]$/, "");
  const afterAlias = inner.includes("|") ? inner.slice(inner.lastIndexOf("|") + 1) : inner;
  const afterSlash = afterAlias.includes("/") ? afterAlias.slice(afterAlias.lastIndexOf("/") + 1) : afterAlias;
  return afterSlash.trim();
}
