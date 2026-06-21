import type { IngredientSlot, LibraryIngredient, RecipeContent, Step, StepUsage, Yield } from "./types.js";

/**
 * Front-door importer: a foreign recipe (allmyrecipes.app / Instagram markdown today) → a *draft*
 * Batch `create` payload. The deterministic 80% — parse the text into steps + quantified ingredient
 * lines + yield, then best-effort match each line to a library id. The judgment 20% (house
 * substitutions, macros for genuinely-new ingredients, step-binding) is deliberately left to the
 * review pass: unmatched lines keep a placeholder id (the draft lands `basis: partial`, which is
 * legal) and the report flags them with a hint. The inverse of `dump`: foreign → draft → `create`.
 *
 * Treats each file as an independent root — it infers no derivation/family links from co-location.
 */

export interface ParsedIngredient {
  raw: string;
  quantity?: number;
  unit?: string;
  name: string;
  note?: string;
}
export interface ParsedStep { text: string; section?: string }
export interface ParsedRecipe {
  title: string;
  description?: string;
  servings?: number;
  ingredients: ParsedIngredient[];
  steps: ParsedStep[];
}

export interface IngestLine {
  name: string;
  quantity?: number;
  unit?: string;
  ingredientId?: string;
  confidence: number;
  hint?: string;
  note?: string;
}
export interface IngestDraft {
  name: string;
  description?: string;
  tags: string[];
  yield: Yield;
  content: RecipeContent;
}
export interface IngestReport {
  title: string;
  servings?: number;
  steps: number;
  ingredients: number;
  matched: number;
  unresolved: number;
  lines: IngestLine[];
}
export interface IngestResult { draft: IngestDraft; report: IngestReport }

// ---------------------------------------------------------------- quantity parsing
const FRAC: Record<string, number> = {
  "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375,
  "⅝": 0.625, "⅞": 0.875, "⅕": 0.2, "⅖": 0.4, "⅗": 0.6, "⅘": 0.8, "⅙": 1 / 6, "⅚": 5 / 6, "⅐": 1 / 7, "⅑": 1 / 9,
};
const FRAC_CLASS = "½¼¾⅓⅔⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚⅐⅑";

/** Pull a leading quantity (int, decimal, ascii or unicode fraction, or a mixed number) off a string. */
function parseLeadingQuantity(s: string): { value: number; rest: string } | null {
  s = s.trimStart();
  let m = s.match(new RegExp(`^(\\d+)\\s+(\\d+)\\/(\\d+)\\s+(.*)$`, "s")); // "1 1/2 cup"
  if (m) return { value: +m[1]! + +m[2]! / +m[3]!, rest: m[4]! };
  m = s.match(new RegExp(`^(\\d+)\\s*([${FRAC_CLASS}])\\s+(.*)$`, "s")); // "1½ tbsp" / "1 ½ tbsp"
  if (m) return { value: +m[1]! + FRAC[m[2]!]!, rest: m[3]! };
  m = s.match(new RegExp(`^([${FRAC_CLASS}])\\s+(.*)$`, "s")); // "½ cup"
  if (m) return { value: FRAC[m[1]!]!, rest: m[2]! };
  m = s.match(/^(\d+)\/(\d+)\s+(.*)$/s); // "1/2 cup"
  if (m) return { value: +m[1]! / +m[2]!, rest: m[3]! };
  m = s.match(/^(\d+(?:\.\d+)?)\s+(.*)$/s); // "170 g" / "1.5 cup" / "2 eggs"
  if (m) return { value: +m[1]!, rest: m[2]! };
  return null;
}

