"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Site-wide keyboard navigation (lives in the layout, so it works on every page):
 *  T → tree, R → recipes, ? → this shortcuts overlay. Tree-canvas keys (move/zoom/L/find)
 *  live in TreeView. Everything is toggle/letter based — nothing depends on Esc (flaky on some Macs),
 *  and any Ctrl/Cmd/Alt combo is ignored so real browser/OS shortcuts pass straight through. */
function Row({ k, d }: { k: string; d: string }) {
  return <div className="krow"><kbd>{k}</kbd><span>{d}</span></div>;
}

export function KeyboardNav() {
  const router = useRouter();
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName ?? "";
      if (el?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; // typing
      if (e.ctrlKey || e.metaKey || e.altKey) return;                                                 // leave OS/browser combos
      if (e.code === "Slash" && e.shiftKey) { e.preventDefault(); setHelp((h) => !h); return; }       // ? toggles help
      if (e.shiftKey) return;                                                                         // (Shift is "sprint" on the canvas)
      if (e.code === "KeyT") { e.preventDefault(); setHelp(false); router.push("/"); return; }
      if (e.code === "KeyR") { e.preventDefault(); setHelp(false); router.push("/recipes"); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  if (!help) return null;
  return (
    <div className="kmodal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onMouseDown={() => setHelp(false)}>
      <div className="kpanel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="khead"><b>Keyboard shortcuts</b><button className="kx" onClick={() => setHelp(false)} aria-label="Close shortcuts">✕</button></div>
        <div className="kcols">
          <div className="kgrp">
            <div className="kgt">Navigate</div>
            <Row k="T" d="Recipe tree" />
            <Row k="R" d="Recipes" />
            <Row k="/" d="Find a recipe" />
            <Row k="L" d="Toggle legend" />
            <Row k="?" d="This help" />
          </div>
          <div className="kgrp">
            <div className="kgt">Tree canvas</div>
            <Row k="WASD / ↑↓←→" d="Move around" />
            <Row k="+  −" d="Zoom in / out" />
            <Row k="F" d="Fit to screen" />
            <Row k="Shift" d="Sprint (hold)" />
            <Row k="Space" d="Slow (hold)" />
            <Row k="Click" d="Open a recipe" />
            <Row k="⌫" d="Close the card" />
          </div>
        </div>
        <div className="kfoot">Press <kbd>?</kbd> any time · nothing uses Ctrl/Cmd so your browser shortcuts still work</div>
      </div>
    </div>
  );
}
