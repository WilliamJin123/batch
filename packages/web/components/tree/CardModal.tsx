"use client";
import { useEffect } from "react";
import type { BakeCardVM } from "../../lib/viewmodel/types";
import { RecipeHero } from "../card/RecipeHero";
import { IngredientList } from "../card/IngredientList";
import { CompositionRollup } from "../card/CompositionRollup";
import { Lineage } from "../card/Lineage";
import { TastingLog } from "../card/TastingLog";
import { Method } from "../card/Method";

/** The bake card as an overlay viewer over the tree. Esc / click-away / ✕ dismisses
 *  back to the exact canvas state — no route change, the tree never unmounts. */
export function CardModal({ card, onClose, onNavigate }: {
  card: BakeCardVM; onClose: () => void; onNavigate?: (recipeId: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="cmodal" role="dialog" aria-modal="true" aria-label={card.name} onMouseDown={onClose}>
      <div className="cmodal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmodal-bar">
          <a className="cmodal-full" href={`/r/${card.recipeId}`} target="_blank" rel="noreferrer">open full page ↗</a>
          <button className="cmodal-x" onClick={onClose} aria-label="Close recipe"><span className="esc">esc</span><span className="xg" aria-hidden="true">✕</span></button>
        </div>
        <div className="cmodal-scroll">
          <RecipeHero card={card} />
          <div className="grid">
            <div className="rail">
              <IngredientList groups={card.ingredientGroups} />
              <CompositionRollup rows={card.composition} whole={card.whole} perServing={card.perServing} servings={card.yield.amount} />
              <Lineage items={card.lineage} onNavigate={onNavigate} />
              <TastingLog entries={card.tastingLog} />
            </div>
            <Method sections={card.method} />
          </div>
        </div>
      </div>
    </div>
  );
}
