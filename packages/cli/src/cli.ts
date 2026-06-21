import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { RecipeService, realDeps } from "@batch/core";
import type { OverrideEntry } from "@batch/core";
import { FileRepository } from "./file-repository.js";
import { resolveDbPath } from "./db-path.js";
import { renderHuman } from "./format.js";
import * as cmd from "./commands.js";

function makeService(): RecipeService {
  return new RecipeService(new FileRepository(resolveDbPath()), realDeps());
}

let outputMode: "json" | "human" | "auto" = "auto";

/**
 * Emit a command result. Strings (e.g. an export card) print raw. Otherwise emit
 * JSON when forced with --json or when stdout is piped (so `… | jq` keeps working),
 * and scannable human text when run in a terminal or forced with --human.
 */
function out(value: unknown): void {
  if (typeof value === "string") { process.stdout.write(value + "\n"); return; }
  const asJson = outputMode === "json" || (outputMode === "auto" && !process.stdout.isTTY);
  // `value ?? null` keeps the piped stream valid JSON — JSON.stringify(undefined) yields
  // the bare token `undefined`, which would break a downstream `| jq`.
  process.stdout.write((asJson ? JSON.stringify(value ?? null, null, 2) : renderHuman(value)) + "\n");
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
  // Reading output through `| head`/`| less` closes our pipe early; exit quietly instead of an EPIPE stack trace.
  process.stdout.on("error", (e: NodeJS.ErrnoException) => { if (e.code === "EPIPE") process.exit(0); });

  const program = new Command();
  program.name("batch").description("git for recipes — versioned recipe substrate").version("0.0.0");
  program.option("--json", "force JSON output (the default when piped)");
  program.option("--human", "force human-readable output (the default in a terminal)");
  program.hook("preAction", () => {
    const o = program.opts();
    outputMode = o.json ? "json" : o.human ? "human" : "auto";
  });

  program.command("init")
    .description("show the store path (created lazily on first write)")
    .action(() => out({ db: resolveDbPath() }));

  program.command("create")
    .description("create a recipe from JSON ({name,yield,content,...}) on stdin or --file")
    .option("-f, --file <path>", "read input JSON from a file instead of stdin")
    .option("--parents <csv>", "comma-separated source version ids this recipe was amalgamated from (CM-7)")
    .option("--rationale <text>", "why these sources were blended into this champion")
    .action(async (opts) => {
      const input = await readJson(opts.file);
      if (opts.parents) input.parents = String(opts.parents).split(",").map((p: string) => p.trim()).filter(Boolean);
      if (opts.rationale) input.rationale = opts.rationale;
      out(await cmd.create(makeService(), input));
    });

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
    .description("show a version with its recipe content (flattened by default; --structure keeps sub-recipe pins)")
    .option("--structure", "show the stored composed content (sub-recipe pins + staleness) instead of the flattened card")
    .action(async (versionId, opts) => out(await cmd.show(makeService(), versionId, { structure: opts.structure })));

  program.command("resolve <versionId>")
    .description("print only the resolved RecipeContent (flattened by default; --structure keeps sub-recipe pins)")
    .option("--structure", "print the stored composed content instead of the flattened card")
    .action(async (versionId, opts) => out(await cmd.resolve(makeService(), versionId, { structure: opts.structure })));

  program.command("scale <versionId>")
    .description("scale quantities to a target yield amount")
    .requiredOption("--to <n>", "target yield amount", parseFloat)
    .action(async (versionId, opts) => out(await cmd.scale(makeService(), versionId, opts.to)));

  program.command("history <versionId>")
    .description("walk the version history newest-first")
    .action(async (versionId) => out(await cmd.history(makeService(), versionId)));

  program.command("list")
    .description("list all recipes by head version")
    .option("--to-make", "only recipes queued to make (untried experiments)")
    .option("--tag <tag>", "only recipes carrying this tag")
    .option("--name <substr>", "only recipes whose name contains this substring (case-insensitive)")
    .option("--kind <kind>", "only recipes of this kind: root | base | variant | sub-recipe")
    .action(async (opts) => out(await cmd.list(makeService(), { toMake: opts.toMake, tag: opts.tag, name: opts.name, kind: opts.kind })));

  program.command("tree")
    .description("list all versions with their derivation/history edges")
    .action(async () => out(await cmd.tree(makeService())));

  program.command("compare <versions...>")
    .description("align ≥2 versions side by side: ingredient matrix (by ingredient id) + macros + verdicts")
    .action(async (versions) => out(await cmd.compare(makeService(), versions)));

  program.command("rebase <versionId>")
    .description("re-point a variant onto an improved base (--onto), or propagate a base to all its variants (--all-variants)")
    .option("--onto <baseVersionId>", "the improved base version to rebase the variant onto")
    .option("--all-variants", "treat <versionId> as a base and rebase all of its variants onto its head")
    .option("-m, --message <msg>", "commit message")
    .action(async (versionId, opts) => {
      if (opts.allVariants && opts.onto) throw new Error("--all-variants and --onto are mutually exclusive");
      if (opts.allVariants) { out(await cmd.rebaseAll(makeService(), versionId, opts.message)); return; }
      if (!opts.onto) throw new Error("specify --onto <baseVersionId> or --all-variants");
      out(await cmd.rebase(makeService(), { variantVersionId: versionId, ontoVersionId: opts.onto, message: opts.message }));
    });

  program.command("promote <targetVersionId>")
    .description("bake winning component(s) from a source version into a target base (a slot pulls its usages)")
    .requiredOption("--from <sourceVersionId>", "the version to lift the winning component(s) from")
    .requiredOption("--component <csv>", "comma-separated component keys to promote")
    .option("-m, --message <msg>", "commit message")
    .action(async (targetVersionId, opts) => out(await cmd.promote(makeService(), {
      targetVersionId, sourceVersionId: opts.from,
      componentKeys: String(opts.component).split(",").map((c: string) => c.trim()).filter(Boolean),
      message: opts.message,
    })));

  const ingredient = program.command("ingredient").description("manage library ingredients (macros + densities)");
  ingredient.command("add")
    .description("add/update a library ingredient from JSON ({name,macrosPer100g,densityGPerMl?,unitEquivalences?,...}) on stdin or --file")
    .option("-f, --file <path>", "read input JSON from a file instead of stdin")
    .action(async (opts) => out(await cmd.ingredientAdd(makeService(), await readJson(opts.file))));
  ingredient.command("list")
    .description("list all library ingredients")
    .action(async () => out(await cmd.ingredientList(makeService())));
  ingredient.command("show <ref>")
    .description("show one library ingredient by id, name, or alias")
    .action(async (ref) => out(await cmd.ingredientShow(makeService(), ref)));

  program.command("macros <ref>")
    .description("show the computed macro snapshot (total + per-serving + cal/g-protein ratio); --by-section breaks it down")
    .option("--by-section", "break the totals down by recipe section (crust / filling / toppings / sub-recipes)")
    .action(async (ref, opts) => out(opts.bySection
      ? await cmd.macrosBySection(makeService(), ref)
      : await cmd.macros(makeService(), ref)));

  program.command("export <ref>")
    .description("render a recipe as a phone-readable markdown bake card (--format json for the machine view)")
    .option("--format <fmt>", "md | json", "md")
    .action(async (ref, opts) => out(await cmd.exportRecipe(makeService(), ref, { format: opts.format === "json" ? "json" : "md" })));

  program.command("recompute <ref>")
    .description("recompute macros against the current library → new version (author=system)")
    .action(async (ref) => out(await cmd.recompute(makeService(), ref)));

  program.command("dump")
    .description("regenerate declarative sources FROM the store (roots, variant manifests, ingredients, feedback, manifest)")
    .option("--out <dir>", "write the files into this directory (default: print the whole file set as JSON)")
    .action(async (opts) => {
      const result = await cmd.dump(makeService());
      if (!opts.out) { out({ files: result.files }); return; }
      await mkdir(opts.out, { recursive: true });
      for (const f of result.files) await writeFile(join(opts.out, f.path), JSON.stringify(f.json, null, 2) + "\n");
      out({ out: opts.out, files: result.files.length, recipes: result.recipes, ingredients: result.ingredients, feedback: result.feedback });
    });

  program.command("import <dir>")
    .description("rebuild the store from a dumped sources directory (ingredients → recipes in dependency order → feedback)")
    .action(async (dir) => {
      const names = (await readdir(dir)).filter((n) => n.endsWith(".json"));
      const files = await Promise.all(names.map(async (path) => ({ path, json: JSON.parse(await readFile(join(dir, path), "utf8")) })));
      out(await cmd.importDump(makeService(), files));
    });

  const feedback = program.command("feedback")
    .description("record and inspect tasting feedback (to-make intent, made outcomes)");
  feedback.command("add <versionId>")
    .description("append a feedback entry: --made (with --rating) or --to-make")
    .option("--made", "record an outcome (you baked it)")
    .option("--to-make", "queue it as something you want to make")
    .option("--rating <r>", "bad | okay | good | excellent (only with --made)")
    .option("--component <key>", "target a component within the version (e.g. sl-glaze)")
    .option("-m, --message <text>", "notes")
    .option("--date <YYYY-MM-DD>", "when you baked/queued it (defaults to now)")
    .action(async (versionId, opts) => {
      if (Boolean(opts.made) === Boolean(opts.toMake)) {
        throw new Error("specify exactly one of --made or --to-make");
      }
      const kind = opts.made ? "made" : "to-make";
      if (opts.rating && kind !== "made") throw new Error("--rating only applies to --made");
      out(await cmd.feedback(makeService(), {
        versionId, kind,
        rating: opts.rating, component: opts.component, notes: opts.message,
        date: opts.date ? new Date(`${opts.date}T12:00:00.000Z`).toISOString() : undefined,
      }));
    });
  feedback.command("list <versionId>")
    .description("show the tasting log for a version's recipe (current verdicts + history)")
    .action(async (versionId) => out(await cmd.feedbackList(makeService(), versionId)));
  feedback.command("rm <id>")
    .description("hard-delete a feedback entry (for genuine mistakes, not superseding)")
    .action(async (id) => { await cmd.feedbackRemove(makeService(), id); out({ removed: id }); });

  await program.parseAsync(argv, { from: "user" });
}
