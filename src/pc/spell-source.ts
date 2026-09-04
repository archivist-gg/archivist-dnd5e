import type { ResolvedSpell } from "./pc.types";

/** R4-G3b §6 · ONE data-shaped routing descriptor per ResolvedSpell.source, read by the plugin's Spells-tab components in
 *  place of thirteen hardcoded `source ===` arms (the standing rule: policy from data, never a vocabulary switch in a
 *  component). No `label` (nothing renders a source caption; a provenance caption is G8's) and no `removable` (that is
 *  ResolvedSpell.persisted: membership in character.spells.known). `domain` is declared and produced by nothing. */
export interface SpellSourceDescriptor {
  /** The row's DC / attack bonus come from its own `ability` when it carries one, not from a class. */
  ownAbility: boolean;
  /** Which surface the row belongs to: the class/grant spellbook sections, or Scrolls & Consumables. */
  section: "spellbook" | "consumable";
  /** A leveled row at a level the character owns no slot for gets its own free-cast block. */
  freeCastWhenNoSlot: boolean;
  /** The row is preparable/lockable in the Prepare list (and seeds its level filter chips). */
  showInPrepare: boolean;
  /** The row is a grant, so it lifts the Spells tab's "No Spellcasting" empty state on its own. */
  countsAsGranted: boolean;
}

export const SPELL_SOURCE: Record<ResolvedSpell["source"], SpellSourceDescriptor> = {
  class:  { ownAbility: false, section: "spellbook",  freeCastWhenNoSlot: false, showInPrepare: true,  countsAsGranted: false },
  feat:   { ownAbility: true,  section: "spellbook",  freeCastWhenNoSlot: true,  showInPrepare: true,  countsAsGranted: true  },
  item:   { ownAbility: false, section: "consumable", freeCastWhenNoSlot: false, showInPrepare: false, countsAsGranted: true  },
  race:   { ownAbility: true,  section: "spellbook",  freeCastWhenNoSlot: true,  showInPrepare: true,  countsAsGranted: true  },
  domain: { ownAbility: false, section: "spellbook",  freeCastWhenNoSlot: false, showInPrepare: true,  countsAsGranted: false },
};

export const spellSource = (s: Pick<ResolvedSpell, "source">): SpellSourceDescriptor => SPELL_SOURCE[s.source];
