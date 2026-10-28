import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({
  setMetadata: vi.fn(async () => {}),
  toStream: vi.fn(),
  close: vi.fn(),
}));
vi.mock("msedge-tts", () => ({
  MsEdgeTTS: class {
    setMetadata = provider.setMetadata;
    toStream = provider.toStream;
    close = provider.close;
  },
  OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: "mp3" },
}));
import { escapeSpeechText, maxSpeechLength, speechVoice, synthesizeJapanese } from "./speech.ts";

beforeEach(() => {
  vi.clearAllMocks();
  provider.setMetadata.mockResolvedValue();
  provider.toStream.mockImplementation(() => ({ audioStream: Readable.from([Buffer.from("mp3 audio")]) }));
});

describe("neural Japanese speech", () => {
  it("escapes user text rather than accepting SSML", () => {
    expect(escapeSpeechText('<voice name="x">&\'</voice>')).toBe("&lt;voice name=&quot;x&quot;&gt;&amp;&apos;&lt;/voice&gt;");
  });

  it("uses Nanami neural, preserves small kana, closes the connection and caches audio", async () => {
    expect(await synthesizeJapanese("れっしゃ")).toEqual(Buffer.from("mp3 audio"));
    expect(provider.setMetadata).toHaveBeenCalledWith(speechVoice, "mp3");
    expect(provider.toStream).toHaveBeenCalledWith("れっしゃ");
    expect(provider.close).toHaveBeenCalledOnce();
    await synthesizeJapanese("れっしゃ");
    expect(provider.toStream).toHaveBeenCalledOnce();
  });

  it("closes failed connections and allows retrying", async () => {
    provider.setMetadata.mockRejectedValueOnce(new Error("Offline"));
    await expect(synthesizeJapanese("きゅう")).rejects.toThrow("Offline");
    expect(provider.close).toHaveBeenCalledOnce();
    await expect(synthesizeJapanese("きゅう")).resolves.toEqual(Buffer.from("mp3 audio"));
  });

  it("rejects empty or oversized input before contacting the provider", async () => {
    await expect(synthesizeJapanese(" ")).rejects.toThrow();
    await expect(synthesizeJapanese("あ".repeat(maxSpeechLength + 1))).rejects.toThrow();
    expect(provider.setMetadata).not.toHaveBeenCalled();
  });

  it("rejects an empty audio stream", async () => {
    provider.toStream.mockReturnValueOnce({ audioStream: Readable.from([]) });
    await expect(synthesizeJapanese("ちょっと")).rejects.toThrow("no audio");
    expect(provider.close).toHaveBeenCalledOnce();
  });
});
