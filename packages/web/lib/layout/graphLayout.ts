import dagre from "@dagrejs/dagre";
import type { TreeGraphVM, TreeNodeVM } from "../viewmodel/types";

export interface Pos { x: number; y: number; w: number; h: number; }
const NODE_W = 200, SUB_W = 184;
const COMP_GAP = 64;     // space between packed clusters
const ASPECT = 1.35;     // target width:height of the packed block (>1 = slightly wide, for widescreen)

/** Estimate a node's rendered height so dagre reserves enough vertical room.
 *  Nodes render content-tall (feedback notes wrap), so a fixed height made tall
 *  cards overlap their neighbours (e.g. Lemon's glaze note over Lucky Charms).
 *  Deterministic — no measurement, no Math.random/Date. */
function nodeDims(n: Pick<TreeNodeVM, "kind" | "name" | "feedbackNote" | "needsTuning" | "servings">): { w: number; h: number } {
  if (n.kind === "sub-recipe") return { w: SUB_W, h: 110 };
  let h = 140; // role chip + 1-line name + 2-line meta + rating row (+ headroom for the larger zoomed-out type)
  if ((n.servings ?? 1) > 1) h += 16; // extra whole-batch "total" macro line
  if ((n.name ?? "").length > 22) h += 17; // long names wrap to a second line
  if (n.needsTuning) h += 8;
  if (n.feedbackNote) h += 20 + Math.ceil(n.feedbackNote.length / 28) * 18; // note wraps ~28 chars/line
  return { w: NODE_W, h };
}

/** Lay out one connected cluster left→right with dagre and return node positions
 *  (origin-normalised to 0,0) plus the cluster's bounding box. Derive edges set rank
 *  (base on the left); compose edges pull sub-recipes near their composer; a bake-off
 *  affinity edge lifts the two arms into the same column so the bracket reads short. */
function layoutCluster(
  nodes: TreeNodeVM[],
  edges: TreeGraphVM["edges"],
  dims: Map<string, { w: number; h: number }>,
  bakeoffs: TreeGraphVM["bakeoffs"] | undefined,
): { pos: Map<string, Pos>; w: number; h: number } {
  const ids = new Set(nodes.map((n) => n.recipeId));
  const build = (affinity: Array<[string, string]>) => {
    const dg = new dagre.graphlib.Graph();
    dg.setGraph({ rankdir: "LR", nodesep: 40, ranksep: 140, marginx: 6, marginy: 6 });
    dg.setDefaultEdgeLabel(() => ({}));
    for (const n of nodes) { const d = dims.get(n.recipeId)!; dg.setNode(n.recipeId, { width: d.w, height: d.h }); }
    for (const e of edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) continue;
      if (e.rel === "derives") dg.setEdge(e.to, e.from, { weight: 3 }); // base->variant for LR flow
      else dg.setEdge(e.from, e.to, { weight: 1, minlen: 1 });
    }
    for (const [u, v] of affinity) dg.setEdge(u, v, { weight: 8 }); // co-locate bake-off arms
    dagre.layout(dg);
    return dg;
  };

  // two-pass only matters when this cluster owns a bake-off (else affinity is empty)
  let dg = build([]);
  const affinity: Array<[string, string]> = [];
  for (const bo of bakeoffs ?? []) {
    if (!ids.has(bo.a) || !ids.has(bo.b)) continue;
    affinity.push(dg.node(bo.a).x <= dg.node(bo.b).x ? [bo.a, bo.b] : [bo.b, bo.a]);
  }
  if (affinity.length) dg = build(affinity);

  // collect raw positions, then shift so the cluster starts at (0,0)
  const raw = new Map<string, Pos>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of dg.nodes()) {
    const n = dg.node(id), d = dims.get(id)!;
    const x = n.x - d.w / 2, y = n.y - d.h / 2;
    raw.set(id, { x, y, w: d.w, h: d.h });
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + d.w); maxY = Math.max(maxY, y + d.h);
  }
  const pos = new Map<string, Pos>();
  for (const [id, p] of raw) pos.set(id, { ...p, x: p.x - minX, y: p.y - minY });
  return { pos, w: maxX - minX, h: maxY - minY };
}

