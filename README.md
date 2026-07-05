# @archivist/dnd5e

The D&D 5e rules pack for Archivist: per-entity parsers, schemas, codecs, and
types (armor, background, class, feat, item, monster, npc, optional-feature,
race, spell, subclass, weapon), the `dnd/*` formula + tag machinery, and the
bundled SRD data (`src/data-srd/*.md`, `src/srd/data/{canonical,runtime}`).

Source-distributed: consumers import the `@archivist/dnd5e/*` subpath exports
directly from `.ts` source (no build step here). Depends on `@archivist/core`
via a sibling path dep (`file:../archivist-core`).

Provenance: extracted from `archivist-obsidian@00b98c8` (Movement 3, Phase 2 —
a pure move; the `exports` API is unchanged). AGPL — see `LICENSE`.

## Scripts

- `npm run typecheck` — `tsc -b --force` + `tsc -p tsconfig.tools.json`.
- `npm test` — vitest (regenerates the SRD md-index first, then runs the suite).
- `npm run generate` — regenerate `src/data-srd/index.generated.ts` from the `.md` sources.
- `npm run build:srd-canonical[:refresh]` — dev tool that rebuilds the canonical
  SRD JSON. **NOT part of the gate:** it needs an external 5etools structured-rules
  dump (set `STRUCTURED_RULES_PATH`) that is not shipped in this repo. The committed
  `src/srd/data/{canonical,runtime}` JSON is the consumer contract.
