import { describe, it, expect } from "vitest";
import { RecipeService } from "../src/recipe-service.js";
import { InMemoryRepository } from "../src/in-memory-repository.js";
import { testDeps } from "../src/deps.js";

const svc = () => new RecipeService(new InMemoryRepository(), testDeps());

describe("getIngredientRef", () => {
  it("resolves by exact id, then by case-insensitive name or alias", async () => {
    const s = svc();
    await s.addIngredient({
      id: "ing-white-sugar", name: "White Sugar", aliases: ["caster sugar"],
      macrosPer100g: { calories: 387, protein: 0, carbs: 100, fat: 0, fiber: 0 },
    });
    expect((await s.getIngredientRef("ing-white-sugar")).name).toBe("White Sugar");
    expect((await s.getIngredientRef("white sugar")).id).toBe("ing-white-sugar");
    expect((await s.getIngredientRef("Caster Sugar")).id).toBe("ing-white-sugar");
  });

  it("throws when nothing matches", async () => {
    await expect(svc().getIngredientRef("unobtainium")).rejects.toThrow(/no ingredient matches/i);
  });
});
