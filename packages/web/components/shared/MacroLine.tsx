import { RatioDot } from "./RatioDot";

export function MacroLine({ cal, protein, calPerGramProtein, servings, unit, warn }: {
  cal: number; protein: number; calPerGramProtein: number | null; servings: number; unit: string; warn?: boolean;
}) {
  return (<div className="macroline">{cal} cal · {protein} P · {calPerGramProtein ?? "—"}<RatioDot warn={warn} /> cal/g · makes {servings} {unit}</div>);
}
