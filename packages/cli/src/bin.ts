#!/usr/bin/env node
import { run } from "./cli.js";

run(process.argv.slice(2)).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(JSON.stringify({ error: message }, null, 2) + "\n");
  process.exit(1);
});
