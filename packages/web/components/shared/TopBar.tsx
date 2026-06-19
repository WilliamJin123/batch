"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
        <Link className={onRecipes ? undefined : "on"} href="/">Tree</Link>
        <Link className={onRecipes ? "on" : undefined} href="/recipes">Recipes</Link>
      </nav>
      <div className="spacer"></div>
    </div>
  );
}
