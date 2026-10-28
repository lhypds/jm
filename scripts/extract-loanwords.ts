export type DictionaryEntry = {
  original: string;
  language: string;
  kind: "original" | "meaning";
  entryIds: string[];
};

export type JMdictSense = {
  appliesToKana: string[];
  partOfSpeech: string[];
  misc: string[];
  languageSource: { lang: string; text: string | null; full: boolean; wasei: boolean }[];
  gloss: { lang: string; text: string }[];
};

export type JMdictWord = {
  id: string;
  kana: { text: string; tags: string[]; common?: boolean }[];
  sense: JMdictSense[];
};

const languageTags: Record<string, string> = {
  eng: "en",
  ger: "de",
  deu: "de",
  fre: "fr",
  fra: "fr",
  por: "pt",
  dut: "nl",
  nld: "nl",
  ita: "it",
  spa: "es",
  rus: "ru",
  chi: "zh",
  zho: "zh",
  kor: "ko",
  gre: "el",
  ell: "el",
  lat: "la",
  ara: "ar",
  heb: "he",
  vie: "vi",
  tur: "tr",
  nor: "no",
  hun: "hu",
  cze: "cs",
  ces: "cs",
  ukr: "uk",
  swe: "sv",
  tha: "th",
  may: "ms",
  msa: "ms",
  bur: "my",
  mya: "my",
  hin: "hi",
  pol: "pl",
  fin: "fi",
  mon: "mn",
  dan: "da",
  urd: "ur",
  nep: "ne",
  san: "sa",
  tib: "bo",
  bod: "bo",
  tgl: "tl",
  khm: "km",
  uzb: "uz",
  kur: "ku",
  yid: "yi",
};

const katakana = /^[ァ-ヺー・]+$/u;
const conciseEnglish = /^[\p{Script=Latin}\p{Mark} '-]{2,70}$/u;

export function extractLoanwords(words: JMdictWord[]) {
  const grouped = new Map<string, { candidates: Map<string, DictionaryEntry>; blocked: boolean }>();
  const commonSpellings = new Set(
    words.flatMap((word) => word.kana.filter((kana) => kana.common).map((kana) => kana.text.normalize("NFKC"))),
  );

  for (const word of words) {
    for (const kana of word.kana) {
      const spelling = kana.text.normalize("NFKC");
      if (!katakana.test(spelling)) continue;
      // Rare homographs must not suppress a common word (e.g. life vs. Raif).
      // Multiple common entries still go through the same conflict checks.
      if (commonSpellings.has(spelling) && !kana.common) continue;
      const group = grouped.get(spelling) ?? { candidates: new Map(), blocked: false };
      grouped.set(spelling, group);

      const senses = word.sense.filter((sense) => sense.appliesToKana.includes("*") || sense.appliesToKana.includes(kana.text));
      const sources = senses.flatMap((sense) => sense.languageSource);
      let candidate: Omit<DictionaryEntry, "entryIds"> | undefined;

      if (!senses.length || senses.some((sense) => sense.misc.includes("on-mim") || sense.partOfSpeech.includes("n-pr"))) {
        group.blocked = true;
        continue;
      }

      if (sources.length) {
        // Partial origins, Japanese-coined expressions, or missing source text
        // are not enough evidence to reconstruct an original spelling.
        if (sources.some((source) => !source.full || source.wasei || !source.text?.trim())) {
          group.blocked = true;
          continue;
        }
        const originals = new Map(sources.map((source) => [JSON.stringify([source.lang, source.text!.trim()]), source]));
        if (originals.size === 1) {
          const source = originals.values().next().value!;
          candidate = {
            original: source.text!.trim(),
            language: languageTags[source.lang] ?? source.lang,
            kind: "original",
          };
        }
      } else if (senses.length === 1) {
        const gloss = senses[0].gloss.find(({ lang }) => lang === "eng")?.text.trim();
        if (gloss && conciseEnglish.test(gloss)) {
          candidate = { original: gloss, language: "en", kind: "meaning" };
        }
      }

      if (!candidate) {
        group.blocked = true;
        continue;
      }

      const key = JSON.stringify([candidate.original, candidate.language, candidate.kind]);
      const existing = group.candidates.get(key);
      if (existing) existing.entryIds.push(word.id);
      else group.candidates.set(key, { ...candidate, entryIds: [word.id] });
    }
  }

  const entries: Record<string, DictionaryEntry> = {};
  for (const [word, group] of [...grouped].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!group.blocked && group.candidates.size === 1) {
      const entry = group.candidates.values().next().value!;
      entries[word] = { ...entry, entryIds: [...new Set(entry.entryIds)].sort() };
    }
  }
  return entries;
}
