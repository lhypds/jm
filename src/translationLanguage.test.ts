// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultTranslationLanguage,
  loadTranslationLanguage,
  saveTranslationLanguage,
  translationLanguages,
} from "./translationLanguage.ts";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("translation language", () => {
  it("picks the offered language closest to the browser's, or English", () => {
    expect(defaultTranslationLanguage("en-US")).toBe("en");
    expect(defaultTranslationLanguage("zh-CN")).toBe("zh-CN");
    expect(defaultTranslationLanguage("zh")).toBe("zh-CN");
    expect(defaultTranslationLanguage("zh-Hant-TW")).toBe("zh-TW");
    expect(defaultTranslationLanguage("zh-HK")).toBe("zh-TW");
    expect(defaultTranslationLanguage("ko-KR")).toBe("ko");
    expect(defaultTranslationLanguage("ja-JP")).toBe("en");
    expect(defaultTranslationLanguage("")).toBe("en");
  });

  it("remembers the chosen language, ignoring unknown saved values", () => {
    vi.stubGlobal("navigator", { language: "fr-FR" });
    expect(loadTranslationLanguage()).toBe("fr");
    saveTranslationLanguage("ko");
    expect(loadTranslationLanguage()).toBe("ko");
    localStorage.setItem("jm.translationLanguage", "tlh");
    expect(loadTranslationLanguage()).toBe("fr");
  });

  it("offers each language once, under a tag", () => {
    const tags = translationLanguages.map((language) => language.tag);
    expect(new Set(tags).size).toBe(tags.length);
    expect(tags.every((tag) => /^[a-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(tag))).toBe(true);
  });
});
