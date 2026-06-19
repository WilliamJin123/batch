import dagre from "@dagrejs/dagre";
import type { TreeGraphVM } from "../viewmodel/types";

export interface Pos { x: number; y: number; w: number; h: number; }
const NODE_W = 200, NODE_H = 96;

/** Left→right DAG. Derive edges set rank (base on the left); compose edges pull sub-recipes
 *  near their composer. Pure + deterministic (no Math.random/Date). */
export function layoutGraph(g: Pick<TreeGraphVM, "nodes" | "edges">): Map<string, Pos> {
  const ids = new Set(g.nodes.map((n) => n.recipeId));
  const dg = new dagre.graphlib.Graph();
  dg.setGraph({ rankdir: "LR", nodesep: 48, ranksep: 130, marginx: 24, marginy: 24 });
  dg.setDefaultEdgeLabel(() => ({}));
  for (const n of g.nodes) dg.setNode(n.recipeId, { width: NODE_W, height: NODE_H });
  for (const e of g.edges) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue; // guard: never auto-create phantom nodes
    if (e.rel === "derives") dg.setEdge(e.to, e.from, { weight: 3 }); // base->variant for LR flow
    else dg.setEdge(e.from, e.to, { weight: 1, minlen: 1 });
  }
  dagre.layout(dg);
  const out = new Map<string, Pos>();
  for (const id of dg.nodes()) { const n = dg.node(id); out.set(id, { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2, w: NODE_W, h: NODE_H }); }
  return out;
}
