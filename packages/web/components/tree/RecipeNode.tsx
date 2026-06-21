import type { TreeNodeVM } from "../../lib/viewmodel/types";
import type { Pos } from "../../lib/layout/graphLayout";
import { splitName, r0, r1 } from "../../lib/viewmodel/format";

// One status per recipe, driving the border + the always-visible status line. Ordered best→plain.
// Sub-recipes are components (never made/queued) so they carry no status.
type Status = { cls: string; glyph: string; label: string };
function statusOf(node: TreeNodeVM): Status | null {
  if (node.kind === "sub-recipe") return null;
  if (node.rating === "excellent") return { cls: "exc", glyph: "★", label: "excellent" };
  if (node.made && node.rating === "bad") return { cls: "bad", glyph: "▲", label: "needs work" };
  if (node.made) return { cls: "good", glyph: "●", label: node.rating ?? "good" };
  if (node.queued) return { cls: "tomake", glyph: "○", label: "to make" };
  return null; // untried and not queued (e.g. an idle base) — left plain
}

export function RecipeNode({ node, pos, arm, selected, onOpen }: {
  node: TreeNodeVM; pos: Pos; arm?: "A" | "B"; selected?: boolean; onOpen?: (recipeId: string) => void;
}) {
  const { title, paren } = splitName(node.name);
  const role = node.kind === "sub-recipe" ? "sub-recipe" : node.kind === "base" ? "base" : node.kind === "root" ? "root" : "variant";
  const status = statusOf(node);
  const cls = ["node", node.kind === "sub-recipe" ? "sub" : "", node.kind === "base" ? "base" : "",
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
      style={{ left: pos.x, top: pos.y, width: pos.w, ["--nh" as string]: pos.h }}
    >
      <span className="role">{arm ? `${role} · ${arm}` : role}</span>
      <div className="nname">{title} {paren && <span className="q">{paren}</span>}{node.needsTuning && <span className="tune">needs-tuning</span>}</div>
      {/* status line: always visible (both zoom modes), enlarged when zoomed out */}
      {status && <div className={`nrate ${status.cls}`}><span className="rglyph">{status.glyph}</span> {status.label}</div>}
      <div className="ndetailw"><div className="ndetail">
        <div className="nmeta">
          {r0(node.cal)} cal · {r1(node.protein)} P <span className="munit">/ serving</span><br />
          {node.servings > 1 && <>{r0(node.wholeCal).toLocaleString("en-US")} cal · {r0(node.wholeProtein)} P <span className="munit">total</span><br /></>}
          {node.calPerGramProtein != null ? r1(node.calPerGramProtein) : "—"} cal/g · makes {node.servings} {node.servingUnit}
        </div>
        {node.feedbackNote && <div className={`nfb${node.needsTuning ? " bad" : ""}`}>{node.feedbackNote}</div>}
      </div></div>
    </div>
  );
}
