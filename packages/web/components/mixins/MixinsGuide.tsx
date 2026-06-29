// A static, curated guide of fold-ins for protein bakes — no data dependency, just content.
// Tailored to the lean-protein house style: "lean" marks picks that add flavor for ~0 calories.

type Mixin = { name: string; note: string; lean?: boolean };
type Category = { title: string; items: Mixin[] };

const CATEGORIES: Category[] = [
  {
    title: "Chocolate",
    items: [
      { name: "Dark / semisweet chips", note: "The default for cookies, brownies, and bars. Dark = less sugar and deeper flavor; chips freeze firm, so they work in frozen bars too." },
      { name: "White chocolate chips", note: "Sweeter — best played against fruit or citrus (white-choc + raspberry, white-choc + lemon)." },
      { name: "Chocolate chunks", note: "Chopped from a bar — bigger melty pools than chips in brownies and cookies." },
      { name: "Cocoa nibs", note: "Pure crunch and intense bitter chocolate with almost no sugar. Stays crisp even frozen.", lean: true },
    ],
  },
  {
    title: "Fruit",
    items: [
      { name: "Freeze-dried fruit", note: "The lean MVP — strawberry, raspberry, banana. Intense flavor and light crunch, no added sugar and (crucially) no moisture to wet the batter. Crush into cookies, bars, cheesecake, or frozen bars.", lean: true },
      { name: "Fresh / frozen berries", note: "Fold them in frozen (don't thaw) and toss in a little flour first so they don't bleed or sink. Muffins, blondies, cheesecake." },
      { name: "Diced apple / shredded carrot", note: "Moisture and bulk at low calories — you already lean on these in the fritter and carrot cake." },
      { name: "Chopped dates / raisins", note: "Natural caramel chew; dates especially read as toffee. Watch the sugar." },
      { name: "Citrus zest", note: "Near-zero calories, huge lift. Lemon + blueberry, orange + chocolate.", lean: true },
    ],
  },
  {
    title: "Crunch & texture",
    items: [
      { name: "Puffed rice / quinoa", note: "The closest stand-in for cereal — light, low-cal crunch in no-bake and frozen bars." },
      { name: "Crushed graham crackers", note: "S'mores / cheesecake crunch that softens just slightly. Holds up well in frozen yogurt bars." },
      { name: "Pretzel pieces", note: "Salty crunch — sweet-salty against chocolate or caramel." },
      { name: "Toasted nuts", note: "Pecan, walnut, almond — toast first for depth. Adds fat, but big payoff; pecan + caramel = turtle." },
      { name: "Toasted coconut", note: "Toast it for flavor; natural in coconut cake and cheesecake." },
      { name: "Crushed Biscoff / protein cookie", note: "Caramel-spice crunch; pairs with butterscotch." },
    ],
  },
  {
    title: "Caramel, candy & spreads",
    items: [
      { name: "Caramel swirl", note: "Use your Brown-Sugar Caramel sub-recipe — real molasses caramel swirled into brownies, cheesecake, or bars." },
      { name: "Butterscotch chips", note: "Blondies and oat bars; loves pecan." },
      { name: "Peanut butter / Biscoff", note: "Swirl on top or marble through. Adds fat but huge flavor; PB + chocolate is the classic." },
      { name: "Toffee bits", note: "Caramel crunch scattered through blondies and cookies." },
      { name: "Mini marshmallows", note: "S'mores bars — fold in late, they melt." },
      { name: "Toasted marshmallow meringue", note: "The lean s'mores topping — your Marshmallow Meringue sub-recipe. Whip egg whites to stiff peaks with a little real sugar (Splenda to finish), swirl over a cooled base, and broil the peaks brown (no torch). Toasted-marshmallow flavor for almost no calories and zero fat, plus ~4g protein. Best fresh.", lean: true },
    ],
  },
  {
    title: "Warm & aromatic",
    items: [
      { name: "Espresso powder", note: "Deepens chocolate — a pinch in any brownie. Your fudgy brownies already use it.", lean: true },
      { name: "Toasted cinnamon / nutmeg", note: "Warmth; toast ground cinnamon (house rule) so it blooms instead of tasting raw.", lean: true },
      { name: "Flaky salt (to finish)", note: "On caramel or chocolate — makes everything read richer, for nothing.", lean: true },
      { name: "Almond / vanilla extract", note: "Depth; a drop of almond makes even cheap chocolate taste expensive.", lean: true },
    ],
  },
];

export function MixinsGuide() {
  return (
    <div className="mx">
      <header className="mx-head">
        <h1 className="mx-title">Mix-ins</h1>
        <p className="mx-sub">
          A pantry of fold-ins for bars, brownies, and cookies — what each is good in, and what it does to
          your macros. <span className="mx-lean">lean</span> marks the picks that add flavor for almost no calories.
        </p>
      </header>
      <div className="mx-grid">
        {CATEGORIES.map((c) => (
          <section className="mx-card" key={c.title}>
            <h2 className="mx-ct">{c.title}</h2>
            <ul className="mx-list">
              {c.items.map((m) => (
                <li className="mx-item" key={m.name}>
                  <span className="mx-nm">
                    {m.name}
                    {m.lean && <span className="mx-lean" title="lean — almost no added calories">lean</span>}
                  </span>
                  <span className="mx-note">{m.note}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
