import json from "./data/loanwords.json" with { type: "json" };

type DictionaryData = {
  metadata: {
    source: string;
    release: string;
    dictionaryDate: string;
    downloadUrl: string;
    archiveSha256: string;
    license: string;
    licenseUrl: string;
    attribution: string;
    transformation: string;
    counts: { total: number; original: number; meaning: number };
  };
  entries: Record<
    string,
    {
      original: string;
      language: string;
      kind: "original" | "meaning";
      entryIds: string[];
    }
  >;
};

// TypeScript may skip inferring individual properties for very large JSON files.
// The generator and provenance regression tests validate the generated schema.
export const loanwordData = json as DictionaryData;
