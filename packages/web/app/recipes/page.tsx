import { loadDb } from "../../lib/source/db";
import { StaticRecipeSource } from "../../lib/source/StaticRecipeSource";
import { IndexTable } from "../../components/IndexTable";

export default async function Page() {
  const src = await StaticRecipeSource.fromDb(await loadDb());
  const rows = (await src.listRecipes()).slice().sort((a, b) => a.name.localeCompare(b.name));
  return <main><IndexTable rows={rows} /></main>;
}
