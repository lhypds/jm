import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractLoanwords } from "./extract-loanwords.ts";
import type { JMdictWord } from "./extract-loanwords.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = "3.6.2+20261026175559";
const releaseRef = process.argv.includes("--latest") ? "latest" : `tags/${encodeURIComponent(snapshot)}`;
const api = `https://api.github.com/repos/scriptin/jmdict-simplified/releases/${releaseRef}`;

async function get(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return response;
}

const release = (await (await get(api)).json()) as {
  tag_name: string;
  assets: { name: string; browser_download_url: string; digest?: string }[];
};
const asset = release.assets.find(({ name }) => name === `jmdict-eng-${release.tag_name}.json.zip`);
if (!asset) throw new Error("The release has no full English JMdict archive.");

const temporary = await mkdtemp(join(tmpdir(), "jm-dictionary-"));
try {
  const archive = join(temporary, "jmdict.zip");
  const localArchive = process.env.JM_JMDICT_ARCHIVE;
  const bytes = localArchive
    ? await readFile(localArchive)
    : Buffer.from(await (await get(asset.browser_download_url)).arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (asset.digest?.startsWith("sha256:") && asset.digest !== `sha256:${sha256}`) {
    throw new Error("The archive does not match the release SHA-256 digest.");
  }
  await writeFile(archive, bytes);

  // Only print the archive's single JSON member; never extract arbitrary paths.
  const json = execFileSync("unzip", ["-p", archive], { maxBuffer: 150 * 1024 * 1024, encoding: "utf8" });
  const dictionary = JSON.parse(json) as { dictDate: string; words: JMdictWord[] };
  if (!Array.isArray(dictionary.words)) throw new Error("Invalid JMdict schema.");
  const entries = extractLoanwords(dictionary.words);
  const values = Object.values(entries);
  const counts = {
    total: values.length,
    original: values.filter(({ kind }) => kind === "original").length,
    meaning: values.filter(({ kind }) => kind === "meaning").length,
  };
  if (counts.total < 1000) throw new Error("Unexpectedly low import count; refusing to replace the dataset.");

  const output = {
    metadata: {
      source: "JMdict via jmdict-simplified",
      release: release.tag_name,
      dictionaryDate: dictionary.dictDate,
      downloadUrl: asset.browser_download_url,
      archiveSha256: sha256,
      license: "CC-BY-SA-4.0",
      licenseUrl: "https://www.edrdg.org/edrdg/licence.html",
      attribution: "JMdict © James William Breen and the Electronic Dictionary Research and Development Group (EDRDG).",
      transformation:
        "Filtered katakana entries; common spellings preferred over rare homographs; explicit full sources preferred, otherwise one-sense concise English glosses; unresolved ambiguity omitted.",
      counts,
    },
    entries,
  };

  await mkdir(join(root, "server/data"), { recursive: true });
  await writeFile(join(root, "server/data/loanwords.json"), JSON.stringify(output, null, 2) + "\n");

  // Distribute the upstream documentation/license alongside the derived dataset.
  await mkdir(join(root, "docs/licenses"), { recursive: true });
  const license = await (await get("https://www.edrdg.org/edrdg/licence.html")).text();
  await writeFile(join(root, "docs/licenses/edrdg-licence.html"), license);
  console.log(JSON.stringify({ release: release.tag_name, ...counts }, null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
