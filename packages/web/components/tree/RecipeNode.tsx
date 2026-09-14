import { memo } from "react";
import type { TreeNodeVM } from "../../lib/viewmodel/types";
import type { Pos } from "../../lib/layout/graphLayout";
import { splitName, r0, r1, isRatioWarn } from "../../lib/viewmodel/format";
import { recipeState, nodeStatus } from "../../lib/viewmodel/state";
import { RatioDot } from "../shared/RatioDot";
import { Mark, stateMark } from "../shared/Mark";

// Greedy word-wrap line count for a title at `cpl` chars/line (a word longer than the line breaks).
function wrapLines(words: string[], cpl: number): number {
  let lines = 1, cur = 0;
  for (const w of words) {
    const wl = w.length;
    if (cur > 0 && cur + 1 + wl <= cpl) { cur += 1 + wl; continue; }
    if (cur > 0) lines++;
    if (wl <= cpl) cur = wl;
    else { lines += Math.ceil(wl / cpl) - 1; cur = wl % cpl || cpl; } // word wider than the line breaks across lines
  }
  return lines;
}
// Largest serif px (scene units) at which the FULL title wraps into ≤3 lines of the card's content
// width — so a zoomed-out title is as large as possible but never truncates. Deterministic (a slightly
// conservative 0.53em char width, so the real text fits even when the estimate is a hair off).
function fitTitlePx(name: string, width: number, maxF: number): number {
  const words = name.split(/\s+/).filter(Boolean);
  for (let F = maxF; F > 11; F--) {
    const cpl = Math.max(4, Math.floor(width / (0.56 * F)));
    if (wrapLines(words, cpl) <= 3) return F;
  }
  return 11;
}

// memo'd: in a graph of ~80 nodes this component runs the per-node title-fit measurement, and the
// canvas re-renders on every pan/zoom frame. With stable props (pos from a memoized map, onOpen a
// stable callback) only the node whose `selected` flips actually re-renders.
export const RecipeNode = memo(function RecipeNode({ node, pos, arm, selected, onOpen }: {
  node: TreeNodeVM; pos: Pos; arm?: string; selected?: boolean; onOpen?: (recipeId: string) => void;
}) {
  const { title, paren } = splitName(node.name);
  const isSub = node.kind === "sub-recipe";
  // the role cell names only what the plate's position doesn't already say: bases, sub-recipes, roots
  const role = isSub ? "sub-recipe" : node.kind === "base" ? "base" : node.kind === "root" ? "root" : null;
  // max zoomed-out title size that still shows the whole title (content width ≈ plate minus padding)
  const titleFit = fitTitlePx(title, isSub ? 160 : 176, isSub ? 17 : 26);
  const state = recipeState(node);
  const status = nodeStatus(state, node.rating);
  const mark = stateMark(state);
  const ratioHot = isRatioWarn(node.calPerGramProtein, isSub);
  const cls = ["node", isSub ? "sub" : "", node.kind === "base" ? "base" : "",
    status ? `s-${status.cls}` : "", selected ? "cur" : ""].filter(Boolean).join(" ");
  const open = () => onOpen?.(node.recipeId);
  return (
    <div
      className={cls}
      role="button"
      tabIndex={0}
      aria-label={`Open ${node.name}${status ? ` — ${status.label}` : ""}`}
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      style={{ left: pos.x, top: pos.y, width: pos.w, ["--nh" as string]: pos.h, ["--tf" as string]: titleFit }}
    >
      <div className="nhead">
        <div className="nname">{title} {paren && <span className="q">{paren}</span>}{node.tags.includes("no-bake") && <span className="nobake" title="no oven — sets in the fridge/freezer">no-bake</span>}{node.needsTuning && <span className="tune">needs-tuning</span>}</div>
        {(role || arm) && (
          <div className="ncells">
            {role && <span className="ncell role">{role}</span>}
            {arm && <span className="ncell arm" title={`bake-off arm ${arm}`}>{arm}</span>}
          </div>
        )}
      </div>
      <div className="ndetailw"><div className="ndetail">
        {/* figures line: per-serving kcal · g protein · cal per g protein */}
        <div className="nfig">
          <span>{r0(node.cal)} cal</span>
          <span>{r1(node.protein)} <span className="u">g P</span></span>
          <span>{node.calPerGramProtein != null ? r1(node.calPerGramProtein) : "—"}<RatioDot warn={ratioHot} /> <span className="u">cal/g</span></span>
        </div>
        <div className="nmakes">
          makes {node.servings} {node.servingUnit}
          {node.servings > 1 && <span className="tot">{r0(node.wholeCal).toLocaleString("en-US")} cal · {r0(node.wholeProtein)} g P whole</span>}
        </div>
        {status && mark && <div className="nstat"><Mark kind={mark} /> {status.label}</div>}
        {node.feedbackNote && <div className={`nfb${node.needsTuning ? " bad" : ""}`}>{node.feedbackNote}</div>}
      </div></div>
    </div>
  );
});
