export function MacroLine({ cal, protein, calPerGramProtein, servings, unit, warn }: {
  cal: number; protein: number; calPerGramProtein: number | null; servings: number; unit: string; warn?: boolean;
}) {
  return (<div className="macroline">{cal} cal · {protein} P · {calPerGramProtein ?? "—"}{warn && <span className="rdot" role="img" aria-label="lean-light: high cal per gram protein" title="high cal/g protein — lean-light for a protein recipe" />} cal/g · makes {servings} {unit}</div>);
}
