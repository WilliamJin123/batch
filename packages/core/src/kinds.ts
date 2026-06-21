import type { RecipeId, RecipeVersion, VersionId } from "./types.js";

export type RecipeKind = "root" | "base" | "variant" | "sub-recipe";

/**
 * Classify each recipe by its head version: `sub-recipe` (tagged `sub-recipe`), `variant` (derives
 * from a base), `base` (a root that something else derives from, or explicitly tagged `base`), else
 * `root`. `recipeIdOfVersion` resolves a derived-from version id to its recipe — pass the full
 * version→recipe map so a variant pinned to a non-head (old) base version still marks the base. Pure;
 * the single source of truth for "is this a base?", shared by the CLI `list --kind` and the web tree.
 */
export function classifyKinds(
  heads: RecipeVersion[],
  recipeIdOfVersion: Map<VersionId, RecipeId>,
): Map<RecipeId, RecipeKind> {
  const isBase = new Set<RecipeId>();
  for (const v of heads) {
    if (!v.derivesFromVersionId) continue;
    const baseRecipe = recipeIdOfVersion.get(v.derivesFromVersionId);
    if (baseRecipe) isBase.add(baseRecipe);
  }
  const out = new Map<RecipeId, RecipeKind>();
  for (const v of heads) {
    out.set(v.recipeId,
      v.tags.includes("sub-recipe") ? "sub-recipe"
        : v.derivesFromVersionId ? "variant"
          : isBase.has(v.recipeId) || v.tags.includes("base") ? "base"
            : "root");
  }
  return out;
}
