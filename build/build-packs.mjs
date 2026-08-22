// Builds the compendium pack shipped with the module:
//   packs/macros   (Macro) from src/macros/macros.json — an ARRAY of Macro
//                  documents (one JSON file to edit, not one per Macro).
//
// Same approach as coc7-fame-and-train / coc7-arkham-journal: the official
// @foundryvtt/foundryvtt-cli compilePack() knows the Document → LevelDB
// collection mapping (Macro → "macros") — we only inject the `_key` its
// hierarchy walk expects. Foundry MUST NOT hold this pack open while this
// runs (a world launched with the pack declared holds the LevelDB LOCK):
// close Foundry, or at least make sure no world using this module is
// running.
//
// Usage (from this build/ directory, after `npm install` once):
//   node build-packs.mjs

import { compilePack } from "@foundryvtt/foundryvtt-cli";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleRoot = path.join(here, "..");
const tmp = path.join(here, ".tmp-src");

fs.rmSync(tmp, { recursive: true, force: true });

const src = JSON.parse(fs.readFileSync(path.join(here, "src", "macros", "macros.json"), "utf8"));
if (!Array.isArray(src)) throw new Error("macros.json must be an array of Macro documents");

const tmpDir = path.join(tmp, "macros");
fs.mkdirSync(tmpDir, { recursive: true });

const seen = new Set();
for (const doc of src) {
  if (!/^[A-Za-z0-9]{16}$/.test(doc._id ?? "")) throw new Error(`bad _id (16 alphanumerics required): ${doc._id} (${doc.name})`);
  if (seen.has(doc._id)) throw new Error(`duplicate _id: ${doc._id}`);
  seen.add(doc._id);
  if (!["script", "chat"].includes(doc.type)) throw new Error(`unexpected macro type on ${doc.name}: ${doc.type}`);
  doc._key = `!macros!${doc._id}`;
  fs.writeFileSync(path.join(tmpDir, `${doc._id}.json`), JSON.stringify(doc, null, 2));
}

await compilePack(tmpDir, path.join(moduleRoot, "packs", "macros"), { log: true });

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Done. ${src.length} macro(s) written to packs/macros.`);
