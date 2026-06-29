import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.js";

// Drives the CLI through its real commander wiring (arg parsing, --file reading, JSON output) against
// a throwaway file store — the layer commands.test.ts skips by calling the command fns directly.
let dir: string;
let writes: string[];
let fileN: number;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "batch-cli-"));
  process.env.BATCH_DB = join(dir, "db.json");
  writes = [];
  fileN = 0;
  vi.spyOn(process.stdout, "write").mockImplementation(((c: unknown) => { writes.push(String(c)); return true; }) as never);
});
afterEach(async () => {
  vi.restoreAllMocks();
  process.stdout.removeAllListeners("error"); // run() attaches an EPIPE guard each call
  delete process.env.BATCH_DB;
  await rm(dir, { recursive: true, force: true });
});

const lastJson = () => JSON.parse(writes.filter((w) => w.trim()).at(-1)!);
async function tmpFile(obj: unknown): Promise<string> {
  const p = join(dir, `in-${fileN++}.json`);
  await writeFile(p, JSON.stringify(obj));
  return p;
}

describe("cli arg parsing + wiring", () => {
  it("feedback add requires exactly one of --made / --to-make", async () => {
    await expect(run(["feedback", "add", "v1"])).rejects.toThrow(/exactly one/i);
    await expect(run(["feedback", "add", "v1", "--made", "--to-make"])).rejects.toThrow(/exactly one/i);
  });

  it("feedback --rating only applies to --made", async () => {
    await expect(run(["feedback", "add", "v1", "--to-make", "--rating", "good"])).rejects.toThrow(/--rating only/i);
  });

  it("create (--file) then list round-trips through the real store", async () => {
    const recipe = {
      name: "Test Bar",
      yield: { amount: 4, unit: "squares" },
      content: { steps: [{ componentKey: "s1", order: 1, instructionText: "Mix" }], slots: [], usages: [] },
    };
    await run(["--json", "create", "--file", await tmpFile(recipe)]);
    expect(lastJson().recipe?.id).toBeTruthy();

    writes.length = 0;
    await run(["--json", "list"]);
    const list = lastJson();
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((r: { name: string }) => r.name === "Test Bar")).toBe(true);
  });
});
