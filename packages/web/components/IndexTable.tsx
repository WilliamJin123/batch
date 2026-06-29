"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RecipeSummary } from "../lib/viewmodel/types";
import { MacroLine } from "./shared/MacroLine";
import { StateDot } from "./shared/StateDot";
import { SearchBox } from "./shared/SearchBox";
import { isRatioWarn } from "../lib/viewmodel/format";
import { matchesSearch } from "../lib/search";

export function IndexTable({ rows }: { rows: RecipeSummary[] }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  // shared matcher (lib/search): punctuation/accent-insensitive substring over name/family/tags,
  // identical to the tree drawer + queue. Empty query matches everything.
  const filtered = rows.filter((r) => matchesSearch([r.name, r.family, ...r.tags], q));
  return (
    <div className="idx">
      <div className="idxhead">
        <h1>Recipes</h1>
        <SearchBox className="wide" value={q} onChange={setQ}
          placeholder="Filter by name, family, or tag…" ariaLabel="Filter recipes"
          onEnter={() => { if (filtered[0]) router.push(`/r/${filtered[0].recipeId}`); }} />
      </div>
      <div className="idxct">{filtered.length} of {rows.length}</div>
      <div className="idxlist">
        {filtered.map((r) => (
          <Link className="idxrow" key={r.recipeId} href={`/r/${r.recipeId}`}>
            <span className="idxnm">{r.name}</span>
            <span className="idxfam">{r.family}</span>
            <MacroLine cal={r.cal} protein={r.protein} calPerGramProtein={r.calPerGramProtein} servings={r.servings} unit={r.servingUnit} warn={isRatioWarn(r.calPerGramProtein, r.tags.includes("sub-recipe"))} />
            <span className="idxst"><StateDot made={r.made} rating={r.rating} /></span>
          </Link>
        ))}
        {filtered.length === 0 && <div className="dempty">No recipes match “{q}”.</div>}
      </div>
    </div>
  );
}
