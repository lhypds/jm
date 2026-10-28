import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import kuromoji from "kuromoji";
import type { ReadingSegment } from "../shared/types.ts";
import { annotateLoanwords } from "./loanwords.ts";

const require = createRequire(import.meta.url);
const dictionaryPath = join(dirname(require.resolve("kuromoji/package.json")), "dict");

let tokenizerPromise: Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> | undefined;

function getTokenizer() {
  tokenizerPromise ??= new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: dictionaryPath }).build((error, tokenizer) => {
      if (error) reject(error);
      else resolve(tokenizer);
    });
  });

  return tokenizerPromise;
}

function toHiragana(value: string) {
  return value.replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60));
}

export async function annotateJapanese(text: string): Promise<ReadingSegment[]> {
  if (!text) return [];

  const tokenizer = await getTokenizer();
  const tokens = tokenizer.tokenize(text);
  const segments: ReadingSegment[] = [];
  let cursor = 0;

  for (const token of tokens) {
    const index = text.indexOf(token.surface_form, cursor);
    if (index > cursor) segments.push({ text: text.slice(cursor, index) });

    const reading = token.reading;
    segments.push({
      text: token.surface_form,
      ...(reading && /\p{Script=Han}/u.test(token.surface_form) ? { reading: toHiragana(reading) } : {}),
    });
    cursor = index + token.surface_form.length;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return annotateLoanwords(segments);
}

export function formatWithReadings(segments: ReadingSegment[]) {
  return segments.map(({ text, reading }) => (reading ? `${text}(${reading})` : text)).join("");
}