// Measurement + count/measure words we accept as a unit token (normalized, singular).
const UNITS = new Set([
  "mg", "g", "gram", "kg", "oz", "ounce", "lb", "pound",
  "ml", "milliliter", "millilitre", "l", "liter", "litre", "tsp", "tbsp", "cup", "floz", "pint", "quart", "gallon",
  "scoop", "each", "pinch", "dash", "drizzle", "splash", "handful", "stick", "clove", "slice", "sheet", "can",
  "packet", "ball", "medium", "large", "small", "apple", "candy", "cookie", "square", "ramekin", "ladyfinger",
  "cake", "serving", "strip", "knob", "wedge",
]);
const UNIT_ALIAS: Record<string, string> = {
  tbs: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp", teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp", tbsp: "tbsp",
  count: "each", grams: "g", gram: "g", ounce: "oz", ounces: "oz", pound: "lb", pounds: "lb", lbs: "lb",
};

/** Consume the unit token off `rest` (or none), returning {unit, name}. */
function takeUnit(rest: string): { unit?: string; name: string } {
  const words = rest.split(/\s+/);
  const w0 = (words[0] ?? "").toLowerCase().replace(/[.,]$/, "");
  if (w0 === "fl" && (words[1] ?? "").toLowerCase().startsWith("oz")) return { unit: "floz", name: words.slice(2).join(" ") };
  let u = UNIT_ALIAS[w0] ?? w0;
  if (!UNITS.has(u) && u.endsWith("s") && UNITS.has(u.slice(0, -1))) u = u.slice(0, -1); // cups -> cup
  if (UNITS.has(u)) return { unit: u, name: words.slice(1).join(" ") };
  return { unit: undefined, name: rest };
}

/** Peel a trailing "..., softened" qualifier, an "X or Y" alternative, and a "to taste" into a note. */
function splitNote(name: string): { name: string; note?: string } {
  let note: string | undefined;
  let m = name.match(/^(.*?),\s*(.+)$/);
  if (m) { name = m[1]!; note = m[2]!; }
  m = name.match(/^(.*?)\s+or\s+(.+)$/i);
  if (m) { note = (note ? note + "; " : "") + "or " + m[2]!; name = m[1]!; }
  if (/\bto taste\b/i.test(name)) {
    note = (note ? note + "; " : "") + "to taste";
    name = name.replace(/\bto taste\b/i, "").replace(/\s+/g, " ").trim();
  }
  return { name: name.trim(), note };
}

export function parseIngredientLine(line: string): ParsedIngredient {
  const raw = line.trim().replace(/^[-*]\s+/, "");
  const q = parseLeadingQuantity(raw);
  let quantity: number | undefined, rest: string;
  if (q) { quantity = q.value; rest = q.rest; }
  else {
    const w0 = raw.split(/\s+/)[0]?.toLowerCase().replace(/[.,]$/, "") ?? "";
    if (UNITS.has(UNIT_ALIAS[w0] ?? w0)) { quantity = 1; rest = raw; } // "Pinch Salt"
    else { quantity = undefined; rest = raw; }
  }
  let unit: string | undefined, name: string;
  if (quantity !== undefined) { const t = takeUnit(rest); unit = t.unit; name = t.name; }
  else name = rest;
  const sn = splitNote(name);
  return { raw, quantity, unit, name: sn.name, note: sn.note };
}

