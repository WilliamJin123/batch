import { describe, it, expect, beforeEach } from "vitest";
import { parseView, loadView, saveView, VIEW_KEY } from "./viewState";

describe("viewState", () => {
  // jsdom's bundled localStorage is a non-functional stub here; install a faithful Map-backed
  // Storage so we exercise our load/save logic against the real getItem/setItem contract.
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
        key: (i: number) => [...store.keys()][i] ?? null,
        get length() { return store.size; },
      },
    });
  });

  it("parses a well-formed view", () => {
    expect(parseView(JSON.stringify({ ox: 40, oy: -12, scale: 0.8 }))).toEqual({ ox: 40, oy: -12, scale: 0.8 });
  });

  it("rejects null / empty / non-JSON", () => {
    expect(parseView(null)).toBeNull();
    expect(parseView("")).toBeNull();
    expect(parseView("{not json")).toBeNull();
  });

  it("rejects malformed shapes (missing key, non-finite, non-positive scale)", () => {
    expect(parseView(JSON.stringify({ ox: 1, oy: 2 }))).toBeNull();              // no scale
    expect(parseView(JSON.stringify({ ox: 1, oy: 2, scale: "1" }))).toBeNull();  // wrong type
    expect(parseView(JSON.stringify({ ox: NaN, oy: 2, scale: 1 }))).toBeNull();  // NaN (serializes to null, caught)
    expect(parseView(JSON.stringify({ ox: 1, oy: 2, scale: 0 }))).toBeNull();    // scale must be > 0
    expect(parseView(JSON.stringify({ ox: 1, oy: 2, scale: -0.5 }))).toBeNull();
    expect(parseView(JSON.stringify([1, 2, 3]))).toBeNull();
  });

  it("round-trips through saveView / loadView", () => {
    const v = { ox: 24, oy: 8, scale: 1.3 };
    saveView(v);
    expect(window.localStorage.getItem(VIEW_KEY)).not.toBeNull();
    expect(loadView()).toEqual(v);
  });

  it("loadView returns null when nothing is stored", () => {
    expect(loadView()).toBeNull();
  });
});
