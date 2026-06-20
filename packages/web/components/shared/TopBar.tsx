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

export function TopBar() {
  const path = usePathname() ?? "/";
  const onRecipes = path.startsWith("/recipes");
  return (
    <div className="topbar">
      <div className="brand">
        <div className="mark"></div>
        <b>Batch</b>
        <span className="branch">main</span>
      </div>
      <nav className="nav">
        <Link className={onRecipes ? undefined : "on"} href="/"><TreeIcon />Tree</Link>
        <Link className={onRecipes ? "on" : undefined} href="/recipes"><CookieIcon />Recipes</Link>
      </nav>
      <div className="spacer"></div>
    </div>
  );
}
