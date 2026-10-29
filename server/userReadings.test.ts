import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadUserReadings, saveUserReadings } from "./userReadings.ts";

describe("user readings", () => {
  it("saves and loads corrections", () => {
    const path = join(mkdtempSync(join(tmpdir(), "jm-")), "data", "user-readings.json");
    saveUserReadings(new Map([["異星人", "いせいじん"], ["ライト", "right"]]), path);

    expect(loadUserReadings(path)).toEqual(new Map([["ライト", "right"], ["異星人", "いせいじん"]]));
  });

  it("treats a missing or malformed file as no corrections", () => {
    const directory = mkdtempSync(join(tmpdir(), "jm-"));
    const malformed = join(directory, "user-readings.json");
    writeFileSync(malformed, "{");

    expect(loadUserReadings(join(directory, "missing.json"))).toEqual(new Map());
    expect(loadUserReadings(malformed)).toEqual(new Map());
  });
});
