/**
 * Convert 5etools-style {@...} tags to the plugin's backtick inline-tag format.
 * Called before backtick regex processing so AI-generated 5etools markup renders correctly.
 */
export function convert5eToolsTags(text: string): string {
  const rewritten = text
    // Attack type labels (order matters: compound first)
    .replace(/\{@atk\s+mw,rw\}/gi, 'Melee or Ranged Weapon Attack:')
    .replace(/\{@atk\s+mws\}/gi, 'Melee or Ranged Weapon Attack:')
    .replace(/\{@atk\s+msw\}/gi, 'Melee or Ranged Spell Attack:')
    .replace(/\{@atk\s+mw\}/gi, 'Melee Weapon Attack:')
    .replace(/\{@atk\s+rw\}/gi, 'Ranged Weapon Attack:')
    .replace(/\{@atk\s+ms\}/gi, 'Melee Spell Attack:')
    .replace(/\{@atk\s+rs\}/gi, 'Ranged Spell Attack:')
    // Hit bonus -> `atk:+N`
    .replace(/\{@hit\s+(\d+)\}/gi, '`atk:+$1`')
    // Hit label
    .replace(/\{@h\}/gi, 'Hit:')
    // Damage -> `damage:XdY+Z type`
    .replace(/\{@damage\s+([^}]+)\}/gi, '`damage:$1`')
    // Dice -> `roll:XdY+Z`
    .replace(/\{@dice\s+([^}]+)\}/gi, '`roll:$1`')
    .replace(/\{@d20\s+([^}]+)\}/gi, '`roll:d20$1`')
    // DC -> `dc:N`
    .replace(/\{@dc\s+(\d+)\}/gi, '`dc:$1`')
    // Recharge -> "(Recharge X-6)" or "(Recharge)"
    .replace(/\{@recharge\s+(\d)\}/gi, '(Recharge $1-6)')
    .replace(/\{@recharge\}/gi, '(Recharge)')
    // Chance -> "N% chance"
    .replace(/\{@chance\s+(\d+)\}/gi, '$1% chance')
    // Formatting
    .replace(/\{@b(?:old)?\s+([^}]+)\}/gi, '**$1**')
    .replace(/\{@i(?:talic)?\s+([^}]+)\}/gi, '_$1_')
    .replace(/\{@s(?:trike)?\s+([^}]+)\}/gi, '~~$1~~')
    .replace(/\{@note\s+([^}]+)\}/gi, '($1)')
    // Entity references -- extract display name (first part before |)
    .replace(/\{@spell\s+([^|}]+)[^}]*\}/gi, '_$1_')
    .replace(/\{@item\s+([^|}]+)[^}]*\}/gi, '$1')
    .replace(/\{@creature\s+([^|}]+)[^}]*\}/gi, '$1')
    .replace(/\{@condition\s+([^|}]+)[^}]*\}/gi, '$1')
    .replace(/\{@skill\s+([^|}]+)[^}]*\}/gi, '$1')
    .replace(/\{@sense\s+([^|}]+)[^}]*\}/gi, '$1')
    .replace(/\{@action\s+([^|}]+)[^}]*\}/gi, '**$1**')
    .replace(/\{@status\s+([^|}]+)[^}]*\}/gi, '**$1**')
    .replace(/\{@ability\s+([^|}]+)[^}]*\}/gi, '**$1**')
    .replace(/\{@class\s+([^|}]+)[^}]*\}/gi, '$1')
    .replace(/\{@feat\s+([^|}]+)[^}]*\}/gi, '**$1**')
    .replace(/\{@background\s+([^|}]+)[^}]*\}/gi, '$1')
    .replace(/\{@race\s+([^|}]+)[^}]*\}/gi, '$1')
    .replace(/\{@disease\s+([^|}]+)[^}]*\}/gi, '**$1**')
    .replace(/\{@hazard\s+([^|}]+)[^}]*\}/gi, '**$1**')
    .replace(/\{@plane\s+([^|}]+)[^}]*\}/gi, '$1')
    .replace(/\{@language\s+([^|}]+)[^}]*\}/gi, '$1')
    .replace(/\{@book\s+([^|}]+)[^}]*\}/gi, '_$1_')
    .replace(/\{@adventure\s+([^|}]+)[^}]*\}/gi, '_$1_')
    // Catch-all: any remaining {@tag content} -> just content
    .replace(/\{@\w+\s+([^}]+)\}/g, '$1');
  return decorateProseDice(rewritten);
}

/**
 * Wrap bare dice notation (e.g. `1d6`, `2d6+3`, `37d8 + 259`) in synthetic
 * `dice:…` backtick tags so the existing stat-block pill renderer picks them up.
 *
 * Skips dice notation that is already inside a backtick tag (the first
 * alternation branch consumes backtick-delimited spans and returns them
 * untouched) or embedded inside an identifier (word-character boundary).
 *
 * Pure. No state. No side effects.
 */
export function decorateProseDice(text: string): string {
  return text.replace(
    /`[^`]*`|(?<!\w)(\d+d\d+(?:\s*[+-]\s*\d+)?)(?!\w)/g,
    (match: string, dice: string | undefined) => {
      if (dice) return `\`dice:${dice.replace(/\s+/g, "")}\``;
      return match;
    },
  );
}
