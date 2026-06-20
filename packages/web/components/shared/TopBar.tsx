"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** little inline glyphs so the tabs read at a glance — a node tree for the graph, a cookie for recipes */
const TreeIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="8" cy="3" r="1.9" /><circle cx="3.5" cy="13" r="1.9" /><circle cx="12.5" cy="13" r="1.9" />
    <path d="M8 4.9v3.1M8 8c-4.5 0-4.5 1-4.5 3.1M8 8c4.5 0 4.5 1 4.5 3.1" />
  </svg>
);
const CookieIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
    <circle cx="8" cy="8" r="6" />
    <circle cx="6" cy="6.3" r=".95" fill="currentColor" stroke="none" />
    <circle cx="10.2" cy="7" r=".95" fill="currentColor" stroke="none" />
    <circle cx="7.6" cy="10.4" r=".95" fill="currentColor" stroke="none" />
  </svg>
);

/** Brand mark: a warm stack of layers — a "batch" (and a nod to stacked bakes / versions).
 *  Distinct from the single-cookie Recipes tab. */
const BatchMark = () => (
  <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
    <ellipse cx="12" cy="17" rx="8.6" ry="3" fill="#8f5e20" />
    <ellipse cx="12" cy="12" rx="8.6" ry="3" fill="#b47a37" />
    <ellipse cx="12" cy="7" rx="8.6" ry="3" fill="#cf9f3f" />
  </svg>
);

export function TopBar() {
  const path = usePathname() ?? "/";
  const onRecipes = path.startsWith("/recipes");
  return (
    <div className="topbar">
      <div className="brand">
        <BatchMark />
        <b>Batch</b>
      </div>
      <nav className="nav">
        <Link className={onRecipes ? undefined : "on"} href="/"><TreeIcon />Tree</Link>
        <Link className={onRecipes ? "on" : undefined} href="/recipes"><CookieIcon />Recipes</Link>
      </nav>
      <div className="spacer"></div>
      <span className="branch" title="current branch">main</span>
    </div>
  );
}
