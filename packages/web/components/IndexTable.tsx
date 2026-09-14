"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RecipeSummary } from "../lib/viewmodel/types";
import { StateDot } from "./shared/StateDot";
import { SearchBox } from "./shared/SearchBox";
import { RatioDot } from "./shared/RatioDot";
import { r0, r1, isRatioWarn } from "../lib/viewmodel/format";
import { recipeState } from "../lib/viewmodel/state";
import { matchesSearch } from "../lib/search";

/** The recipes index: one ruled ledger, a row per recipe (each row is the link to its card). */
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
        <div className="idxrow idxhr" aria-hidden="true">
          <span>Name</span><span className="idxfam">Family</span><span className="n">cal</span><span className="n idxp">g P</span><span className="n">cal/g</span><span className="idxmk">makes</span><span />
        </div>
        {filtered.map((r) => {
          const sub = r.tags.includes("sub-recipe");
          return (
            <Link className="idxrow" key={r.recipeId} href={`/r/${r.recipeId}`}>
              <span className="idxnm">{r.name}</span>
              <span className="idxfam">{r.family}</span>
              <span className="n">{r0(r.cal)}</span>
              <span className="n idxp">{r1(r.protein)}</span>
              <span className="n">{r.calPerGramProtein != null ? r1(r.calPerGramProtein) : "—"}<span className="rs"><RatioDot warn={isRatioWarn(r.calPerGramProtein, sub)} /></span></span>
              <span className="idxmk">{r.servings} {r.servingUnit}</span>
              <span className="idxst"><StateDot state={recipeState(r)} /></span>
            </Link>
          );
        })}
        {filtered.length === 0 && <div className="dempty">No recipes match “{q}”.</div>}
      </div>
    </div>
  );
}
