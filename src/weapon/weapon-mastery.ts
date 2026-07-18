// `gist` is a one-line effect summary (NO em dashes; use `·` / `:` / `,`) shown
// in the PC Actions-tab mastery column so the reader gets the gist without the
// full glossary prose. `description` remains the verbatim glossary text used in
// the in-card mastery section.
export const MASTERY: Record<string, { label: string; description: string; gist: string }> = {
  cleave: { label: "Cleave", description: "If you hit a creature with a melee attack roll using this weapon, you can make an attack roll with the weapon against a second creature within 5 feet of the first that is also within your reach. On a hit, the second creature takes the weapon's damage, but don't add your ability modifier to that damage unless it is negative. You can make this extra attack only once per turn.", gist: "hit a 2nd creature in reach" },
  graze: { label: "Graze", description: "If your attack roll with this weapon misses a creature, you can deal damage to that creature equal to the ability modifier you used to make the attack roll. This damage is the same type dealt by the weapon, and the damage can be increased only by increasing the ability modifier.", gist: "on miss: ability-mod damage" },
  nick: { label: "Nick", description: "When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can make this extra attack only once per turn.", gist: "extra Light attack (no Bonus Action)" },
  push: { label: "Push", description: "If you hit a creature with this weapon, you can push the creature up to 10 feet straight away from yourself if it is Large or smaller.", gist: "on hit: pushed 10 ft" },
  sap: { label: "Sap", description: "If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn.", gist: "on hit: target Disadvantage" },
  slow: { label: "Slow", description: "If you hit a creature with this weapon and deal damage, you can reduce its Speed by 10 feet until the start of your next turn. If the creature is hit more than once by weapons that have this property, the Speed reduction doesn't exceed 10 feet.", gist: "on hit: -10 ft Speed" },
  topple: { label: "Topple", description: "If you hit a creature with this weapon, you can force the creature to make a Constitution saving throw (DC 8 plus the ability modifier used to make the attack roll and your Proficiency Bonus). On a failed save, the creature has the Prone condition.", gist: "on fail: Prone" },
  vex: { label: "Vex", description: "If you hit a creature with this weapon and deal damage, you have Advantage on your next attack roll against that creature before the end of your next turn.", gist: "on hit: you gain Advantage next" },
};

export function masteryLabel(slug: string): string | undefined {
  return MASTERY[slug]?.label;
}

/** One-line effect gist for a mastery slug (or undefined for an unknown slug). */
export function masteryGist(slug: string): string | undefined {
  return MASTERY[slug]?.gist;
}

export function masteryDerived(
  slug: string,
  abilityMod: number,
  proficiencyBonus: number,
): { label: string; value: number } | undefined {
  if (slug === "topple") return { label: "Save DC", value: 8 + proficiencyBonus + abilityMod };
  if (slug === "graze") return { label: "On miss", value: abilityMod };
  return undefined;
}
