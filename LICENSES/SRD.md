# SRD Attribution (CC-BY-4.0)

This repository bundles content from the Dungeons & Dragons **System Reference Document**,
both the 5.1 (2014) and 5.2 (2024) editions, released by Wizards of the Coast under the
Creative Commons Attribution 4.0 International License (CC-BY-4.0).

## Required attribution

This work includes material from the System Reference Document 5.1 ("SRD 5.1") by Wizards of
the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document.
The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License,
available at https://creativecommons.org/licenses/by/4.0/legalcode.

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of
the Coast LLC and available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under
the Creative Commons Attribution 4.0 International License, available at
https://creativecommons.org/licenses/by/4.0/legalcode.

Copyright © Wizards of the Coast LLC. "Dungeons & Dragons" is a trademark of Wizards of the
Coast. This project is unofficial and not affiliated with or endorsed by Wizards of the Coast.

## Bundled SRD locations

- `src/srd/data/` — canonical structured SRD data (SRD 5.1 + 5.2)
- `src/data-srd/` — verbatim SRD prose (markdown: classes, species, subclasses, backgrounds, feats)
- `tools/srd-canonical/` — the SRD converter/build tooling

## Provenance and changes made (CC-BY "indicate if changes were made")

The shipped SRD data is a MERGE, assembled by `tools/srd-canonical/` from: the **Open5e** v2
API (the immediate redistribution source of the SRD content), a structured-rules dump, and
supplemental activation data, combined with a hand-curated overlay. Content is transformed
structurally (reformatted to this project's schema and to Markdown) and normalized; narrative
prose is preserved. **No non-SRD content is bundled** — every shipped entry's `source` field is
`SRD 5.1` or `SRD 5.2` (verified: see the repository's SRD-content assertion).

Credit to **Open5e** (https://open5e.com) as the immediate SRD-redistribution source.
