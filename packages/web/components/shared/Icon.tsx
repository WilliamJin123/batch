/** Control glyphs, drawn as 1.5px strokes on a 16px grid so they sit on the ledger's rules. */
export type IconName = "undo" | "redo" | "plus" | "minus" | "fit" | "list" | "close" | "key" | "chevron" | "back" | "external" | "up" | "bracket" | "fork";

const P: Record<IconName, JSX.Element> = {
  undo: <><path d="M6 4 2.5 7.5 6 11" /><path d="M2.5 7.5H10a3.5 3.5 0 0 1 0 7H7" /></>,
  redo: <><path d="m10 4 3.5 3.5L10 11" /><path d="M13.5 7.5H6a3.5 3.5 0 0 0 0 7h3" /></>,
  plus: <><path d="M8 3v10M3 8h10" /></>,
  minus: <path d="M3 8h10" />,
  fit: <><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></>,
  list: <><path d="M2 4h12M2 8h12M2 12h12" /></>,
  close: <><path d="M3 3l10 10M13 3 3 13" /></>,
  key: <><rect x="2" y="3" width="12" height="10" /><path d="M2 7h12M6 7v6" /></>,
  chevron: <path d="m6 3 5 5-5 5" />,
  back: <><path d="M13 8H3" /><path d="m7 4-4 4 4 4" /></>,
  external: <><path d="M7 3H3v10h10V9" /><path d="M9 2h5v5M14 2 7 9" /></>,
  up: <><path d="M8 13V3" /><path d="m4 7 4-4 4 4" /></>,
  bracket: <><path d="M6 2H3v12h3" /><path d="M9 8h5" strokeDasharray="2 2" /></>,
  fork: <><path d="M4 2v4a4 4 0 0 0 4 4 4 4 0 0 0 4-4V2" /><path d="M8 10v4" /></>,
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg className="ic" viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      {P[name]}
    </svg>
  );
}
