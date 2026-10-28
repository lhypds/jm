# Dictionary sources and licensing

Japanese Megane uses **JMdict**, founded by Jim Breen, via the
[jmdict-simplified](https://github.com/scriptin/jmdict-simplified) JSON conversion.
JMdict is the property of James William Breen and the Electronic Dictionary
Research and Development Group (EDRDG), and is used in conformance with the
Group's licence.

- [JMdict project and documentation](https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project)
- [EDRDG licence](https://www.edrdg.org/edrdg/licence.html)
- [Distributed copy of the EDRDG licence/documentation](licenses/edrdg-licence.html)
- [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

The derived [offline dataset](../server/data/loanwords.json) is licensed under
**CC BY-SA 4.0**. Its metadata records the upstream release, dictionary date,
download URL, archive SHA-256, attribution, transformation description, and counts.
Entries retain JMdict IDs for tracing their origin. Do not remove attribution or
claim exclusive copyright over the JMdict-derived material. This data licence does
not require the application source code to use the same licence.

## Modifications

The importer selects katakana spellings, prefers JMdict common spellings over
rare homographs, respects spelling-specific senses,
normalizes lookup keys, converts language codes, and omits conflicting sources,
partial origins, Japanese-coined source records, names and onomatopoeia. Complete
source spellings are preferred. Entries without any source record may use a
concise English gloss when there is exactly one applicable sense. Such entries
are explicitly marked `meaning`, not `original`.

The app also mixes these entries with independently maintained, reviewed
overrides. Original words and English meanings are displayed on the same plain
paper surface; the latter have an “English meaning” tooltip.

## Updates

Run `pnpm run dictionary:update` to download the newest full English JMdict release
and regenerate the dataset and licence documentation. This edition also includes
non-English borrowing-source metadata. Normal app/CLI use does not access the
network. Keep publicly deployed dictionary data current; EDRDG asks web dictionary
servers to update at least monthly.

Run `pnpm run dictionary:rebuild` to reproduce the pinned snapshot. The generator
requires Node.js and the `unzip` command (available by default on macOS). Optional
`JM_JMDICT_ARCHIVE` points to a previously downloaded ZIP; its digest is checked
against release metadata when provided by GitHub.
