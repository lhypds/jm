# Katakana original-word annotations

Japanese Megane automatically adds source spellings or concise English meanings
above recognized katakana words. The browser and CLI share the same offline annotation engine.
Kanji still receives hiragana readings. No external translation service is used.

Examples:

| Japanese       | Annotation  | Source language          |
| -------------- | ----------- | ------------------------ |
| コンピューター | computer    | English                  |
| アルバイト     | Arbeit      | German                   |
| パン           | pão         | Portuguese               |
| アンケート     | enquête     | French                   |
| コーヒー       | koffie      | Dutch                    |
| ピアノ         | piano       | Italian                  |
| ライト         | light       | English (common default) |
| ライトクリック | right click | English (compound)       |
| ライトウイング | right wing  | English (compound)       |
| コピーライト   | copyright   | English (compound)       |
| ヘッドライト   | headlight   | English (compound)       |

Explicit source spellings take priority. For example, アルバイト receives `Arbeit`,
not `part-time job`. When no borrowing-source record is available, a single-sense
English meaning may be used instead: アクセシビリティ receives `accessibility`.
These fallback annotations have an “English meaning” tooltip and `readingKind:
"meaning"` metadata; they are not claimed to be etymological originals.

## Coverage and limitations

- The bundled snapshot contains **45,474 katakana spellings**: 2,952 explicit
  source spellings and 42,522 English-meaning entries, plus reviewed overrides.
  Counts include variant spellings, not just distinct concepts. This is still not
  every possible Japanese word.
- Match the entire contiguous katakana word. Unknown compounds are not annotated
  using guesses from familiar substrings.
- A complete compound entry overrides standalone defaults: ライト receives
  `light`, but ライトクリック receives `right click` and コピーライト receives
  `copyright`. As text changes, the entire word is looked up again. This also
  works when the tokenizer splits the compound into separate tokens.
- Adjacent tokenizer pieces can be joined for lookup, but spaces, punctuation,
  and line breaks are never removed or crossed.
- Half-width katakana is normalized for lookup only. Original input is preserved.
- JMdict common-word flags take precedence over rare homographs. For example,
  ライフ uses the common `life` entry rather than being suppressed by a rare
  same-spelling entry. Conflicts between common entries are still filtered.
- Conflicting entries, partial source records, Japanese-coined source records,
  names, and onomatopoeia are omitted by the importer. Unknown whole words remain
  unchanged. Reviewed overrides can provide one common default for an ambiguous
  word: ライト shows `light`, not `light / right`. Full compound entries take
  priority over this default; arbitrary sentence-level meaning is not inferred.
- This dictionary has no contextual word-sense disambiguation. A known spelling
  used as a name or in a different sense can still receive its dictionary entry.

## Extend the vocabulary

The main vocabulary is [server/data/loanwords.json](../server/data/loanwords.json).
It is generated from JMdict; do not edit thousands of entries by hand. Run
`npm run dictionary:update` for the latest release, or `npm run dictionary:rebuild`
for the pinned snapshot. Review the generated diff and run tests after updating.

For a manually verified correction, add an entry to `overrides` in
[server/loanwords.ts](../server/loanwords.ts).
Each entry contains the Japanese spelling, the original spelling, and a BCP 47
language tag (for example `en`, `de`, or `pt`). Verify the word's borrowing source
before adding it. For reviewed ambiguous entries, choose one verified common
default rather than displaying a slash-separated list of candidates.

Add a regression test in [server/annotate.test.ts](../server/annotate.test.ts).
The renderer uses `readingLanguage` for the annotation's HTML `lang` attribute.
The CLI prints the same original spelling in parentheses beside the word.

See [dictionary sources and licensing](dictionary-sources.md) for JMdict/EDRDG
attribution, data licensing, extraction rules, and regular update requirements.