/** Build the forest, then SHELF-PACK clusters into a square-ish block. Every base + every
 *  single recipe used to share dagre rank 0, so the left column grew unbounded-tall as recipes
 *  were added. Instead each connected family (and each single) is laid out on its own and the
 *  boxes are packed left→right / wrap-down toward a target aspect — bounded growth, balanced
 *  shape. Pure + deterministic (stable component + shelf ordering; no Math.random/Date). */
export function layoutGraph(g: Pick<TreeGraphVM, "nodes" | "edges"> & { bakeoffs?: TreeGraphVM["bakeoffs"] }): Map<string, Pos> {
  const ids = new Set(g.nodes.map((n) => n.recipeId));
  const dims = new Map(g.nodes.map((n) => [n.recipeId, nodeDims(n)] as const));

  // union-find over derive + compose + bake-off links → connected clusters
  const parent = new Map<string, string>(g.nodes.map((n) => [n.recipeId, n.recipeId] as const));
  const find = (x: string): string => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const e of g.edges) if (ids.has(e.from) && ids.has(e.to)) union(e.from, e.to);
  for (const bo of g.bakeoffs ?? []) if (ids.has(bo.a) && ids.has(bo.b)) union(bo.a, bo.b);

  const clusters = new Map<string, TreeNodeVM[]>();
  for (const n of g.nodes) { const r = find(n.recipeId); (clusters.get(r) ?? clusters.set(r, []).get(r)!).push(n); }

  // lay out each cluster independently; key each by a stable representative id for deterministic ordering
  const boxes = [...clusters.entries()].map(([rep, nodes]) => ({
    rep,
    ...layoutCluster(nodes, g.edges, dims, g.bakeoffs),
  }));
  boxes.sort((a, b) => b.h - a.h || b.w - a.w || (a.rep < b.rep ? -1 : 1)); // tallest-first, stable

  // shelf-pack tallest-first into rows bounded by a target width. A target derived only from total
  // area packs poorly when a few clusters are much larger than the rest (the big families can't share
  // a row and stack tall). So SEARCH the row width that lands the packed block closest to ASPECT —
  // adaptive and deterministic, robust to any cluster-size mix.
  const packAt = (targetW: number) => {
    let curX = 0, curY = 0, shelfH = 0, W = 0, H = 0;
    const origins: Array<{ i: number; x: number; y: number }> = [];
    boxes.forEach((box, i) => {
      if (curX > 0 && curX + box.w > targetW) { curX = 0; curY += shelfH + COMP_GAP; shelfH = 0; } // wrap shelf
      origins.push({ i, x: curX, y: curY });
      curX += box.w + COMP_GAP; shelfH = Math.max(shelfH, box.h);
      W = Math.max(W, curX - COMP_GAP); H = Math.max(H, curY + box.h);
    });
    return { origins, W, H };
  };
  const maxW = Math.max(...boxes.map((b) => b.w));
  const sumW = boxes.reduce((s, b) => s + b.w + COMP_GAP, 0);
  let best = maxW, bestErr = Infinity;
  for (let i = 0; i <= 32; i++) {
    const targetW = maxW + ((sumW - maxW) * i) / 32;
    const { W, H } = packAt(targetW);
    const err = Math.abs(W / H - ASPECT);
    if (err < bestErr - 1e-9) { bestErr = err; best = targetW; }
  }

  const out = new Map<string, Pos>();
  for (const o of packAt(best).origins) {
    for (const [id, p] of boxes[o.i].pos) out.set(id, { ...p, x: p.x + o.x, y: p.y + o.y });
  }
  return out;
}