// ---------------------------------------------------------------- markdown parsing
export function parseMarkdownRecipe(md: string): ParsedRecipe {
  const lines = md.split(/\r?\n/);
  const title = (lines.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, "").trim()) ?? "";
  let servings: number | undefined;
  for (const l of lines) {
    const m = l.match(/\*\*\s*Servings\s*\*\*\s*(\d+(?:\.\d+)?)/i);
    if (m) { servings = parseFloat(m[1]!); break; }
  }
  const idx = (re: RegExp) => lines.findIndex((l) => re.test(l));
  const ingHead = idx(/^##\s+Ingredients/i);
  const dirHead = idx(/^##\s+Directions/i);
  const srcHead = idx(/^##\s+Source/i);

  let description: string | undefined;
  const descEnd = ingHead >= 0 ? ingHead : lines.length;
  for (let i = 0; i < descEnd; i++) {
    const l = lines[i]!.trim();
    if (!l || l.startsWith("#") || l.startsWith("-") || l.startsWith("![") || l.startsWith("**")) continue;
    description = l; break;
  }

  const ingredients: ParsedIngredient[] = [];
  if (ingHead >= 0) {
    const end = dirHead >= 0 ? dirHead : srcHead >= 0 ? srcHead : lines.length;
    for (let i = ingHead + 1; i < end; i++) {
      const l = lines[i]!.trim();
      if (l.startsWith("-")) ingredients.push(parseIngredientLine(l));
    }
  }

  const steps: ParsedStep[] = [];
  if (dirHead >= 0) {
    const end = srcHead >= 0 ? srcHead : lines.length;
    for (let i = dirHead + 1; i < end; i++) {
      const m = lines[i]!.trim().match(/^\*\*\s*\d+\.\s*\*\*\s*(.+)$/); // "**1.** text"
      if (m) steps.push({ text: m[1]!.trim().replace(/\s*\(\d+\s*minutes?\)\s*$/i, "").trim() });
    }
  }
  return { title, description, servings, ingredients, steps };
}

// ---------------------------------------------------------------- ingredient matching
const STOP = new Set([
  "unsweetened", "plain", "nonfat", "non-fat", "fat-free", "low-fat", "lowfat", "light", "reduced-fat", "fresh",
  "frozen", "melted", "cold", "softened", "chopped", "grated", "diced", "shredded", "finely", "ground", "whole",
  "pure", "granulated", "granular", "powdered", "dark", "crushed", "blended", "extra", "organic", "natural",
  "sifted", "cubed", "warm", "ripe", "large", "medium", "small", "hot", "brewed", "strong", "of", "choice",
  "packed", "drained", "room", "temperature", "unsalted", "salted",
]);
function normName(s: string): string {
  return s.toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+%/g, " ")
    .replace(/sugar[-\s]*free/g, " ")
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/).filter((w) => w && !STOP.has(w)).join(" ");
}
const tokens = (s: string) => normName(s).split(/\s+/).filter(Boolean);

