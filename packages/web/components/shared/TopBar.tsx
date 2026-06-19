import Link from "next/link";

export function TopBar() {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="mark"></div>
        <b>Batch</b>
        <span className="branch">main</span>
      </div>
      <nav className="nav">
        <Link className="on" href="/">Tree</Link>
        <Link href="/recipes">Recipes</Link>
      </nav>
      <div className="spacer"></div>
    </div>
  );
}
