import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = process.env.BATCH_DB || join(homedir(), ".batch", "db.json");
// fileURLToPath (not URL.pathname) so a clone path containing spaces/%20 resolves correctly
const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "db.json");

const raw = await fs.readFile(src, "utf8");           // throws if missing → fail the build loudly
JSON.parse(raw);                                       // validate it parses
await fs.mkdir(dirname(dest), { recursive: true });
await fs.writeFile(dest, raw, "utf8");
console.log(`baked ${src} -> ${dest} (${raw.length} bytes)`);