// High-precision keyword rules over the house library. Specific before generic. Deliberately does NOT
// cover judgment items (sweeteners, oil/butter *kind*) — those go unresolved with a hint instead.
const RULES: [RegExp, string][] = [
  [/apple cider vinegar|\bacv\b/, "ing-acv"],
  [/peanut butter/, "ing-peanut-butter"],
  [/almond butter/, "ing-almond-butter"],
  [/biscoff.*cookie|crushed biscoff|biscoff biscuit/, "ing-biscoff-cookie"],
  [/biscoff|cookie butter|speculoos/, "ing-biscoff-spread"],
  [/egg\s*whites?/, "ing-egg-white"],
  [/\beggs?\b/, "ing-egg-whole"],
  [/yogh?urt/, "ing-greek-yogurt-nonfat"], // greek / plain / British "yoghurt" → the house yogurt
  [/cottage cheese/, "ing-cottage-cheese"],
  [/cream cheese/, "ing-cream-cheese-light"],
  [/oat flour/, "ing-oat-flour"],
  [/coconut flour/, "ing-coconut-flour"],
  [/almond flour/, "ing-almond-flour"],
  [/(all[-\s]?purpose|plain|\bap\b)\s+flour/, "ing-ap-flour"],
  [/\bflour\b/, "ing-ap-flour"],
  [/whey\s*isolate|\bisolate\b/, "ing-whey-isolate"],
  [/chocolate.*protein/, "ing-protein-chocolate"],
  [/casein/, "ing-casein"],
  [/protein powder|\bprotein\b/, "ing-protein-vanilla"],
  [/collagen/, "ing-collagen"],
  [/almond milk/, "ing-almond-milk-unsweetened"],
  [/fairlife/, "ing-milk-fairlife-skim"],
  [/\bmilk\b/, "ing-skim-milk"],
  [/cocoa|cac[ao]o/, "ing-cocoa-powder"],
  [/baking powder/, "ing-baking-powder"],
  [/baking soda|bicarb/, "ing-baking-soda"],
  [/corn\s*starch/, "ing-cornstarch"],
  [/cinnamon/, "ing-cinnamon-ground"],
  [/nutmeg/, "ing-nutmeg"],
  [/ginger/, "ing-ginger-ground"],
  [/cream of tartar/, "ing-cream-of-tartar"],
  [/coconut extract/, "ing-extract-coconut"],
  [/banana/, "ing-banana"],
  [/(no[-\s]?added[-\s]?sugar\s+)?choc(olate)?\s*sauce/, "ing-syrup-chocolate-zero"],
  [/chocolate\s*chunks?/, "ing-chocolate-chips-semisweet"],
  [/(chocolate|hazelnut)\s*spread|nutella/, "ing-chocolate-spread"],
  [/kinder/, "ing-kinder-chocolate"],
  [/marshmallow\s*fluff|\bfluff\b/, "ing-marshmallow-fluff"],
  [/marshmallow/, "ing-marshmallow"],
  [/caramel syrup/, "ing-syrup-caramel-sf"],
  [/xanthan/, "ing-xanthan-gum"],
  [/sugar[-\s]?free syrup|\bsf syrup\b/, "ing-syrup-maple-sf"],
  [/confetti/, "ing-sprinkles"],
  [/butterscotch.*pudding/, "ing-pudding-butterscotch-sf"],
  [/pudding/, "ing-pudding-vanilla-sf"],
  [/(cake[-\s]?batter|birthday[-\s]?cake)\s*extract/, "ing-extract-cake-batter"],
  [/vanilla/, "ing-vanilla-extract"],
  [/\bsalt\b/, "ing-salt"],
  [/honey/, "ing-honey"],
  [/(sugar[-\s]?free|\bsf\b).*maple|maple.*(sugar[-\s]?free|\bsf\b)/, "ing-syrup-maple-sf"],
  [/maple syrup/, "ing-maple-syrup"],
  [/applesauce|apple sauce/, "ing-applesauce"],
  [/pumpkin/, "ing-pumpkin-puree"],
  [/carrot/, "ing-carrot"],
  [/blueberr/, "ing-blueberries"],
  [/lemon juice/, "ing-lemon-juice"],
  [/lemon zest|\bzest\b/, "ing-lemon-zest"],
  [/walnut/, "ing-walnuts"],
  [/\bnuts?\b/, "ing-walnuts"], // generic "chopped nuts" → the house default nut (review can swap)
  [/coconut oil/, "ing-coconut-oil"],
  [/rice cake/, "ing-rice-cake"],
  [/lady\s*finger|savoiardi/, "ing-ladyfinger"],
  [/chocolate graham/, "ing-graham-chocolate"],
  [/graham/, "ing-graham-crumbs"],
  [/fruity pebbles/, "ing-fruity-pebbles"],
  [/oats?\b/, "ing-rolled-oats"],
  [/cool[-\s]?whip/, "ing-cool-whip-zero"],
  [/peppermint extract/, "ing-peppermint-extract"],
  [/peppermint/, "ing-peppermint-candy"],
  [/spirulina/, "ing-spirulina"],
  [/white chocolate chips?/, "ing-white-chocolate-chips"],
  [/dark chocolate chips?/, "ing-chocolate-chips-dark"],
  [/chocolate chips?/, "ing-chocolate-chips-semisweet"],
  [/sprinkles/, "ing-sprinkles"],
  [/apple/, "ing-apple"],
  [/butter/, "ing-butter"],
];

// Sweeteners (and other house-calibration items) are deliberately never auto-matched — they're the
// review pass's call (→ granulated Splenda, volume-matched; never monk fruit). Guarding here stops the
// token fallback from grabbing a same-"sweetener"-worded library entry.
const JUDGMENT_SWEETENER = /swerve|allulose|monk\s?fruit|stevia|erythritol|sweetener|sugar substitute|confectioners|powdered sugar|granular sugar|brown sugar (replacement|substitute|blend)/i;

