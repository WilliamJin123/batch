/** The lean-light flag: a small brick-red dot beside a recipe's cal/g-protein when the ratio drifts
 *  past RATIO_WARN (see format.ts) — the protein is getting incidental for the calories. One component
 *  so the glyph and its aria/title copy stay identical everywhere it appears. */
export function RatioDot({ warn }: { warn?: boolean }) {
  return warn ? (
    <span className="rdot" role="img" aria-label="lean-light: high cal per gram protein" title="high cal/g protein — lean-light for a protein recipe" />
  ) : null;
}
