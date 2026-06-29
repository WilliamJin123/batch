"use client";
import { useEffect, useRef } from "react";
import type { BakeCardVM } from "../../lib/viewmodel/types";
import { RecipeHero } from "../card/RecipeHero";
import { IngredientList } from "../card/IngredientList";
import { CompositionRollup } from "../card/CompositionRollup";
import { Lineage } from "../card/Lineage";
import { TastingLog } from "../card/TastingLog";
import { Method } from "../card/Method";

/** The bake card as an overlay viewer over the tree. Esc / click-away / ✕ dismisses
 *  back to the exact canvas state — no route change, the tree never unmounts. */
export function CardModal({ card, onClose, onNavigate, onBack }: {
  card: BakeCardVM; onClose: () => void; onNavigate?: (recipeId: string) => void; onBack?: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus management: move focus INTO the panel on open (it's aria-modal, so focus must not stay on the
  // tree behind it) and trap Tab within it. TreeView hands focus back to the canvas / drawer on close.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const SEL = 'a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])';
    panel.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = [...panel.querySelectorAll<HTMLElement>(SEL)].filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); panel.focus(); return; }
      const first = items[0]!, last = items[items.length - 1]!, active = document.activeElement; // guarded above: items.length >= 1
      if (e.shiftKey && (active === first || active === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    panel.addEventListener("keydown", onKey);
    return () => panel.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="cmodal" role="dialog" aria-modal="true" aria-label={card.name} onMouseDown={onClose}>
      <div className="cmodal-panel" ref={panelRef} tabIndex={-1} onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmodal-bar">
          {onBack && <button className="cmodal-back" onClick={onBack} aria-label="Back to results">← Results</button>}
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
