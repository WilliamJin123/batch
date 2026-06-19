import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve the store path: $BATCH_DB if set, else ~/.batch/db.json. */
export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.BATCH_DB ?? join(homedir(), ".batch", "db.json");
}
