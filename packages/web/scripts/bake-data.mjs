import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const src = process.env.BATCH_DB || join(homedir(), ".batch", "db.json");
const dest = join(dirname(new URL(import.meta.url).pathname), "..", "data", "db.json");

const raw = await fs.readFile(src, "utf8");           // throws if missing → fail the build loudly
JSON.parse(raw);                                       // validate it parses
await fs.mkdir(dirname(dest), { recursive: true });
await fs.writeFile(dest, raw, "utf8");
console.log(`baked ${src} -> ${dest} (${raw.length} bytes)`);
