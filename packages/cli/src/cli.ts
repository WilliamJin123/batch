import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { RecipeService, realDeps } from "@batch/core";
import type { OverrideEntry } from "@batch/core";
import { FileRepository } from "./file-repository.js";
import { resolveDbPath } from "./db-path.js";
import * as cmd from "./commands.js";

function makeService(): RecipeService {
  return new RecipeService(new FileRepository(resolveDbPath()), realDeps());
}

function out(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

async function readJson(file?: string): Promise<any> {
  const raw = file ? await readFile(file, "utf8") : await readStdin();
  if (!raw.trim()) throw new Error("expected JSON on stdin or via --file");
  return JSON.parse(raw);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

export async function run(argv: string[]): Promise<void> {
  const program = new Command();
  program.name("batch").description("git for recipes — versioned recipe substrate").version("0.0.0");

  program.command("init")
    .description("show the store path (created lazily on first write)")
    .action(() => out({ db: resolveDbPath() }));

  program.command("create")
    .description("create a recipe from JSON ({name,yield,content,...}) on stdin or --file")
    .option("-f, --file <path>", "read input JSON from a file instead of stdin")
    .action(async (opts) => out(await cmd.create(makeService(), await readJson(opts.file))));

  program.command("derive <baseVersionId>")
    .description("fork a variant off a base version")
    .requiredOption("-n, --name <name>", "name for the new variant")
    .option("-m, --message <msg>", "commit message")
    .action(async (baseVersionId, opts) =>
      out(await cmd.derive(makeService(), { baseVersionId, name: opts.name, commitMessage: opts.message })));

  program.command("override <versionId>")
    .description("apply one override entry (JSON on stdin or --file) to a base or variant")
    .option("-f, --file <path>", "read the override entry JSON from a file")
    .option("-m, --message <msg>", "commit message")
    .action(async (versionId, opts) => {
      const entry = (await readJson(opts.file)) as OverrideEntry;
      out(await cmd.override(makeService(), { versionId, entry, message: opts.message }));
    });

  program.command("edit <versionId>")
    .description("edit version metadata (name/description/status/tags/yield)")
    .option("-n, --name <name>")
    .option("-d, --description <text>")
    .option("-s, --status <status>", "draft | approved | rejected")
    .option("-t, --tags <csv>", "comma-separated tags")
    .option("--yield-amount <n>", "yield amount", parseFloat)
    .option("--yield-unit <unit>", "yield unit")
    .option("-m, --message <msg>", "commit message")
    .action(async (versionId, opts) => {
      const patch: cmd.EditPatch = {};
      if (opts.name !== undefined) patch.name = opts.name;
      if (opts.description !== undefined) patch.description = opts.description;
      if (opts.status !== undefined) patch.status = opts.status;
      if (opts.tags !== undefined) patch.tags = String(opts.tags).split(",").map((t) => t.trim()).filter(Boolean);
      if (opts.yieldAmount !== undefined && opts.yieldUnit !== undefined) {
        patch.yield = { amount: opts.yieldAmount, unit: opts.yieldUnit };
      }
      out(await cmd.edit(makeService(), { versionId, patch, message: opts.message }));
    });

  program.command("show <versionId>")
    .description("show a version with its resolved content")
    .action(async (versionId) => out(await cmd.show(makeService(), versionId)));

  program.command("resolve <versionId>")
    .description("print only the resolved RecipeContent")
    .action(async (versionId) => out(await cmd.resolve(makeService(), versionId)));

  program.command("scale <versionId>")
    .description("scale quantities to a target yield amount")
    .requiredOption("--to <n>", "target yield amount", parseFloat)
    .action(async (versionId, opts) => out(await cmd.scale(makeService(), versionId, opts.to)));

  program.command("history <versionId>")
    .description("walk the version history newest-first")
    .action(async (versionId) => out(await cmd.history(makeService(), versionId)));

  program.command("list")
    .description("list all recipes by head version")
    .action(async () => out(await cmd.list(makeService())));

  program.command("tree")
    .description("list all versions with their derivation/history edges")
    .action(async () => out(await cmd.tree(makeService())));

  await program.parseAsync(argv, { from: "user" });
}
