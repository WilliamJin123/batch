export function MacroLine({ cal, protein, calPerGramProtein, servings, unit }: {
  cal: number; protein: number; calPerGramProtein: number | null; servings: number; unit: string;
}) {
  return (<div className="macroline">{cal} cal · {protein} P · {calPerGramProtein ?? "—"} cal/g · makes {servings} {unit}</div>);
}
