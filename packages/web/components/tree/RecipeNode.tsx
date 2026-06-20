import type { TreeNodeVM } from "../../lib/viewmodel/types";
import type { Pos } from "../../lib/layout/graphLayout";
import { splitName, r0, r1 } from "../../lib/viewmodel/format";

function Rate({ node }: { node: TreeNodeVM }) {
  if (node.kind === "sub-recipe") return null;
  if (!node.made) return <div className="nrate plan"><span className="ringa" /> to make</div>;
  if (node.rating === "excellent") return <div className="nrate exc"><span className="star">★</span> excellent</div>;
  if (node.rating === "bad") return <div className="nrate plan"><span className="ringa" /> needs work</div>;
  return <div className="nrate good"><span className="dotg" /> {node.rating ?? "good"}</div>;
}

export function RecipeNode({ node, pos, arm, selected, onOpen }: {
  node: TreeNodeVM; pos: Pos; arm?: "A" | "B"; selected?: boolean; onOpen?: (recipeId: string) => void;
}) {
  const { title, paren } = splitName(node.name);
  const role = node.kind === "sub-recipe" ? "sub-recipe" : node.kind === "base" ? "base" : node.kind === "root" ? "root" : "variant";
  const cls = ["node", node.kind === "sub-recipe" ? "sub" : "", node.kind === "base" ? "base" : "", selected ? "cur" : ""].filter(Boolean).join(" ");
  const open = () => onOpen?.(node.recipeId);
  return (
    <div
      className={cls}
      role="button"
      tabIndex={0}
      aria-label={`Open ${node.name}`}
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      style={{ left: pos.x, top: pos.y, width: pos.w, ["--nh" as string]: pos.h }}
    >
      <span className="role">{arm ? `${role} · ${arm}` : role}</span>
      <div className="nname">{title} {paren && <span className="q">{paren}</span>}{node.needsTuning && <span className="tune">needs-tuning</span>}</div>
      <div className="ndetailw"><div className="ndetail">
        <div className="nmeta">
          {r0(node.cal)} cal · {r1(node.protein)} P <span className="munit">/ serving</span><br />
          {node.servings > 1 && <>{r0(node.wholeCal).toLocaleString("en-US")} cal · {r0(node.wholeProtein)} P <span className="munit">total</span><br /></>}
          {node.calPerGramProtein != null ? r1(node.calPerGramProtein) : "—"} cal/g · makes {node.servings} {node.servingUnit}
        </div>
        <Rate node={node} />
        {node.feedbackNote && <div className={`nfb${node.needsTuning ? " bad" : ""}`}>{node.feedbackNote}</div>}
      </div></div>
    </div>
  );
}