export function matchIngredient(rawName: string, library: LibraryIngredient[]): { id: string; confidence: number } | null {
  const lc = rawName.toLowerCase();
  if (JUDGMENT_SWEETENER.test(lc)) return null;
  for (const [re, id] of RULES) if (re.test(lc)) return { id, confidence: 0.9 };
  const q = tokens(rawName);
  if (!q.length) return null;
  let best: LibraryIngredient | undefined, bestScore = 0;
  for (const ing of library) {
    const t = new Set([
      ...tokens(ing.name),
      ...(ing.aliases ?? []).flatMap(tokens),
      ...ing.id.replace(/^ing-/, "").split("-"),
    ]);
    const inter = q.filter((x) => t.has(x)).length;
    const score = inter / q.length;
    if (score > bestScore) { bestScore = score; best = ing; }
  }
  return best && bestScore >= 0.6 ? { id: best.id, confidence: Math.min(0.85, bestScore) } : null;
}

/** Advisory house-calibration note for a line, whether or not it matched (never auto-applied). */
function hintFor(name: string): string | undefined {
  const lc = name.toLowerCase();
  if (JUDGMENT_SWEETENER.test(lc))
    return "house calibration: → ing-splenda-granulated, volume-matched (count its maltodextrin calories)";
  if (/light butter|reduced[-\s]?fat butter/.test(lc)) return "house: → ing-butter at matched calories";
  if (/olive oil|vegetable oil|canola oil/.test(lc)) return "house pref: oil → ing-coconut-oil";
  return undefined;
}

function slug(name: string): string {
  return "ing-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "ing-unknown";
}

const EGG_IDS = new Set(["ing-egg-whole", "ing-egg-white"]);
const EGG_SIZE = new Set(["medium", "large", "small"]);

export function draftFromParsed(parsed: ParsedRecipe, library: LibraryIngredient[]): IngestResult {
  const steps: Step[] = (parsed.steps.length ? parsed.steps : [{ text: "(no steps parsed — add the method)" }])
    .map((s, i) => ({ componentKey: `s${i + 1}`, order: i + 1, instructionText: s.text, ...(s.section ? { section: s.section } : {}) }));
  const stepKey = steps[0]!.componentKey; // draft binds every usage to the first step; the review pass re-sections

  const slots: IngredientSlot[] = [];
  const usages: StepUsage[] = [];
  const lines: IngestLine[] = [];
  parsed.ingredients.forEach((ing, i) => {
    // fall back to the "or <alt>" the splitter peeled into note — recovers "Plain or Vanilla Greek Yogurt"
    // (name "Plain" is an adjective; the real ingredient is the alternative).
    const m = matchIngredient(ing.name, library) ?? (ing.note ? matchIngredient(ing.note, library) : null);
    const id = m ? m.id : slug(ing.name);
    let unit = ing.unit;
    if (m && EGG_IDS.has(m.id) && (unit === undefined || EGG_SIZE.has(unit))) unit = "each";
    const sk = `sl${i + 1}`, uk = `u${i + 1}`;
    slots.push({ componentKey: sk, name: ing.name, resolution: { kind: "raw", libraryIngredientId: id } });
    usages.push({ componentKey: uk, stepKey, slotKey: sk, quantityValue: ing.quantity ?? 1, quantityUnit: unit ?? "each" });
    lines.push({ name: ing.name, quantity: ing.quantity, unit, ingredientId: m?.id, confidence: m?.confidence ?? 0, hint: hintFor(ing.name), note: ing.note });
  });

  const draft: IngestDraft = {
    name: parsed.title || "Untitled (imported)",
    ...(parsed.description ? { description: parsed.description } : {}),
    tags: ["imported"],
    yield: { amount: parsed.servings ?? 1, unit: "servings" },
    content: { steps, slots, usages },
  };
  const matched = lines.filter((l) => l.ingredientId).length;
  return {
    draft,
    report: { title: draft.name, servings: parsed.servings, steps: steps.length, ingredients: lines.length, matched, unresolved: lines.length - matched, lines },
  };
}

/** Parse a recipe markdown document and build a draft `create` payload + a match report. */
export function ingestMarkdown(md: string, library: LibraryIngredient[]): IngestResult {
  return draftFromParsed(parseMarkdownRecipe(md), library);
}
