import type { IngredientGroupVM } from "../../lib/viewmodel/types";
import { r0 } from "../../lib/viewmodel/format";

export function IngredientList({ groups }: { groups: IngredientGroupVM[] }) {
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <section className="block" aria-label="Ingredients">
      <h2 className="sh">Ingredients <span className="kc">{count} items</span></h2>
      {groups.map((g) => (
        <div className="ggroup" key={g.title}>
          <h3 className="gh"><span>{g.title} {g.subRecipe && <span className="cell">sub-recipe</span>}</span> <span className="kc">{r0(g.calories)} cal</span></h3>
          {g.items.map((it, i) => (
            <div className="ing" key={i}>
              <span className="q">{it.qtyNatural}</span>
              <span className="nm">{it.name}</span>
              <span className="g">{it.grams != null && !/\bg$/.test(it.qtyNatural) ? `${it.grams} g` : ""}</span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
