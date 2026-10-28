import express from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { annotateJapanese } from "./annotate.ts";
import { maxSpeechLength, speechVoice, synthesizeJapanese } from "./speech.ts";

const app = express();
const port = Number(process.env.PORT) || 4174;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = join(root, "dist");

app.use(express.json({ limit: "1mb" }));

app.post("/api/speech", async (request, response) => {
  const text = request.body?.text;
  if (typeof text !== "string" || !text.trim() || text.length > maxSpeechLength) {
    response.status(400).json({ error: `Speech requires 1–${maxSpeechLength} characters.` });
    return;
  }
  try {
    const audio = await synthesizeJapanese(text);
    response.set({ "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Speech-Voice": speechVoice });
    response.send(audio);
  } catch {
    console.error("Neural Japanese speech synthesis failed.");
    response.status(502).json({ error: "Japanese speech is unavailable. Please try again." });
  }
});

app.post("/api/annotate", async (request, response) => {
  const text = request.body?.text;
  if (typeof text !== "string") {
    response.status(400).json({ error: "Text is required." });
    return;
  }

  try {
    response.json({ segments: await annotateJapanese(text) });
  } catch (error) {
    console.error(error);
    response.status(500).json({ error: "Japanese text could not be read." });
  }
});

if (existsSync(webRoot)) {
  app.use(express.static(webRoot));
  app.use((_request, response) => response.sendFile(join(webRoot, "index.html")));
}

app.listen(port, () => {
  console.log(`Japanese Megane is ready at http://localhost:${port}`);
});
