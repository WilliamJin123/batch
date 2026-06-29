import { loadDb } from "../../../lib/source/db";
import { StaticRecipeSource } from "../../../lib/source/StaticRecipeSource";

// One static JSON per recipe card, prerendered at build (one file per id) and fetched lazily when the
// tree opens a card — so the tree page no longer ships every card's full BakeCardVM to every visitor.
export const dynamic = "force-static";
export const dynamicParams = false; // only the enumerated recipe ids exist; anything else 404s

// Build calls generateStaticParams once + GET once per recipe; memoize so the 19MB db.json parses once.
let srcPromise: Promise<StaticRecipeSource> | undefined;
const getSource = () => (srcPromise ??= loadDb().then((db) => StaticRecipeSource.fromDb(db)));

export async function generateStaticParams() {
  const src = await getSource();
  return (await src.listRecipes()).map((r) => ({ recipeId: r.recipeId }));
}

export async function GET(_req: Request, { params }: { params: { recipeId: string } }) {
  const src = await getSource();
  return Response.json(await src.getBakeCard(params.recipeId));
}
