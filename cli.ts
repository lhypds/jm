#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { annotateJapanese, formatWithReadings } from "./server/annotate.ts";
import { loadUserReadings } from "./server/userReadings.ts";

async function main() {
  const filePath = process.argv[2];

  if (!filePath || filePath === "--help" || filePath === "-h") {
    console.log("Usage: jm <file>");
    console.log("Add hiragana readings beside kanji and print the result.");
    process.exitCode = filePath ? 0 : 1;
    return;
  }

  try {
    const text = await readFile(filePath, "utf8");
    const segments = await annotateJapanese(text, loadUserReadings());
    process.stdout.write(formatWithReadings(segments));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`jm: could not read ${basename(filePath)}: ${message}`);
    process.exitCode = 1;
  }
}

void main();
