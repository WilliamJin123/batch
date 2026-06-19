import { describe, it, expect } from "vitest";
import fixture from "../../test/fixtures/db.fixture.json";
import { StaticRecipeSource } from "./StaticRecipeSource";

const src = () => StaticRecipeSource.fromDb(fixture as any);

describe("StaticRecipeSource", () => {
  it("lists every recipe with a family and a kind", async () => {
    const list = await (await src()).listRecipes();
    expect(list.length).toBe(Object.keys((fixture as any).recipes).length);
    expect(list.every((r) => r.family && r.kind)).toBe(true);
  });
  it("does not expose write methods in v1", async () => {
    const s: any = await src();
    expect(typeof s.applyOverride).toBe("undefined");
    expect(typeof s.addFeedback).toBe("undefined");
  });
});
