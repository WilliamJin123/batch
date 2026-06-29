import type { Pos } from "./graphLayout";
import type { BakeoffVM, BakeoffNote } from "../viewmodel/types";

/** Geometry for one bake-off's bracket, in scene coordinates. Two arms get a `pair` (curved bracket
 *  between the facing edges, pill in the gap); three+ arms get a `comb` — a horizontal `spine`
 *  floating above the row with a drop to each arm's top-centre, pill centred on the spine. */
export type Connector = {
  note: BakeoffNote;
  anchors: Array<{ x: number; y: number }>;        // attach point on each arm (a branch end)
  spine?: { x1: number; y1: number; x2: number };  // comb spine (N≥3); y1 is the spine's y, x1→x2 horizontal
  mx: number; my: number;                          // pill centre (on the spine for a comb)
};

// how far the comb spine floats above the row of arms — must stay < the layout's BRACKET_BAND so the
// spine + pill land inside the reserved whitespace and never overlap the cluster above.
const COMB_RISE = 34;

export function buildConnectors(bakeoffs: BakeoffVM[], pos: Map<string, Pos>): Connector[] {
  const out: Connector[] = [];
  for (const b of bakeoffs) {
    const ps = b.arms.map((id) => pos.get(id)).filter((p): p is Pos => !!p);
    if (ps.length < 2) continue;

    if (ps.length === 2) {
      // two arms: connect along whichever axis they're separated on (side-by-side → facing vertical
      // edges; stacked → facing horizontal edges), pill at the midpoint.
      const [a, bb] = ps;
      if (!a || !bb) continue; // length === 2 guarantees both; this narrows them for noUncheckedIndexedAccess
      const dx = Math.abs((a.x + a.w / 2) - (bb.x + bb.w / 2)), dy = Math.abs((a.y + a.h / 2) - (bb.y + bb.h / 2));
      let ax, ay, bx, by;
      if (dx >= dy) { const L = a.x <= bb.x ? a : bb, R = a.x <= bb.x ? bb : a; ax = L.x + L.w; ay = L.y + L.h / 2; bx = R.x; by = R.y + R.h / 2; }
      else { const U = a.y <= bb.y ? a : bb, D = a.y <= bb.y ? bb : a; ax = U.x + U.w / 2; ay = U.y + U.h; bx = D.x + D.w / 2; by = D.y; }
      out.push({ note: b.note, anchors: [{ x: ax, y: ay }, { x: bx, y: by }], mx: (ax + bx) / 2, my: (ay + by) / 2 });
      continue;
    }

    // three+ arms: a horizontal comb above the row. Anchor each arm at its top-centre; the spine
    // floats COMB_RISE above the highest arm and spans the outer arms' centres; pill centred on it.
    const tops = ps.map((p) => ({ x: p.x + p.w / 2, y: p.y }));
    const minX = Math.min(...tops.map((t) => t.x)), maxX = Math.max(...tops.map((t) => t.x));
    const spineY = Math.min(...ps.map((p) => p.y)) - COMB_RISE;
    out.push({ note: b.note, anchors: tops, spine: { x1: minX, y1: spineY, x2: maxX }, mx: (minX + maxX) / 2, my: spineY });
  }
  return out;
}
