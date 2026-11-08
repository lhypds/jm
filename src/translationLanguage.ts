/** Languages offered for translation, named in themselves, keyed by BCP 47 tag. */
export const translationLanguages: readonly { tag: string; name: string }[] = [
  { tag: "en", name: "English" },
  { tag: "zh-CN", name: "简体中文" },
  { tag: "zh-TW", name: "繁體中文" },
  { tag: "ko", name: "한국어" },
  { tag: "es", name: "Español" },
  { tag: "fr", name: "Français" },
  { tag: "de", name: "Deutsch" },
  { tag: "pt", name: "Português" },
  { tag: "it", name: "Italiano" },
  { tag: "ru", name: "Русский" },
  { tag: "vi", name: "Tiếng Việt" },
  { tag: "th", name: "ไทย" },
  { tag: "id", name: "Bahasa Indonesia" },
  { tag: "ar", name: "العربية" },
  { tag: "hi", name: "हिन्दी" },
  { tag: "tr", name: "Türkçe" },
];

const storageKey = "jm.translationLanguage";

function isOffered(tag: string) {
  return translationLanguages.some((language) => language.tag === tag);
}

/** The offered language closest to a browser language, or English; Japanese readers get English. */
export function defaultTranslationLanguage(browserLanguage: string): string {
  const [primary = "", ...subtags] = browserLanguage.toLowerCase().split("-");
  if (primary === "zh") {
    // Traditional script regions and explicit Hant tags; everything else is Simplified.
    return subtags.some((subtag) => ["hant", "tw", "hk", "mo"].includes(subtag)) ? "zh-TW" : "zh-CN";
  }
  if (isOffered(primary)) return primary;
  return "en";
}

/** The language the user chose last, from local storage, or the browser's default. */
export function loadTranslationLanguage(): string {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved && isOffered(saved)) return saved;
  } catch {
    // Storage may be unavailable, as in some private windows.
  }
  return defaultTranslationLanguage(navigator.language);
}

export function saveTranslationLanguage(tag: string) {
  try {
    localStorage.setItem(storageKey, tag);
  } catch {
    // Without storage, the choice lasts for the page.
  }
}
