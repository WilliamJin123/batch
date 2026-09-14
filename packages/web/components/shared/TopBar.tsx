"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Brand mark: a rounded sheet with one row highlighted — a schedule with what's next marked. */
const BatchMark = () => (
  <svg className="mark" viewBox="0 0 18 18" aria-hidden="true">
    <rect x="1" y="1" width="16" height="16" rx="4" fill="none" style={{ stroke: "var(--ink)" }} strokeWidth="1.6" />
    <rect x="1.8" y="6.5" width="14.4" height="4.5" style={{ fill: "var(--hi)" }} />
    <path d="M1.8 6.5h14.4M1.8 11h14.4" style={{ stroke: "var(--ink)" }} strokeWidth="1" />
  </svg>
);

export function TopBar() {
  const path = usePathname() ?? "/";
  const onRecipes = path.startsWith("/recipes");
  const onQueue = path.startsWith("/queue");
  const onMixins = path.startsWith("/mixins");
  const onTree = !onRecipes && !onQueue && !onMixins;
  return (
    <div className="topbar">
      <div className="brand">
        <BatchMark />
        <b>Batch</b>
      </div>
      <nav className="nav">
        <Link aria-label="Recipe tree" className={onTree ? "on" : undefined} href="/">Tree</Link>
        <Link aria-label="Recipes" className={onRecipes ? "on" : undefined} href="/recipes">Recipes</Link>
        <Link aria-label="Cooking queue" className={onQueue ? "on" : undefined} href="/queue">Queue</Link>
        <Link aria-label="Mix-ins" className={onMixins ? "on" : undefined} href="/mixins">Mix-ins</Link>
      </nav>
      <div className="spacer"></div>
      <span className="branch" title="current branch">main</span>
    </div>
  );
}
