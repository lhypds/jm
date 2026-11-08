import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultTranslationModel,
  isTranslationConfigured,
  maxTranslationLength,
  translateJapanese,
  translationInstructions,
  translationLanguage,
} from "./translate.ts";

const fetchMock = vi.fn();

function reply(content: unknown, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("OPENAI_MODEL", "");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(reply(" The train is late. \n"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("translation language", () => {
  it("accepts the chosen language tag, else English", () => {
    expect(translationLanguage("zh-CN")).toBe("zh-CN");
    expect(translationLanguage("ko")).toBe("ko");
    expect(translationLanguage("not a tag!")).toBe("English");
    expect(translationLanguage(undefined)).toBe("English");
  });

  it("names a tag as such in the instructions, and a language name as is", () => {
    expect(translationInstructions("zh-CN")).toContain('BCP 47 tag "zh-CN"');
    expect(translationInstructions("French")).toContain("into French.");
  });
});

describe("OpenAI translation", () => {
  it("is configured only with an API key", () => {
    expect(isTranslationConfigured()).toBe(true);
    vi.stubEnv("OPENAI_API_KEY", " ");
    expect(isTranslationConfigured()).toBe(false);
  });

  it("sends the text with the key and model, and returns the trimmed translation", async () => {
    vi.stubEnv("OPENAI_MODEL", "gpt-test");
    expect(await translateJapanese("電車が遅れています。", "en-US")).toBe("The train is late.");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-test");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "電車が遅れています。" });
    expect(body.messages[0].content).toContain('"en-US"');
  });

  it("falls back to the default model", async () => {
    await translateJapanese("はい", "English");
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string).model).toBe(
      defaultTranslationModel,
    );
  });

  it("rejects empty, oversized or unconfigured requests before contacting OpenAI", async () => {
    await expect(translateJapanese(" ", "English")).rejects.toThrow();
    await expect(translateJapanese("あ".repeat(maxTranslationLength + 1), "English")).rejects.toThrow();
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(translateJapanese("はい", "English")).rejects.toThrow("OPENAI_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects failed or empty responses", async () => {
    fetchMock.mockResolvedValueOnce(reply("", 401));
    await expect(translateJapanese("はい", "English")).rejects.toThrow("401");
    fetchMock.mockResolvedValueOnce(reply(""));
    await expect(translateJapanese("はい", "English")).rejects.toThrow("no translation");
  });
});
