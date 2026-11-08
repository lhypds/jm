import express from "express";
import { appendFile, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { annotateJapanese } from "./annotate.ts";
import { maxSpeechLength, speechVoice, synthesizeJapanese } from "./speech.ts";
import {
  isTranslationConfigured,
  maxTranslationLength,
  translateJapanese,
  translationLanguage,
  translationModel,
} from "./translate.ts";
import { loadUserReadings, maxReadingLength, maxWordLength, saveUserReadings } from "./userReadings.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Settings such as the OpenAI key live in .env; variables already in the environment win.
try {
  process.loadEnvFile(join(root, ".env"));
} catch {
  // No .env yet: setup.sh creates one from .env.example.
}

const app = express();
const port = Number(process.env.PORT) || 4174;
const webRoot = join(root, "dist");
const logFile = join(root, "logs", "jm.log");

mkdirSync(dirname(logFile), { recursive: true });
const userReadings = loadUserReadings();

app.use(express.json({ limit: "1mb" }));

function logExchange(route: string, request: unknown, response: unknown) {
  const line = JSON.stringify({ time: new Date().toISOString(), route, request, response });
  appendFile(logFile, `${line}\n`, (error) => {
    if (error) console.error("Could not write request log.", error);
  });
}

app.post("/api/speech", async (request, response) => {
  const text = request.body?.text;
  if (typeof text !== "string" || !text.trim() || text.length > maxSpeechLength) {
    const error = `Speech requires 1–${maxSpeechLength} characters.`;
    logExchange("/api/speech", { text }, { status: 400, error });
    response.status(400).json({ error });
    return;
  }
  try {
    const audio = await synthesizeJapanese(text);
    logExchange("/api/speech", { text }, { status: 200, voice: speechVoice, bytes: audio.length });
    response.set({ "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Speech-Voice": speechVoice });
    response.send(audio);
  } catch {
    console.error("Neural Japanese speech synthesis failed.");
    const error = "Japanese speech is unavailable. Please try again.";
    logExchange("/api/speech", { text }, { status: 502, error });
    response.status(502).json({ error });
  }
});

app.post("/api/annotate", async (request, response) => {
  const text = request.body?.text;
  if (typeof text !== "string") {
    const error = "Text is required.";
    logExchange("/api/annotate", { text }, { status: 400, error });
    response.status(400).json({ error });
    return;
  }

  try {
    const segments = await annotateJapanese(text, userReadings);
    logExchange("/api/annotate", { text }, { status: 200, segments });
    response.json({ segments });
  } catch (error) {
    console.error(error);
    const message = "Japanese text could not be read.";
    logExchange("/api/annotate", { text }, { status: 500, error: message });
    response.status(500).json({ error: message });
  }
});

app.post("/api/translate", async (request, response) => {
  const text = request.body?.text;
  const language = translationLanguage(request.body?.language);
  if (typeof text !== "string" || !text.trim() || text.length > maxTranslationLength) {
    const error = `Translation requires 1–${maxTranslationLength} characters.`;
    logExchange("/api/translate", { text, language }, { status: 400, error });
    response.status(400).json({ error });
    return;
  }
  if (!isTranslationConfigured()) {
    const error = "Set OPENAI_API_KEY in .env to translate.";
    logExchange("/api/translate", { text, language }, { status: 503, error });
    response.status(503).json({ error });
    return;
  }
  try {
    const translation = await translateJapanese(text, language);
    logExchange("/api/translate", { text, language }, { status: 200, model: translationModel(), translation });
    response.json({ translation, language });
  } catch (error) {
    console.error("Translation failed.", error instanceof Error ? error.message : error);
    const message = "Translation is unavailable. Please try again.";
    logExchange("/api/translate", { text, language }, { status: 502, error: message });
    response.status(502).json({ error: message });
  }
});

// An empty reading removes the correction, restoring the dictionary's reading.
app.put("/api/readings", (request, response) => {
  const word = request.body?.word;
  const reading = request.body?.reading;
  if (
    typeof word !== "string" ||
    typeof reading !== "string" ||
    !word.trim() ||
    word.includes("\n") ||
    word.trim().length > maxWordLength ||
    reading.trim().length > maxReadingLength
  ) {
    const error = `A word of 1–${maxWordLength} characters on one line and a reading of up to ${maxReadingLength} are required.`;
    logExchange("/api/readings", { word, reading }, { status: 400, error });
    response.status(400).json({ error });
    return;
  }

  const key = word.trim();
  const value = reading.trim();
  if (value) userReadings.set(key, value);
  else userReadings.delete(key);
  try {
    saveUserReadings(userReadings);
  } catch (error) {
    console.error(error);
    const message = "The reading could not be saved.";
    logExchange("/api/readings", { word, reading }, { status: 500, error: message });
    response.status(500).json({ error: message });
    return;
  }
  logExchange("/api/readings", { word, reading }, { status: 200 });
  response.json({ word: key, reading: value });
});

if (existsSync(webRoot)) {
  app.use(express.static(webRoot));
  app.use((_request, response) => response.sendFile(join(webRoot, "index.html")));
}

app.listen(port, () => {
  console.log(`Japanese Megane is ready at http://localhost:${port}`);
});
