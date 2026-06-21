import { loadDb } from "../../lib/source/db";
import { StaticRecipeSource } from "../../lib/source/StaticRecipeSource";
import { buildQueue } from "../../lib/viewmodel/queue";
import { QueueBoard } from "../../components/queue/QueueBoard";

export const metadata = { title: "Cooking queue · Batch" };

export default async function Page() {
  const src = await StaticRecipeSource.fromDb(await loadDb());
  const graph = await src.getTreeGraph();
  return <QueueBoard queue={buildQueue(graph.nodes)} />;
}
