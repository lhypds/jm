import { editorText } from "./editorText.ts";

/** Prefer the annotated Japanese reading; foreign-language glosses are not pronunciations. */
export function pronunciationText(word: HTMLElement): string {
  const reading = word.querySelector("rt");
  if (reading && /^ja(?:-|$)/i.test(reading.lang) && reading.textContent?.trim()) {
    return reading.textContent.trim();
  }
  // Tokenization can split れっしゃ into れっし + ゃ. Never speak a small kana alone.
  if (!reading) {
    let start = word;
    while (/^[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ]/u.test(editorText(start))) {
      const previous = start.previousSibling;
      if (
        !(previous instanceof HTMLElement) ||
        !previous.matches("span.word") ||
        !/[\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(editorText(previous))
      )
        break;
      start = previous;
    }
    let text = editorText(start);
    let next = start.nextSibling;
    while (
      next instanceof HTMLElement &&
      next.matches("span.word") &&
      /^[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ]/u.test(editorText(next))
    ) {
      text += editorText(next);
      next = next.nextSibling;
    }
    return text;
  }
  return editorText(word);
}

/** Read only selected source text, substituting kana for fully selected ruby words. */
export function selectedPronunciation(range: Range): string {
  function read(node: Node): string {
    if (!range.intersectsNode(node)) return "";
    if (node.nodeType === Node.TEXT_NODE) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.textContent?.length;
      return (node.textContent ?? "").slice(start, end);
    }
    if (node instanceof HTMLElement && node.tagName === "RT") return "";
    if (node instanceof HTMLElement && node.tagName === "BR") return "\n";
    const text = Array.from(node.childNodes, read).join("");
    if (node instanceof HTMLElement && node.tagName === "RUBY" && text && text === editorText(node)) {
      return pronunciationText(node);
    }
    return text;
  }

  const ancestor = range.commonAncestorContainer;
  const element = ancestor instanceof Element ? ancestor : ancestor.parentElement;
  return read(element?.closest("ruby") ?? ancestor);
}

let playback: { controller: AbortController; audio?: HTMLAudioElement; url?: string } | undefined;

export function stopPronunciation() {
  if (!playback) return;
  playback.controller.abort();
  playback.audio?.pause();
  if (playback.url) URL.revokeObjectURL(playback.url);
  playback = undefined;
}

/** Play cloud-generated Japanese audio, never the system speech engine. */
export async function pronounceJapanese(text: string): Promise<boolean> {
  if (!text.trim()) return false;
  stopPronunciation();
  const current: NonNullable<typeof playback> = { controller: new AbortController() };
  playback = current;
  const timeout = window.setTimeout(() => current.controller.abort(), 30000);
  try {
    const response = await fetch("/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: current.controller.signal,
    });
    if (!response.ok) throw new Error("Japanese neural speech is unavailable.");
    const blob = await response.blob();
    if (current.controller.signal.aborted || playback !== current) return false;
    current.url = URL.createObjectURL(blob);
    current.audio = new Audio(current.url);
    const release = () => {
      if (playback === current) stopPronunciation();
    };
    current.audio.addEventListener("ended", release, { once: true });
    current.audio.addEventListener("error", release, { once: true });
    await current.audio.play();
    return true;
  } catch (error) {
    if (!current.controller.signal.aborted) console.error("Could not play Japanese neural speech.", error);
    if (playback === current) stopPronunciation();
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}
