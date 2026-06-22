import type { TreeNodeVM } from "./types";

export interface QueueItemVM {
  recipeId: string;
  name: string;
  family: string;
  cal: number;
  calPerGramProtein: number | null;
  servings: number;
  servingUnit: string;
  noBake: boolean;
  produce: string | null;
  rating?: "bad" | "okay" | "good" | "excellent";
}
export interface QueueLaneVM { bake: QueueItemVM[]; noBake: QueueItemVM[]; }
export interface QueueVM { makeNext: QueueLaneVM; makeAgain: QueueLaneVM; }

// Perishable produce to use up first, in the user's stated priority order — the index is the sort
// rank (apple before carrot before lemon…). Matched as a substring of the recipe name + its tags.
const PRODUCE = ["apple", "carrot", "lemon", "banana", "blueberr"];
const PRODUCE_LABEL: Record<string, string> = { carrot: "carrot", lemon: "lemon", apple: "apple", banana: "banana", blueberr: "blueberry" };

function produceOf(n: TreeNodeVM): { key: string | null; rank: number } {
  const hay = (n.name + " " + n.tags.join(" ")).toLowerCase();
  for (let i = 0; i < PRODUCE.length; i++) if (hay.includes(PRODUCE[i])) return { key: PRODUCE_LABEL[PRODUCE[i]], rank: i };
  return { key: null, rank: PRODUCE.length };
}

const isNoBake = (n: TreeNodeVM) => n.tags.includes("no-bake");

function toItem(n: TreeNodeVM): QueueItemVM {
  return {
    recipeId: n.recipeId, name: n.name, family: n.family, cal: n.cal,
    calPerGramProtein: n.calPerGramProtein, servings: n.servings, servingUnit: n.servingUnit,
    noBake: isNoBake(n), produce: produceOf(n).key, rating: n.rating,
  };
}

// the house recommendation order: produce-first (rank asc), then leanest cal/g-protein ratio (asc,
// a missing ratio sorts last), then name for a stable tiebreak
function ordered(nodes: TreeNodeVM[]): QueueItemVM[] {
  return [...nodes]
    .sort((a, b) => {
      const pr = produceOf(a).rank - produceOf(b).rank;
      if (pr) return pr;
      const ra = a.calPerGramProtein ?? Infinity, rb = b.calPerGramProtein ?? Infinity;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    })
    .map(toItem);
}

function lane(nodes: TreeNodeVM[]): QueueLaneVM {
  return { bake: ordered(nodes.filter((n) => !isNoBake(n))), noBake: ordered(nodes.filter(isNoBake)) };
}

/** The "Make next" planning surface, built straight off the tree nodes:
 *  - Make next  = the to-make backlog (queued, untried)
 *  - Make again = proven favourites worth repeating (made + rated excellent)
 *  Each lane is split bake vs no-bake — so you can pair one oven + one no-oven for a concurrent
 *  session — and ordered produce-first then leanest. Sub-recipes (components) are excluded. */
export function buildQueue(nodes: TreeNodeVM[]): QueueVM {
  const makeable = nodes.filter((n) => n.kind !== "sub-recipe");
  return {
    makeNext: lane(makeable.filter((n) => n.queued)),
    makeAgain: lane(makeable.filter((n) => n.made && n.rating === "excellent")),
  };
}
