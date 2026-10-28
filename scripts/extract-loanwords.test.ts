import { describe, expect, it } from "vitest";
import { extractLoanwords } from "./extract-loanwords.ts";
import type { JMdictSense, JMdictWord } from "./extract-loanwords.ts";

function sense(overrides: Partial<JMdictSense> = {}): JMdictSense {
  return {
    appliesToKana: ["*"],
    partOfSpeech: ["n"],
    misc: [],
    languageSource: [],
    gloss: [{ lang: "eng", text: "sample" }],
    ...overrides,
  };
}

function word(senses = [sense()], id = "1"): JMdictWord {
  return { id, kana: [{ text: "サンプル", tags: [] }], sense: senses };
}

describe("extractLoanwords", () => {
  it("prefers a common word over an unrelated rare homograph in either order", () => {
    const common = word([sense({ gloss: [{ lang: "eng", text: "life" }] })]);
    common.kana[0].common = true;
    const rare = word([sense(), sense({ misc: ["company"] })], "2");
    for (const words of [
      [common, rare],
      [rare, common],
    ]) {
      expect(extractLoanwords(words)["サンプル"]).toEqual({
        original: "life",
        language: "en",
        kind: "meaning",
        entryIds: ["1"],
      });
    }
  });

  it("does not pick arbitrarily between conflicting common entries", () => {
    const first = word();
    const second = word([sense({ gloss: [{ lang: "eng", text: "different" }] })], "2");
    first.kana[0].common = true;
    second.kana[0].common = true;
    expect(extractLoanwords([first, second])).toEqual({});
  });

  it("prefers explicit sources over English meanings and maps language tags", () => {
    const entries = extractLoanwords([
      word([
        sense({
          languageSource: [{ lang: "ger", text: "Beispiel", full: true, wasei: false }],
        }),
      ]),
    ]);
    expect(entries["サンプル"]).toEqual({ original: "Beispiel", language: "de", kind: "original", entryIds: ["1"] });
  });

  it("labels single-sense English glosses as meanings, never as original spellings", () => {
    expect(extractLoanwords([word()])["サンプル"].kind).toBe("meaning");
  });

  it.each([
    { lang: "eng", text: "sample", full: false, wasei: false },
    { lang: "eng", text: "sample", full: true, wasei: true },
    { lang: "eng", text: null, full: true, wasei: false },
  ])("does not guess when source metadata is incomplete or Japanese-coined: %j", (source) => {
    expect(extractLoanwords([word([sense({ languageSource: [source] })])])).toEqual({});
  });

  it("rejects conflicting entries and retains IDs for identical ones", () => {
    expect(extractLoanwords([word(), word([sense({ gloss: [{ lang: "eng", text: "different" }] })], "2")])).toEqual({});
    expect(extractLoanwords([word(), word([sense()], "2")])["サンプル"].entryIds).toEqual(["1", "2"]);
  });

  it("rejects multi-sense English meanings, names, and onomatopoeia", () => {
    expect(extractLoanwords([word([sense(), sense()])])).toEqual({});
    expect(extractLoanwords([word([sense({ partOfSpeech: ["n-pr"] })])])).toEqual({});
    expect(extractLoanwords([word([sense({ misc: ["on-mim"] })])])).toEqual({});
  });

  it("respects per-spelling sense restrictions", () => {
    expect(
      extractLoanwords([word([sense({ appliesToKana: ["サンプル"] }), sense({ appliesToKana: ["サンブル"] })])])["サンプル"]
        .original,
    ).toBe("sample");
  });
});
