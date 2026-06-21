// Persist the tree canvas view ({ox, oy, scale}) across reloads, so entering the page restores
// where you last were instead of snapping back to the default zoom. parseView is the pure validator
// (separated so it's unit-testable and so a corrupt/old payload can never crash the canvas).

export type StoredView = { ox: number; oy: number; scale: number };

export const VIEW_KEY = "batch.tree.view";

export function parseView(raw: string | null): StoredView | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    const ok =
      v && typeof v === "object" && !Array.isArray(v) &&
      typeof v.ox === "number" && Number.isFinite(v.ox) &&
      typeof v.oy === "number" && Number.isFinite(v.oy) &&
      typeof v.scale === "number" && Number.isFinite(v.scale) && v.scale > 0;
    return ok ? { ox: v.ox, oy: v.oy, scale: v.scale } : null;
  } catch {
    return null;
  }
}

export function loadView(): StoredView | null {
  if (typeof window === "undefined") return null;
  try {
    return parseView(window.localStorage.getItem(VIEW_KEY));
  } catch {
    return null; // localStorage can throw (private mode / disabled)
  }
}

export function saveView(v: StoredView): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    /* quota / disabled — view persistence is best-effort */
  }
}
