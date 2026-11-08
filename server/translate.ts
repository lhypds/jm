export const maxTranslationLength = 2000;
export const defaultTranslationModel = "gpt-4o-mini";
const endpoint = "https://api.openai.com/v1/chat/completions";
// A BCP 47 tag such as zh-CN: a 2–3 letter language code, with optional subtags. Names like "French" are not tags.
const languageTag = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;

/** Set OPENAI_API_KEY in .env to enable translation. */
export function isTranslationConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function translationModel(): string {
  return process.env.OPENAI_MODEL?.trim() || defaultTranslationModel;
}

/** The language to translate into: the tag the user chose in the app, else English. */
export function translationLanguage(requested: unknown): string {
  return typeof requested === "string" && languageTag.test(requested) ? requested : "English";
}

export function translationInstructions(language: string): string {
  const target = languageTag.test(language) ? `the language with the BCP 47 tag "${language}"` : language;
  return [
    `You translate Japanese for a reader who is learning it. Translate the user's message into ${target}.`,
    "Reply with only the translation, keeping the original line breaks.",
    "Never add notes, romanization or explanations.",
  ].join(" ");
}

/** Only text the user asked to translate is sent to OpenAI; nothing is stored. */
export async function translateJapanese(text: string, language: string): Promise<string> {
  text = text.trim();
  if (!text || text.length > maxTranslationLength) throw new Error("Invalid translation text length.");
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: translationModel(),
      messages: [
        { role: "system", content: translationInstructions(language) },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`OpenAI responded with status ${response.status}.`);

  const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const translation = data.choices?.[0]?.message?.content;
  if (typeof translation !== "string" || !translation.trim()) throw new Error("OpenAI returned no translation.");
  return translation.trim();
}
