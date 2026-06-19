import type { Pos } from "../../lib/layout/graphLayout";

type Edge = { from: string; to: string; rel: "derives" | "composes" };

/** Anchor on the side of each box that faces the other, so the curve flows horizontally. */
function side(a: Pos, b: Pos) {
  const aRight = (a.x + a.w / 2) <= (b.x + b.w / 2);
  return {
    A: { x: aRight ? a.x + a.w : a.x, y: a.y + a.h / 2 },
    B: { x: aRight ? b.x : b.x + b.w, y: b.y + b.h / 2 },
  };
}

export function EdgeLayer({ edges, pos, width, height }: {
  edges: Edge[]; pos: Map<string, Pos>; width: number; height: number;
}) {
  return (
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}>
      <defs>
        {/* inheritance: hollow triangle at the base a variant derives from */}
        <marker id="m-tri" markerWidth="18" markerHeight="16" refX="15" refY="8" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M15,8 L3,2.5 L3,13.5 Z" fill="#FFFDFA" stroke="#956120" strokeWidth="1.3" />
        </marker>
        {/* composition: hollow diamond at the recipe that composes the sub-recipe */}
        <marker id="m-dia" markerWidth="20" markerHeight="14" refX="10" refY="7" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M3,7 L10,2.5 L17,7 L10,11.5 Z" fill="#FFFDFA" stroke="#8C8474" strokeWidth="1.2" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) return null;
        const { A, B } = side(a, b);
        const mid = (A.x + B.x) / 2;
        const d = `M${A.x},${A.y} C${mid},${A.y} ${mid},${B.y} ${B.x},${B.y}`;
        return e.rel === "derives"
          ? <path key={i} d={d} fill="none" stroke="#B47A37" strokeWidth={1.5} opacity={0.9} markerEnd="url(#m-tri)" />
          : <path key={i} d={d} fill="none" stroke="#8C8474" strokeWidth={1.4} strokeDasharray="5 4" opacity={0.9} markerStart="url(#m-dia)" />;
      })}
    </svg>
  );
}
