import { describe, expect, it } from "vitest";
import { annotateLoanwords } from "./loanwords.ts";
import { loanwordData as dataset } from "./dictionaryData.ts";

describe("annotateLoanwords", () => {
  it("ships a large offline vocabulary with traceable provenance", () => {
    expect(Object.keys(dataset.entries).length).toBeGreaterThan(40_000);
    expect(dataset.metadata.counts.total).toBe(Object.keys(dataset.entries).length);
    expect(dataset.metadata.counts.original + dataset.metadata.counts.meaning).toBe(dataset.metadata.counts.total);
    expect(dataset.metadata.license).toBe("CC-BY-SA-4.0");
    expect(dataset.entries["アレルギー"].entryIds).toContain("1019740");
  });

  it("matches a whole word even when the tokenizer splits it", () => {
    expect(annotateLoanwords([{ text: "アイス" }, { text: "クリーム" }])).toEqual([
      { text: "アイスクリーム", reading: "ice cream", readingLanguage: "en" },
    ]);
  });

  it("does not partially annotate an unknown katakana compound", () => {
    const segments = [{ text: "パン" }, { text: "ダズズ" }];
    expect(annotateLoanwords(segments)).toEqual(segments);
  });

  it("prefers compound context across tokenizer boundaries", () => {
    expect(annotateLoanwords([{ text: "ライト" }, { text: "クリック" }])).toEqual([
      { text: "ライトクリック", reading: "right click", readingLanguage: "en" },
    ]);
    expect(annotateLoanwords([{ text: "コピー" }, { text: "ライト" }])).toEqual([
      { text: "コピーライト", reading: "copyright", readingLanguage: "en" },
    ]);
  });

  it("does not force a standalone default into an unknown compound", () => {
    const segments = [{ text: "ライト" }, { text: "ズズズ" }];
    expect(annotateLoanwords(segments)).toEqual(segments);
  });

  it("never joins words across whitespace or punctuation", () => {
    const segments = [{ text: "アイス" }, { text: "\n" }, { text: "クリーム" }];
    expect(annotateLoanwords(segments)).toEqual(segments);
  });

  it("leaves existing kanji readings intact", () => {
    const segments = [{ text: "日本語", reading: "にほんご" }];
    expect(annotateLoanwords(segments)).toEqual(segments);
  });
});
