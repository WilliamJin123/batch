import { loadDb } from "../lib/source/db";
import { StaticRecipeSource } from "../lib/source/StaticRecipeSource";
import { layoutGraph } from "../lib/layout/graphLayout";
import { TreeView } from "../components/tree/TreeView";

export default async function Page() {
  const src = await StaticRecipeSource.fromDb(await loadDb());
  const graph = await src.getTreeGraph();
  const posMap = layoutGraph(graph);
  const pos = Object.fromEntries(posMap);
  const vals = [...posMap.values()];
  const width = Math.max(...vals.map((p) => p.x + p.w), 400) + 40;
  const height = Math.max(...vals.map((p) => p.y + p.h), 300) + 40;
  return <main><TreeView graph={graph} pos={pos} width={width} height={height} /></main>;
}
