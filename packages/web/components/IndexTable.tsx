"use client";
import { useState } from "react";
import Link from "next/link";
import type { RecipeSummary } from "../lib/viewmodel/types";
import { MacroLine } from "./shared/MacroLine";
import { StateDot } from "./shared/StateDot";

export function IndexTable({ rows }: { rows: RecipeSummary[] }) {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const filtered = ql
    ? rows.filter((r) => r.name.toLowerCase().includes(ql) || r.family.toLowerCase().includes(ql) || r.tags.some((t) => t.toLowerCase().includes(ql)))
    : rows;
  return (
    <div className="idx">
      <div className="idxhead">
        <h1>Recipes</h1>
        <input className="idxq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, family, or tag…" />
      </div>
      <div className="idxct">{filtered.length} of {rows.length}</div>
      <div className="idxlist">
        {filtered.map((r) => (
          <Link className="idxrow" key={r.recipeId} href={`/r/${r.recipeId}`}>
            <span className="idxnm">{r.name}</span>
            <span className="idxfam">{r.family}</span>
            <MacroLine cal={r.cal} protein={r.protein} calPerGramProtein={r.calPerGramProtein} servings={r.servings} unit={r.servingUnit} />
            <span className="idxst"><StateDot made={r.made} rating={r.rating} /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}
