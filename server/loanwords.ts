import type { ReadingSegment } from "../shared/types.ts";
import { loanwordData as dataset } from "./dictionaryData.ts";

type OriginalWord = { original: string; language: string; kind?: ReadingSegment["readingKind"] };

// Small, reviewed overrides supplement the generated JMdict vocabulary.
// Values are source spellings, not necessarily modern Japanese meanings.
// For reviewed ambiguous spellings, show one common default, not alternatives.
const overrides: ReadonlyMap<string, OriginalWord> = new Map([
  ["ライト", { original: "light", language: "en" }],
  ["ライトアップ", { original: "light up", language: "en" }],
  ["ライトクリック", { original: "right click", language: "en" }],
  ["ライト・クリック", { original: "right click", language: "en" }],
  ["ライトウイング", { original: "right wing", language: "en" }],
  ["ライトウィング", { original: "right wing", language: "en" }],
  ["ライト・ウイング", { original: "right wing", language: "en" }],
  ["ライト・ウィング", { original: "right wing", language: "en" }],
  ["ライトハンド", { original: "right hand", language: "en" }],
  ["ライト・ハンド", { original: "right hand", language: "en" }],
  ["コピーライト", { original: "copyright", language: "en" }],
  ["ヘッドライト", { original: "headlight", language: "en" }],
  ["ハイライト", { original: "highlight", language: "en" }],
  ["スポットライト", { original: "spotlight", language: "en" }],
  ["コンピューター", { original: "computer", language: "en" }],
  ["コンピュータ", { original: "computer", language: "en" }],
  ["インターネット", { original: "internet", language: "en" }],
  ["ソフトウェア", { original: "software", language: "en" }],
  ["ハードウェア", { original: "hardware", language: "en" }],
  ["キーボード", { original: "keyboard", language: "en" }],
  ["プログラム", { original: "program", language: "en" }],
  ["プログラミング", { original: "programming", language: "en" }],
  ["データ", { original: "data", language: "en" }],
  ["データベース", { original: "database", language: "en" }],
  ["ファイル", { original: "file", language: "en" }],
  ["フォルダー", { original: "folder", language: "en" }],
  ["フォルダ", { original: "folder", language: "en" }],
  ["サーバー", { original: "server", language: "en" }],
  ["サーバ", { original: "server", language: "en" }],
  ["ブラウザー", { original: "browser", language: "en" }],
  ["ブラウザ", { original: "browser", language: "en" }],
  ["ネットワーク", { original: "network", language: "en" }],
  ["パスワード", { original: "password", language: "en" }],
  ["アカウント", { original: "account", language: "en" }],
  ["ログイン", { original: "log in", language: "en" }],
  ["ダウンロード", { original: "download", language: "en" }],
  ["アップロード", { original: "upload", language: "en" }],
  ["コピー", { original: "copy", language: "en" }],
  ["ペースト", { original: "paste", language: "en" }],
  ["テキスト", { original: "text", language: "en" }],
  ["エディター", { original: "editor", language: "en" }],
  ["エディタ", { original: "editor", language: "en" }],
  ["テスト", { original: "test", language: "en" }],
  ["テストケース", { original: "test case", language: "en" }],
  ["エラー", { original: "error", language: "en" }],
  ["バグ", { original: "bug", language: "en" }],
  ["ボタン", { original: "botão", language: "pt" }],
  ["アイコン", { original: "icon", language: "en" }],
  ["クリック", { original: "click", language: "en" }],
  ["スクリーン", { original: "screen", language: "en" }],
  ["デザイン", { original: "design", language: "en" }],
  ["カスタマイズ", { original: "customize", language: "en" }],
  ["サービス", { original: "service", language: "en" }],
  ["システム", { original: "system", language: "en" }],
  ["プロジェクト", { original: "project", language: "en" }],
  ["チーム", { original: "team", language: "en" }],
  ["ミーティング", { original: "meeting", language: "en" }],
  ["ビジネス", { original: "business", language: "en" }],
  ["ニュース", { original: "news", language: "en" }],
  ["スポーツ", { original: "sports", language: "en" }],
  ["サッカー", { original: "soccer", language: "en" }],
  ["テニス", { original: "tennis", language: "en" }],
  ["バスケットボール", { original: "basketball", language: "en" }],
  ["ホテル", { original: "hotel", language: "en" }],
  ["レストラン", { original: "restaurant", language: "fr" }],
  ["カフェ", { original: "café", language: "fr" }],
  ["メニュー", { original: "menu", language: "fr" }],
  ["コーヒー", { original: "koffie", language: "nl" }],
  ["コップ", { original: "kop", language: "nl" }],
  ["ビール", { original: "bier", language: "nl" }],
  ["ワイン", { original: "wine", language: "en" }],
  ["ミルク", { original: "milk", language: "en" }],
  ["チーズ", { original: "cheese", language: "en" }],
  ["チョコレート", { original: "chocolate", language: "en" }],
  ["ケーキ", { original: "cake", language: "en" }],
  ["アイスクリーム", { original: "ice cream", language: "en" }],
  ["サンドイッチ", { original: "sandwich", language: "en" }],
  ["パン", { original: "pão", language: "pt" }],
  ["カルタ", { original: "carta", language: "pt" }],
  ["パスタ", { original: "pasta", language: "it" }],
  ["ピザ", { original: "pizza", language: "it" }],
  ["ピアノ", { original: "piano", language: "it" }],
  ["オペラ", { original: "opera", language: "it" }],
  ["バレエ", { original: "ballet", language: "fr" }],
  ["アンケート", { original: "enquête", language: "fr" }],
  ["デッサン", { original: "dessin", language: "fr" }],
  ["クレヨン", { original: "crayon", language: "fr" }],
  ["アルバイト", { original: "Arbeit", language: "de" }],
  ["テーマ", { original: "Thema", language: "de" }],
  ["ギプス", { original: "Gips", language: "de" }],
  ["ゼミナール", { original: "Seminar", language: "de" }],
  ["リュックサック", { original: "Rucksack", language: "de" }],
]);

const vocabulary = new Map<string, OriginalWord>(
  Object.entries(dataset.entries).map(([word, entry]) => [
    word,
    {
      original: entry.original,
      language: entry.language,
      kind: entry.kind === "original" ? "original" : "meaning",
    },
  ]),
);
for (const [word, entry] of overrides) vocabulary.set(word, entry);

const katakana = /^[ァ-ヺーｦ-ﾟ・･]+$/u;

export function annotateLoanwords(segments: ReadingSegment[]): ReadingSegment[] {
  const result: ReadingSegment[] = [];

  for (let index = 0; index < segments.length; ) {
    const segment = segments[index];
    if (segment.reading || !katakana.test(segment.text)) {
      result.push(segment);
      index++;
      continue;
    }

    // A full compound entry takes priority over each component's default.
    // Kuromoji may split one loanword into several tokens. Match the entire
    // contiguous katakana run, never an arbitrary substring of an unknown word.
    let end = index + 1;
    while (end < segments.length && !segments[end].reading && katakana.test(segments[end].text)) end++;
    const word = segments
      .slice(index, end)
      .map(({ text }) => text)
      .join("");
    const entry = vocabulary.get(word.normalize("NFKC"));
    if (entry)
      result.push({
        text: word,
        reading: entry.original,
        readingLanguage: entry.language,
        ...(entry.kind ? { readingKind: entry.kind } : {}),
      });
    else result.push(...segments.slice(index, end));
    index = end;
  }

  return result;
}
