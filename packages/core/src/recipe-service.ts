import type {
  Author, Recipe, RecipeContent, RecipeVersion, VersionId, Yield,
} from "./types.js";
import type { Repository } from "./repository.js";
import type { Deps } from "./deps.js";

export class RecipeService {
  constructor(private repo: Repository, private deps: Deps) {}

  async getVersion(id: VersionId): Promise<RecipeVersion> {
    const v = await this.repo.getVersion(id);
    if (!v) throw new Error(`version not found: ${id}`);
    return v;
  }

  async resolve(id: VersionId): Promise<RecipeContent> {
    return (await this.getVersion(id)).content;
  }

  async createRecipe(input: {
    name: string;
    description?: string;
    tags?: string[];
    yield: Yield;
    content: RecipeContent;
    author?: Author;
    commitMessage?: string;
  }): Promise<{ recipe: Recipe; version: RecipeVersion }> {
    const recipeId = this.deps.newId();
    const versionId = this.deps.newId();
    const now = this.deps.now();
    const author = input.author ?? "user";

    const version: RecipeVersion = {
      id: versionId,
      recipeId,
      name: input.name,
      description: input.description,
      tags: input.tags ?? [],
      yield: input.yield,
      status: "draft",
      author,
      commitMessage: input.commitMessage ?? "create recipe",
      content: structuredClone(input.content),
      createdAt: now,
    };
    const recipe: Recipe = { id: recipeId, createdBy: author, createdAt: now, headVersionId: versionId };

    await this.repo.saveRecipe(recipe);
    await this.repo.saveVersion(version);
    return { recipe, version };
  }
}
