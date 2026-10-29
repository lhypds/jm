import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// One level up from both server/ and the bundled dist-cli/, so the app and the CLI share corrections.
const defaultPath = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "user-readings.json");

export const maxWordLength = 50;
export const maxReadingLength = 100;

/** Readings the user corrected, by word; a missing or unreadable file means none. */
export function loadUserReadings(path = defaultPath): Map<string, string> {
  try {
    const entries: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!entries || typeof entries !== "object") return new Map();
    return new Map(
      Object.entries(entries).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    return new Map();
  }
}

export function saveUserReadings(readings: ReadonlyMap<string, string>, path = defaultPath) {
  mkdirSync(dirname(path), { recursive: true });
  const sorted = [...readings].sort(([a], [b]) => a.localeCompare(b, "ja"));
  writeFileSync(path, `${JSON.stringify(Object.fromEntries(sorted), null, 2)}\n`);
}
