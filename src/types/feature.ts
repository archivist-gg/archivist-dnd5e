import type { Choice } from "./choice";
import type { Resource, ResourceConsumption, ActionCost } from "./resource";
import type { Attack } from "./attack";
import type { FeatureEffect } from "./feature-effect";
import type { Duration } from "../schemas/duration-schema";

/**
 * Recharge / per-day usage limits on a Feature (e.g. monster action).
 *
 * - `recharge_on_roll`: at the start of each turn, recharges on a d6 roll
 *   ≥ `param`. Renders as "Recharge {param}-6" (or "Recharge 6" when param=6).
 * - `per_day`: usable `param` times per day. Renders as "{param}/Day".
 * - `per_short_rest` / `per_long_rest`: usable `param` times per rest.
 */
export interface FeatureRecharge {
  type: "recharge_on_roll" | "per_day" | "per_short_rest" | "per_long_rest";
  param: number;
}

/** The converter's 14-key companion binding (R4-G5 §7, ruling G5-UR2 "declare now, card after the G7 re-emit").
 *  DECLARED, not read: the converter withholds the key today (`P9_NOT_EMITTED_FIELDS`), 0 converted and 0 bundle
 *  notes carry it, and the Passive-tab card is a G8 booking. Every closed-vocabulary leaf is a plain `string` and
 *  every position the converter can emit as null is `| null`, for the reason the schema mirror states: a class,
 *  subclass or race parser refuses a WHOLE document on one nested leaf failure, so a mirror stricter than the
 *  emitter is a total-loss risk on the day the re-emit lands. */
export interface FeatureCompanion {
  statblock?: string;
  statblock_wikilink?: string | null;
  count?: string;
  count_scaling?: Array<{ level?: number; count?: string; source_quote?: string }>;
  shares_action_economy?: boolean;
  turn_order?: string;
  turn_order_source_quote?: string | null;
  proficiency_bonus_scaled?: Array<{ stat?: string; formula?: string; source_quote?: string }>;
  lifecycle?: {
    created_by?: string;
    recreate_on?: string | null;
    previous_instance_perishes?: boolean | null;
    vanishes_if_owner_dies?: boolean | null;
    vanishes_after?: string | null;
    source_quote?: string;
  } | null;
  autonomy?: { when?: string; behaviour?: string; source_quote?: string } | null;
  variants?: Array<{ axis?: string; choices?: string[]; chosen_at?: string; source_quote?: string }>;
  base_statblock?: string | null;
  overrides?: Array<{ field?: string; value?: string; source_quote?: string }>;
  source_quote?: string;
}

export interface Feature {
  id?: string;
  name: string;
  description?: string;
  entries?: string[];
  choices?: Choice[];
  grants_resource?: string;
  consumes?: ResourceConsumption;
  attacks?: Attack[];
  action?: "action" | "bonus-action" | "reaction" | "free" | "special";
  trigger?: string;
  dc_formula?: string;
  effects?: FeatureEffect[];
  sub_features?: Feature[];
  resources?: Resource[];
  recharge?: FeatureRecharge;
  /** Phase 3 activatable buffs: when true, the feature's effects fold only while
   *  its `id` is present in `Character.state.active_buffs` (toggled in the UI). */
  activatable?: boolean;
  /** Always-on marker; renders a "Passive" tag. */
  passive?: boolean;
  /** How long the buff lasts; rendered as a static label (no live countdown). */
  duration?: Duration;
  // Converter feature-level keys (R4-G1b §2.2): declared so `features_by_level[]`
  // and race `traits[]` stop silently stripping them. Nothing reads them yet.
  class_source?: string;
  /** Always "" on every measured carrier — never constrain it non-empty. */
  rendering_hint?: string;
  subclass_short_name?: string;
  subclass_source?: string;
  header?: number;
  is_class_feature_variant?: boolean;
  gain_subclass_feature?: boolean;
  gain_subclass_feature_has_content?: boolean;
  /** 5etools entry type; values {"inset","item"}. */
  type?: string;
  // SRD-BUNDLE-side keys: our own generator emits these at feature level (the
  // Dragonborn Breath Weapon's action cost and save DC). MAPPED since R4-G3a §10:
  // `action_cost` is aliased onto `action` by the race / class / subclass parsers,
  // and `save` renders as the feature card's Save line (`dc_formula` is echoed as
  // TEXT, never evaluated).
  action_cost?: ActionCost;
  save?: { ability: string; dc_formula: string };
  /** The companion this feature binds (R4-G5 §7). Declared so the class / subclass / race parsers stop stripping
   *  it on the day the G7 re-emit lands; nothing reads it in G5. */
  companion?: FeatureCompanion;
}
