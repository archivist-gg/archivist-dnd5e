# @archivist/dnd5e

The D&D 5e (2014 & 2024) rules pack for Archivist: parsers, schemas, codecs, and
types for every entity type, the dice/formula/tag machinery, the player-character
engine, and the bundled SRD content. Built on [`@archivist/core`](https://github.com/archivist-gg/archivist-core).

## What's inside

- **Entity types** — armor, background, class, subclass, race, feat,
  optional-feature, item, weapon, monster, npc, and spell. Each has a parser, a
  [zod](https://zod.dev) schema, a codec, and TypeScript types, exposed as
  `@archivist/dnd5e/<entity>/*` subpath exports.
- **Rules engine** (`dnd/*`) — ability math, proficiency/XP, the formula and
  inline-tag grammar, resource dice, and SRD tag conversion.
- **Player characters** (`pc/*`) — parse → resolve → recalc a character into
  derived stats (AC, saves, skills, attacks, spellcasting, resources, rest), plus
  the decision engine, equipment/slotting, and conditions.
- **SRD data** — System Reference Document 5.1 and 5.2 as `.md` sources plus
  canonical/runtime JSON, loadable through `srd-store`.

Common entry points are re-exported from the package root; everything else is
available via subpath exports.

## Usage

Distributed as TypeScript source (no build step). It depends on `@archivist/core`
via a sibling path dependency, so clone both repos side by side:

```
archivist-core/
archivist-dnd5e/
```

```jsonc
// package.json
"dependencies": {
  "@archivist/core": "file:../archivist-core",
  "@archivist/dnd5e": "file:../archivist-dnd5e"
}
```

Running `npm install` in `archivist-dnd5e` then resolves the sibling.

```ts
import { parseMonster, dnd5ePack } from "@archivist/dnd5e";
import { parsePC } from "@archivist/dnd5e/pc/pc.parser";
```

## Scripts

- `npm run typecheck` — type-check the pack and its tools.
- `npm test` — run the test suite with vitest (regenerates the SRD md-index first).
- `npm run generate` — regenerate `src/data-srd/index.generated.ts` from the `.md` sources.
- `npm run build:srd-canonical[:refresh]` — dev tool that rebuilds the canonical SRD
  JSON from an external 5etools structured-rules dump (`STRUCTURED_RULES_PATH`). Not
  part of the test gate; the committed `src/srd/data/{canonical,runtime}` JSON is the
  consumer contract.

## License

- **Code:** MIT — see [LICENSE](./LICENSE).
- **Bundled SRD data** (`src/srd/data/`, `src/data-srd/`): System Reference Document
  5.1 and 5.2 by Wizards of the Coast LLC, licensed under
  [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/legalcode). See
  [LICENSES/SRD.md](./LICENSES/SRD.md).
