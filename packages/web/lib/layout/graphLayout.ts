import dagre from "@dagrejs/dagre";
import type { TreeGraphVM, TreeNodeVM } from "../viewmodel/types";

export interface Pos { x: number; y: number; w: number; h: number; }
const NODE_W = 200, SUB_W = 184;

/** Estimate a node's rendered height so dagre reserves enough vertical room.
 *  Nodes render content-tall (feedback notes wrap), so a fixed height made tall
 *  cards overlap their neighbours (e.g. Lemon's glaze note over Lucky Charms).
 *  Deterministic — no measurement, no Math.random/Date. */
function nodeDims(n: Pick<TreeNodeVM, "kind" | "name" | "feedbackNote" | "needsTuning">): { w: number; h: number } {
  if (n.kind === "sub-recipe") return { w: SUB_W, h: 90 };
  let h = 120; // role chip + 1-line name + 2-line meta + rating row
  if ((n.name ?? "").length > 22) h += 17; // long names wrap to a second line
  if (n.needsTuning) h += 8;
  if (n.feedbackNote) h += 20 + Math.ceil(n.feedbackNote.length / 28) * 18; // note wraps ~28 chars/line
  return { w: NODE_W, h };
}

/** Left→right DAG. Derive edges set rank (base on the left); compose edges pull sub-recipes
 *  near their composer. Bake-off arms are lifted into the same column so the pair reads as one
 *  comparison instead of one arm floating off in the rootless rank. Pure + deterministic. */
export function layoutGraph(g: Pick<TreeGraphVM, "nodes" | "edges"> & { bakeoffs?: TreeGraphVM["bakeoffs"] }): Map<string, Pos> {
  const ids = new Set(g.nodes.map((n) => n.recipeId));
  const dims = new Map(g.nodes.map((n) => [n.recipeId, nodeDims(n)]));

  const build = (affinity: Array<[string, string]>) => {
    const dg = new dagre.graphlib.Graph();
    dg.setGraph({ rankdir: "LR", nodesep: 44, ranksep: 150, marginx: 28, marginy: 28 });
    dg.setDefaultEdgeLabel(() => ({}));
    for (const n of g.nodes) { const d = dims.get(n.recipeId)!; dg.setNode(n.recipeId, { width: d.w, height: d.h }); }
    for (const e of g.edges) {
      if (!ids.has(e.from) || !ids.has(e.to)) continue; // guard: never auto-create phantom nodes
      if (e.rel === "derives") dg.setEdge(e.to, e.from, { weight: 3 }); // base->variant for LR flow
      else dg.setEdge(e.from, e.to, { weight: 1, minlen: 1 });
    }
    // affinity = [shallowerArm, deeperArm]: a high-weight edge in the natural rank direction
    // pulls the two arms to the same vertical level (short bracket) without disturbing ranks.
    for (const [u, v] of affinity) dg.setEdge(u, v, { weight: 8 });
    dagre.layout(dg);
    return dg;
  };

  // pass 1: natural ranks → in LR, larger x = deeper rank
  let dg = build([]);
  const affinity: Array<[string, string]> = [];
  for (const bo of g.bakeoffs ?? []) {
    if (!ids.has(bo.a) || !ids.has(bo.b)) continue;
    affinity.push(dg.node(bo.a).x <= dg.node(bo.b).x ? [bo.a, bo.b] : [bo.b, bo.a]); // [shallower, deeper]
  }
  // pass 2: re-rank with the deeper→shallower affinity so both arms share a column
  if (affinity.length) dg = build(affinity);

  const out = new Map<string, Pos>();
  for (const id of dg.nodes()) { const n = dg.node(id), d = dims.get(id)!; out.set(id, { x: n.x - d.w / 2, y: n.y - d.h / 2, w: d.w, h: d.h }); }
  return out;
}
