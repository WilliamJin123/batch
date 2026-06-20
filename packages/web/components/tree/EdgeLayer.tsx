import type { Pos } from "../../lib/layout/graphLayout";

type Edge = { from: string; to: string; rel: "derives" | "composes" };
export type Connector = { ax: number; ay: number; bx: number; by: number; mx: number; my: number };

/** Anchor on the side of each box that faces the other, so the curve flows horizontally. */
function side(a: Pos, b: Pos) {
  const aRight = (a.x + a.w / 2) <= (b.x + b.w / 2);
  return {
    A: { x: aRight ? a.x + a.w : a.x, y: a.y + a.h / 2 },
    B: { x: aRight ? b.x : b.x + b.w, y: b.y + b.h / 2 },
  };
}

export function EdgeLayer({ edges, pos, connectors, width, height }: {
  edges: Edge[]; pos: Map<string, Pos>; connectors?: Connector[]; width: number; height: number;
}) {
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}>
      <defs>
        {/* derivation: hollow triangle on the variant end (parent → variant) */}
        <marker id="m-tri" markerWidth="18" markerHeight="16" refX="15" refY="8" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M15,8 L3,2.5 L3,13.5 Z" fill="#FFFDFA" stroke="#956120" strokeWidth="1.3" />
        </marker>
        {/* composition: hollow diamond at the recipe that composes the sub-recipe */}
        <marker id="m-dia" markerWidth="20" markerHeight="14" refX="10" refY="7" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M3,7 L10,2.5 L17,7 L10,11.5 Z" fill="#FFFDFA" stroke="#8C8474" strokeWidth="1.2" />
        </marker>
      </defs>
      {/* bake-off brackets: link the two arms through the pill that sits at the midpoint */}
      {connectors?.map((c, i) => {
        const d = `M${c.ax},${c.ay} Q${c.mx},${c.ay} ${c.mx},${c.my} Q${c.mx},${c.by} ${c.bx},${c.by}`;
        return (
          <g key={`bo-${i}`}>
            <path d={d} fill="none" stroke="#B47A37" strokeWidth={1.6} strokeDasharray="2 4" strokeLinecap="round" opacity={0.85} />
            <circle cx={c.ax} cy={c.ay} r={2.6} fill="#B47A37" />
            <circle cx={c.bx} cy={c.by} r={2.6} fill="#B47A37" />
          </g>
        );
      })}
      {edges.map((e, i) => {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) return null;
        const { A, B } = side(a, b);
        const mid = (A.x + B.x) / 2;
        if (e.rel === "derives") {
          // parent → variant: draw base (to=B) → variant (from=A) so the triangle lands on the variant
          const d = `M${B.x},${B.y} C${mid},${B.y} ${mid},${A.y} ${A.x},${A.y}`;
          return (
            <g key={i} className="edge ederiv">
              <path className="ehit" d={d} fill="none" stroke="transparent" strokeWidth={14} />
              <path className="evis" d={d} fill="none" stroke="#B47A37" strokeWidth={1.5} opacity={0.9} markerEnd="url(#m-tri)" />
            </g>
          );
        }
        const d = `M${A.x},${A.y} C${mid},${A.y} ${mid},${B.y} ${B.x},${B.y}`;
        return (
          <g key={i} className="edge ecomp">
            <path className="ehit" d={d} fill="none" stroke="transparent" strokeWidth={14} />
            <path className="evis" d={d} fill="none" stroke="#8C8474" strokeWidth={1.4} strokeDasharray="5 4" opacity={0.9} markerStart="url(#m-dia)" />
          </g>
        );
      })}
    </svg>
  );
}
