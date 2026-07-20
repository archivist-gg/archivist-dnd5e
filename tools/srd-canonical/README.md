# SRD Canonical Pipeline

Builds the canonical SRD dataset (2014 + 2024) by merging Open5e v2, the local structured-rules data dump, foundry-*.json activation data, and the hand-curated overlay.

## Usage

```bash
export STRUCTURED_RULES_PATH=/path/to/structured-rules/data
npm run build:srd-canonical
# Or refresh Open5e cache:
npm run build:srd-canonical -- --refresh-open5e
# Or single edition:
npm run build:srd-canonical -- --edition 2014
```

## Outputs

- `src/srd/data/canonical/{kind}.{edition}.json` — full canonical (committed)
- `src/srd/data/runtime/{kind}.{edition}.json` — slim runtime (committed; bundled in plugin)
- `.compendium-bundle/SRD 5e/`, `.compendium-bundle/SRD 2024/` — vault MD set (committed; copied to user vault on plugin install)

## Slug convention & reproducibility

Every entity slug is **type-namespaced**: `<compendium-prefix>_<entity_type>_<name-slug>`
(e.g. `srd-2024_armor_shield` vs `srd-2024_spell_shield`). The type token is always the
singular `entity_type`, and the slug is **computed** by `buildCanonicalSlug` — never
hardcoded. Full rules: the plugin's `docs/reference/entity-slug-convention.md`.

**Never offline-inject data.** All output must be reproducible from a clean
`build:srd-canonical`, so every install gets identical data. Change existing entities via
`overlays/*.yaml`; add synthetic entities (e.g. the scroll / unidentified-item seeds) via
a committed `data/*.json` source emitted through the normal pipeline — see
`data/synthetic-item-seeds.2024.json` and its emit block in `index.ts`. Do not hand-edit
generated JSON or the bundle.

## See

- Spec: `docs/superpowers/specs/2026-04-29-srd-canonical-pipeline-design.md`
- Plan: `docs/superpowers/plans/2026-04-29-srd-canonical-pipeline.md`
