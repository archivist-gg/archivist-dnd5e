// Committed corrective SRD data (P2). Emitted through the normal generator
// armor pipeline · NO offline injection. The SRD-5e (2014) armor import from
// Open5e omits Shield entirely, so 2014 magic shields (base_item
// [[SRD 5e/Armor/Shield]]) resolve to nothing. This seed adds the base Shield
// armor entity, mirroring the real SRD-2024 shield shape exactly (shields are
// detected downstream by the `_shield` slug suffix, not by category, so
// category is "heavy" like 2024 · see pc.slotting.ts isShieldArmor).
export type SyntheticArmorSeed = {
  name: string;
  source: string;
  category: string;
  ac: { base: number; add_dex: boolean };
  stealth_disadvantage: boolean;
};

export const SYNTHETIC_ARMOR_SEEDS: Record<string, SyntheticArmorSeed[]> = {
  "2014": [
    {
      name: "Shield",
      source: "SRD 5.1",
      category: "heavy",
      ac: { base: 2, add_dex: false },
      stealth_disadvantage: false,
    },
  ],
};
