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

The shipped SRD data is MODIFIED, and it is a MERGE. It was not taken from the SRD PDFs. It is
assembled by `tools/srd-canonical/` from:

- the **Open5e** v2 API, queried with the official-SRD document filter
  `document__key__in=srd-2014` / `srd-2024`, the immediate redistribution source of the SRD
  text, itself a CC-BY-4.0 redistribution;
- a structured-rules JSON dump, used to enrich mechanical fields, to expand the SRD's generic
  magic-item variants into one entity per base item, and, for the 15 conditions per edition, as
  the text source (Open5e exposes no condition endpoint for these documents);
- virtual-tabletop activation data, used to derive typed item effects;
- a hand-curated overlay (`tools/srd-canonical/overlays/`), authored for this project.

Content is reformatted to this project's schema and to Markdown, cross-references become vault
wikilinks, and dice and save expressions become this project's inline roll tags; narrative prose
is preserved and no mechanics are invented. A small number of entities with no SRD counterpart
(the base Shield entry, an Ability Score Improvement entry, spell scrolls and unidentified-item
placeholders) are authored here and marked as such.

Entity selection is governed by Open5e's document filter and by the structured-rules dump's own
per-entry SRD flags: every shipped entry's `source` field is `SRD 5.1` or `SRD 5.2`, and no
content from a non-SRD publication is bundled. Because a correct `source` field is a claim about
the ENTITY and not about every byte of its text, the emit path additionally runs
`tools/srd-canonical/sanitize.ts` over every file it writes, removing the upstream tooling's own
markup (reference tags, source-book abbreviation suffixes, template pointers, third-party
database identifiers) and the editorial commentary its contributors wrote about the SRD.

Credit to **Open5e** (https://open5e.com) as the immediate SRD-redistribution source.
