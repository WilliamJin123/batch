import { describe, it, expect } from "vitest";
import { summarizeFeedback, summarizeRecipe, currentVerdicts, latestFirst } from "../src/feedback.js";
import type { FeedbackEntry } from "../src/types.js";

// minimal entry builder; override any field via `p`
function entry(p: Partial<FeedbackEntry> & Pick<FeedbackEntry, "kind">): FeedbackEntry {
  const base = {
    id: "f", recipeId: "r1", versionId: "v1",
    date: "2026-06-01", author: "user" as const, createdAt: "2026-06-01T00:00:00.000Z",
  };
  return { ...base, ...p } as FeedbackEntry;
}

describe("latestFirst", () => {
  it("sorts by date desc then createdAt desc", () => {
    const a = entry({ kind: "to-make", id: "a", date: "2026-06-01", createdAt: "2026-06-01T01:00:00.000Z" });
    const b = entry({ kind: "to-make", id: "b", date: "2026-06-02", createdAt: "2026-06-02T00:00:00.000Z" });
    const c = entry({ kind: "to-make", id: "c", date: "2026-06-01", createdAt: "2026-06-01T05:00:00.000Z" });
    expect(latestFirst([a, b, c]).map((e) => e.id)).toEqual(["b", "c", "a"]);
  });
});

describe("summarizeRecipe", () => {
  it("untried + unqueued when empty", () => {
    expect(summarizeRecipe([])).toEqual({ tried: false, queued: false });
  });
  it("queued when the most-recent entry is to-make", () => {
    expect(summarizeRecipe([entry({ kind: "to-make", id: "a", date: "2026-06-03" })]))
      .toEqual({ tried: false, queued: true });
  });
  it("tried with a dish verdict; not queued once made is latest", () => {
    expect(summarizeRecipe([
      entry({ kind: "to-make", id: "a", date: "2026-06-01" }),
      entry({ kind: "made", id: "b", date: "2026-06-02", rating: "good" }),
    ])).toEqual({ tried: true, queued: false, verdict: "good" });
  });
  it("dish verdict ignores component-scoped made entries", () => {
    const s = summarizeRecipe([
      entry({ kind: "made", id: "b", date: "2026-06-02", rating: "good" }),
      entry({ kind: "made", id: "g", date: "2026-06-03", rating: "bad", componentKey: "sl-glaze" }),
    ]);
    expect(s.verdict).toBe("good"); // dish, not the glaze
    expect(s.queued).toBe(false);
  });
});

describe("currentVerdicts", () => {
  it("returns the newest made per scope (recency-supersede)", () => {
    const cv = currentVerdicts([
      entry({ kind: "made", id: "d", date: "2026-06-01", rating: "good" }),
      entry({ kind: "made", id: "g1", date: "2026-06-01", rating: "bad", componentKey: "sl-glaze" }),
      entry({ kind: "made", id: "g2", date: "2026-06-05", rating: "okay", componentKey: "sl-glaze" }),
    ]);
    expect(cv.dish?.rating).toBe("good");
    expect(cv.components["sl-glaze"]?.rating).toBe("okay");
  });
});

describe("summarizeFeedback", () => {
  it("groups by recipeId", () => {
    const out = summarizeFeedback([
      entry({ kind: "made", id: "a", recipeId: "r1", rating: "excellent" }),
      entry({ kind: "to-make", id: "b", recipeId: "r2", date: "2026-06-09" }),
    ]);
    expect(out["r1"]).toEqual({ tried: true, queued: false, verdict: "excellent" });
    expect(out["r2"]).toEqual({ tried: false, queued: true });
  });
});
