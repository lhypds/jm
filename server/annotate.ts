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

// Compounds missing from IPADIC that kuromoji splits and misreads (e.g. 異/星(ほし)/人).
const compoundReadings: ReadonlyMap<string, string> = new Map([["異星人", "いせいじん"]]);

/** Replace the longest run of whole segments spelling a listed word with that word and its reading. */
function applyWordReadings(segments: ReadingSegment[], readings: ReadonlyMap<string, string>) {
  const longest = Math.max(0, ...[...readings.keys()].map((word) => word.length));
  const result: ReadingSegment[] = [];

  for (let start = 0; start < segments.length; start += 1) {
    let text = "";
    let match: { end: number; reading: string } | undefined;
    for (let end = start; end < segments.length && text.length < longest; end += 1) {
      text += segments[end].text;
      const reading = readings.get(text);
      if (reading) match = { end, reading };
    }

    if (match) {
      result.push({
        text: segments.slice(start, match.end + 1).map(({ text }) => text).join(""),
        reading: match.reading,
        // Latin letters are an English gloss, which is never pronounced.
        ...(/[A-Za-z]/.test(match.reading) ? { readingLanguage: "en" } : {}),
      });
      start = match.end;
    } else {
      result.push(segments[start]);
    }
  }

  return result;
}

/** Annotate the text; user corrections override both kuromoji and the loanword dictionary. */
export async function annotateJapanese(
  text: string,
  userReadings: ReadonlyMap<string, string> = new Map(),
): Promise<ReadingSegment[]> {
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
  return applyWordReadings(annotateLoanwords(segments), new Map([...compoundReadings, ...userReadings]));
}

export function formatWithReadings(segments: ReadingSegment[]) {
  return segments.map(({ text, reading }) => (reading ? `${text}(${reading})` : text)).join("");
}
