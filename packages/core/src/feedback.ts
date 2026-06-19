import type { ComponentKey, FeedbackEntry, Rating, RecipeId } from "./types.js";

export interface RecipeFeedbackSummary {
  tried: boolean;
  queued: boolean;
  verdict?: Rating; // latest dish-scoped `made` rating
}

type MadeEntry = Extract<FeedbackEntry, { kind: "made" }>;

export interface CurrentVerdicts {
  dish?: MadeEntry;
  components: Record<ComponentKey, MadeEntry>;
}

/** Newest first: by `date` desc, then `createdAt` desc (deterministic tiebreak). Pure — no mutation. */
export function latestFirst(entries: FeedbackEntry[]): FeedbackEntry[] {
  return [...entries].sort((a, b) =>
    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

/** Roll a single recipe's entries up to {tried, queued, verdict}. */
export function summarizeRecipe(entries: FeedbackEntry[]): RecipeFeedbackSummary {
  const sorted = latestFirst(entries);
  const tried = sorted.some((e) => e.kind === "made");
  const queued = sorted[0]?.kind === "to-make";
  const dish = sorted.find(
    (e): e is MadeEntry => e.kind === "made" && e.componentKey === undefined,
  );
  return { tried, queued, ...(dish?.rating ? { verdict: dish.rating } : {}) };
}

/** Group ALL entries by recipeId and summarize each. */
export function summarizeFeedback(entries: FeedbackEntry[]): Record<RecipeId, RecipeFeedbackSummary> {
  const byRecipe = new Map<RecipeId, FeedbackEntry[]>();
  for (const e of entries) {
    const list = byRecipe.get(e.recipeId) ?? [];
    list.push(e);
    byRecipe.set(e.recipeId, list);
  }
  const out: Record<RecipeId, RecipeFeedbackSummary> = {};
  for (const [recipeId, list] of byRecipe) out[recipeId] = summarizeRecipe(list);
  return out;
}

/** Most-recent `made` entry per scope (dish + each component) — the live verdicts. */
export function currentVerdicts(entries: FeedbackEntry[]): CurrentVerdicts {
  const made = latestFirst(entries).filter((e): e is MadeEntry => e.kind === "made");
  const dish = made.find((e) => e.componentKey === undefined);
  const components: Record<ComponentKey, MadeEntry> = {};
  for (const e of made) {
    if (e.componentKey === undefined) continue;
    if (!(e.componentKey in components)) components[e.componentKey] = e; // newest-first → first wins
  }
  return { ...(dish ? { dish } : {}), components };
}
