import express from "express";
import { appendFile, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { annotateJapanese } from "./annotate.ts";
import { maxSpeechLength, speechVoice, synthesizeJapanese } from "./speech.ts";

const app = express();
const port = Number(process.env.PORT) || 4174;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = join(root, "dist");
const logFile = join(root, "logs", "jm.log");

mkdirSync(dirname(logFile), { recursive: true });

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
    const segments = await annotateJapanese(text);
    logExchange("/api/annotate", { text }, { status: 200, segments });
    response.json({ segments });
  } catch (error) {
    console.error(error);
    const message = "Japanese text could not be read.";
    logExchange("/api/annotate", { text }, { status: 500, error: message });
    response.status(500).json({ error: message });
  }
});

if (existsSync(webRoot)) {
  app.use(express.static(webRoot));
  app.use((_request, response) => response.sendFile(join(webRoot, "index.html")));
}

app.listen(port, () => {
  console.log(`Japanese Megane is ready at http://localhost:${port}`);
});
