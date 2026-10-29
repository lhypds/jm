import { describe, expect, it } from "vitest";
import { annotateJapanese, formatWithReadings } from "./annotate.ts";

describe("annotateJapanese", () => {
  it.each([
    ["アクセシビリティ", "accessibility", "en", "meaning"],
    ["セキュリティ", "security", "en", "meaning"],
    ["プライバシー", "privacy", "en", "meaning"],
    ["パソコン", "personal computer", "en", "meaning"],
    ["ライフ", "life", "en", "meaning"],
    ["ﾗｲﾌ", "life", "en", "meaning"],
    ["ライフスタイル", "lifestyle", "en", "meaning"],
    ["ライフサイクル", "life cycle", "en", "meaning"],
    ["アレルギー", "Allergie", "de", "original"],
  ])("uses the expanded dictionary for %s", async (text, reading, readingLanguage, readingKind) => {
    expect(await annotateJapanese(text)).toEqual([{ text, reading, readingLanguage, readingKind }]);
  });

  it("adds hiragana readings and preserves the original spacing", async () => {
    const segments = await annotateJapanese("私は 日本語を勉強します。");

    expect(formatWithReadings(segments)).toBe("私(わたし)は 日本語(にほんご)を勉強(べんきょう)します。");
  });

  it("reads compounds kuromoji misreads as a whole word", async () => {
    expect(formatWithReadings(await annotateJapanese("異星人が来た。"))).toBe("異星人(いせいじん)が来(き)た。");
  });

  it("applies user corrections over split words, kanji readings and loanwords", async () => {
    const userReadings = new Map([
      ["今日", "こんにち"],
      ["星人", "せいじん"],
      ["ライト", "right"],
    ]);
    const segments = await annotateJapanese("今日はライトの異星人。", userReadings);

    expect(formatWithReadings(segments)).toBe("今日(こんにち)はライト(right)の異星人(いせいじん)。");
    expect(segments.find(({ text }) => text === "ライト")).toEqual({ text: "ライト", reading: "right", readingLanguage: "en" });
  });

  it("joins the segments a user correction spans", async () => {
    const segments = await annotateJapanese("星人が来た", new Map([["星人", "せいじん"]]));

    expect(segments[0]).toEqual({ text: "星人", reading: "せいじん" });
  });

  it("leaves kana and punctuation unannotated", async () => {
    const segments = await annotateJapanese("こんにちは。");

    expect(segments).toEqual([{ text: "こんにちは" }, { text: "。" }]);
  });

  it("combines hiragana readings and source spellings without changing whitespace", async () => {
    const text = "日本語のコンピューター。\n\nアルバイトで パンを買う。";
    const segments = await annotateJapanese(text);

    expect(segments.map(({ text }) => text).join("")).toBe(text);
    expect(formatWithReadings(segments)).toBe(
      "日本語(にほんご)のコンピューター(computer)。\n\nアルバイト(Arbeit)で パン(pão)を買う(かう)。",
    );
  });

  it.each([
    ["コンピューター", "computer", "en"],
    ["カスタマイズ", "customize", "en"],
    ["ｶｽﾀﾏｲｽﾞ", "customize", "en"],
    ["アルバイト", "Arbeit", "de"],
    ["パン", "pão", "pt"],
    ["アンケート", "enquête", "fr"],
    ["コーヒー", "koffie", "nl"],
    ["ピアノ", "piano", "it"],
    ["テストケース", "test case", "en"],
    ["ｺﾝﾋﾟｭｰﾀｰ", "computer", "en"],
  ])("annotates %s with its original spelling", async (text, reading, readingLanguage) => {
    expect(await annotateJapanese(text)).toEqual([{ text, reading, readingLanguage }]);
  });

  it.each(["ドキドキ", "ジョン", "コンピューターズ"])("does not invent an original spelling for %s", async (text) => {
    const segments = await annotateJapanese(text);
    expect(segments.map(({ text }) => text).join("")).toBe(text);
    expect(segments.every(({ reading }) => reading === undefined)).toBe(true);
  });

  it.each(["ライト", "ﾗｲﾄ"])("shows the common default for %s", async (text) => {
    const segments = await annotateJapanese(text);
    expect(segments).toEqual([
      {
        text,
        reading: "light",
        readingLanguage: "en",
      },
    ]);
    expect(formatWithReadings(segments)).toBe(`${text}(light)`);
  });

  it("preserves the common default and newlines inside a sentence", async () => {
    const text = "ライトをつける。\n\nライトをけす。";
    const segments = await annotateJapanese(text);
    expect(segments.map(({ text }) => text).join("")).toBe(text);
    expect(segments.filter(({ text, reading }) => text === "ライト" && reading === "light")).toHaveLength(2);
  });

  it.each([
    ["ライトアップ", "light up"],
    ["ライトクリック", "right click"],
    ["ライト・クリック", "right click"],
    ["ライトウイング", "right wing"],
    ["ライトウィング", "right wing"],
    ["ライト・ウィング", "right wing"],
    ["ライトハンド", "right hand"],
    ["コピーライト", "copyright"],
    ["ヘッドライト", "headlight"],
    ["ハイライト", "highlight"],
    ["スポットライト", "spotlight"],
    ["ﾗｲﾄｸﾘｯｸ", "right click"],
  ])("uses the complete compound %s instead of its components' defaults", async (text, reading) => {
    expect(await annotateJapanese(text)).toEqual([{ text, reading, readingLanguage: "en" }]);
  });

  it("updates the annotation as standalone input grows into a compound", async () => {
    expect(formatWithReadings(await annotateJapanese("ライト"))).toBe("ライト(light)");
    expect(formatWithReadings(await annotateJapanese("ライトクリック"))).toBe("ライトクリック(right click)");
    expect(formatWithReadings(await annotateJapanese("ライト"))).toBe("ライト(light)");
  });

  it("distinguishes separate defaults and compounds without changing whitespace", async () => {
    const text = "ライトをつける。\n\nライトクリックする。　コピーライト。";
    const segments = await annotateJapanese(text);
    expect(segments.map(({ text }) => text).join("")).toBe(text);
    expect(formatWithReadings(segments)).toBe(
      "ライト(light)をつける。\n\nライトクリック(right click)する。　コピーライト(copyright)。",
    );
  });

  it("annotates customize inside a sentence without losing line breaks", async () => {
    const text = "カスタマイズ\n\nカスタマイズする。";
    expect(formatWithReadings(await annotateJapanese(text))).toBe("カスタマイズ(customize)\n\nカスタマイズ(customize)する。");
  });
});
