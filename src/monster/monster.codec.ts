import yaml from "js-yaml";
import type { DocCodec, EntityDoc, ParseResult } from "@archivist-gg/core";
import type { Monster } from "./monster.types";
import { parseMonster } from "./monster.parser";

/** Deprecated alias kept for the barrel re-export (`index.ts:7`) + `monster.resolve.ts:2`. */
export type MonsterRaw = Monster; // N2: mandatory, not conditional

/**
 * Normalizing codec (0c.1a B8). `parse` delegates to `parseMonster`, which runs the legacy migrations of R4-G6 §4.1
 * (the `legendary` alias, scalar `ac` / `hp`, numeric-string coercion, the non-finite scrub, the null step, the
 * `senses` / `languages` string lift, `desc`, a malformed `recharge`), validates against `monsterSchema`, relocates
 * undeclared top-level keys into `raw`, and extracts Legendary-Resistance from trait text into the canonical
 * `legendary_resistance` field. All of it is intended and persists on save (B3); resolve-derived PB/XP are NOT added
 * here. `serialize` stays `yaml.dump` (the edit-save path uses obsidian's separate `editableToYaml`: that
 * two-serializer split is documented here; gate (d) Step 6 verifies `yaml.dump` round-trips).
 */
export const monsterCodec: DocCodec<Monster> = {
  parse(doc: EntityDoc): ParseResult<Monster> {
    return parseMonster(doc.body);
  },
  serialize(monster: Monster): string {
    return yaml.dump(monster, { lineWidth: -1, sortKeys: false });
  },
};
