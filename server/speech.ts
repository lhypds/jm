import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export const speechVoice = "ja-JP-NanamiNeural";
export const maxSpeechLength = 2000;
const cache = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
const maxCacheBytes = 8 * 1024 * 1024;
let cacheBytes = 0;

/** Escape plain text: the upstream client accepts SSML, not untrusted text. */
export function escapeSpeechText(text: string): string {
  return text.replace(
    /[<>&"']/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[character]!,
  );
}

async function synthesize(text: string): Promise<Buffer> {
  const tts = new MsEdgeTTS({ connectionTimeoutMs: 10000, synthesisTimeoutMs: 15000 });
  try {
    await tts.setMetadata(speechVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeSpeechText(text));
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) chunks.push(Buffer.from(chunk));
    const audio = Buffer.concat(chunks);
    if (!audio.length) throw new Error("Speech service returned no audio.");
    return audio;
  } finally {
    tts.close();
  }
}

/** Bounded memory-only cache; never persist the user's passages to disk. */
export async function synthesizeJapanese(text: string): Promise<Buffer> {
  text = text.trim();
  if (!text || text.length > maxSpeechLength) throw new Error("Invalid speech text length.");
  const cached = cache.get(text);
  if (cached) return cached;
  const existing = pending.get(text);
  if (existing) return existing;
  if (pending.size >= 4) throw new Error("Speech service is busy.");

  const request = synthesize(text);
  pending.set(text, request);
  try {
    const audio = await request;
    if (audio.length <= maxCacheBytes) {
      while (cache.size >= 32 || cacheBytes + audio.length > maxCacheBytes) {
        const key = cache.keys().next().value!;
        cacheBytes -= cache.get(key)!.length;
        cache.delete(key);
      }
      cache.set(text, audio);
      cacheBytes += audio.length;
    }
    return audio;
  } finally {
    pending.delete(text);
  }
}
