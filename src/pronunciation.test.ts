// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { pronunciationText, pronounceJapanese, selectedPronunciation, stopPronunciation } from "./pronunciation.ts";

afterEach(() => {
  stopPronunciation();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("selectedPronunciation", () => {
  it("reads selected words with kana, excluding foreign annotations", () => {
    const editor = document.createElement("main");
    editor.innerHTML = '<ruby>日本語<rt lang="ja">にほんご</rt></ruby>と<ruby>ライフ<rt lang="en">life</rt></ruby>。';
    const range = document.createRange();
    range.selectNodeContents(editor);
    expect(selectedPronunciation(range)).toBe("にほんごとライフ。");
  });

  it("uses kana even when selection ends before the ruby annotation", () => {
    const word = document.createElement("ruby");
    word.innerHTML = '日本語<rt lang="ja">にほんご</rt>';
    const range = document.createRange();
    range.setStart(word.firstChild!, 0);
    range.setEnd(word.firstChild!, 3);
    expect(selectedPronunciation(range)).toBe("にほんご");
  });

  it("does not read unselected characters or the full reading for a partial word", () => {
    const word = document.createElement("ruby");
    word.innerHTML = '日本語<rt lang="ja">にほんご</rt>';
    const range = document.createRange();
    range.setStart(word.firstChild!, 1);
    range.setEnd(word.firstChild!, 2);
    expect(selectedPronunciation(range)).toBe("本");
  });

  it("preserves selected line breaks and unannotated kana", () => {
    const editor = document.createElement("main");
    editor.textContent = "こんにちは\nありがとう";
    const range = document.createRange();
    range.selectNodeContents(editor);
    expect(selectedPronunciation(range)).toBe("こんにちは\nありがとう");
  });
});

function mockSpeech() {
  const fetchAudio = vi.fn(async () => new Response(new Blob(["mp3"], { type: "audio/mpeg" })));
  vi.stubGlobal("fetch", fetchAudio);
  const audios: MockAudio[] = [];
  class MockAudio extends EventTarget {
    src: string;
    play = vi.fn(async () => {});
    pause = vi.fn();
    constructor(src: string) {
      super();
      this.src = src;
      audios.push(this);
    }
  }
  vi.stubGlobal("Audio", MockAudio);
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:speech");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return { fetchAudio, audios, create, revoke };
}

describe("pronounceJapanese", () => {
  it("sends the annotated kana intact to neural TTS instead of system speech", async () => {
    const speech = mockSpeech();
    vi.stubGlobal("speechSynthesis", undefined);
    const word = document.createElement("ruby");
    word.innerHTML = '列車<rt lang="ja">れっしゃ</rt>';
    expect(await pronounceJapanese(pronunciationText(word))).toBe(true);
    expect(speech.fetchAudio).toHaveBeenCalledWith(
      "/api/speech",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "れっしゃ" }),
      }),
    );
    expect(speech.audios[0].play).toHaveBeenCalledOnce();
  });

  it("stops the previous audio and releases its URL on the next click", async () => {
    const speech = mockSpeech();
    await pronounceJapanese("れっしゃ");
    await pronounceJapanese("こんにちは");
    expect(speech.audios[0].pause).toHaveBeenCalledOnce();
    expect(speech.revoke).toHaveBeenCalledWith("blob:speech");
    expect(speech.audios[1].play).toHaveBeenCalledOnce();
  });

  it("releases audio when playback ends", async () => {
    const speech = mockSpeech();
    await pronounceJapanese("こんにちは");
    speech.audios[0].dispatchEvent(new Event("ended"));
    expect(speech.revoke).toHaveBeenCalledWith("blob:speech");
  });

  it("reads the katakana word instead of the English annotation", async () => {
    const speech = mockSpeech();
    const word = document.createElement("ruby");
    word.innerHTML = 'ライフ<rt lang="en">life</rt>';
    await pronounceJapanese(pronunciationText(word));
    expect(speech.fetchAudio).toHaveBeenCalledWith(
      "/api/speech",
      expect.objectContaining({
        body: JSON.stringify({ text: "ライフ" }),
      }),
    );
  });

  it("speaks the annotated kana rather than asking the browser to read kanji", async () => {
    const speech = mockSpeech();
    const word = document.createElement("ruby");
    word.innerHTML = '日本語<rt lang="ja">にほんご</rt>';
    await pronounceJapanese(pronunciationText(word));
    expect(speech.fetchAudio).toHaveBeenCalledWith(
      "/api/speech",
      expect.objectContaining({
        body: JSON.stringify({ text: "にほんご" }),
      }),
    );
  });

  it("uses the original word when no reading is present", () => {
    const word = document.createElement("span");
    word.textContent = "こんにちは";
    expect(pronunciationText(word)).toBe("こんにちは");
  });

  it("joins a split small kana with the preceding word regardless of which part is clicked", () => {
    const editor = document.createElement("main");
    editor.innerHTML = '<span class="word">れっし</span><span class="word">ゃ</span> <span class="word">や</span>';
    const words = editor.querySelectorAll<HTMLElement>(".word");
    expect(pronunciationText(words[0])).toBe("れっしゃ");
    expect(pronunciationText(words[1])).toBe("れっしゃ");
    expect(pronunciationText(words[2])).toBe("や");
  });

  it("preserves small kana rather than expanding or separating them for speech", async () => {
    const speech = mockSpeech();
    await pronounceJapanese("れっしゃ きゅう ちょっと");
    expect(speech.fetchAudio).toHaveBeenCalledWith(
      "/api/speech",
      expect.objectContaining({
        body: JSON.stringify({ text: "れっしゃ きゅう ちょっと" }),
      }),
    );
  });

  it("falls back to the original word for an empty Japanese reading", () => {
    const word = document.createElement("ruby");
    word.innerHTML = '日本語<rt lang="ja"></rt>';
    expect(pronunciationText(word)).toBe("日本語");
  });

  it("does not send empty text", async () => {
    const speech = mockSpeech();
    expect(await pronounceJapanese("")).toBe(false);
    expect(speech.fetchAudio).not.toHaveBeenCalled();
  });

  it("does not fall back to the broken system voice on a server error", async () => {
    const speech = mockSpeech();
    speech.fetchAudio.mockResolvedValue(new Response(null, { status: 502 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await pronounceJapanese("れっしゃ")).toBe(false);
    expect(speech.audios).toHaveLength(0);
  });

  it("ignores a stale response after another word is clicked", async () => {
    const speech = mockSpeech();
    let resolve!: (response: Response) => void;
    speech.fetchAudio.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const previous = pronounceJapanese("れっしゃ");
    await pronounceJapanese("こんにちは");
    resolve(new Response(new Blob(["old mp3"])));
    expect(await previous).toBe(false);
    expect(speech.audios).toHaveLength(1);
  });
});
