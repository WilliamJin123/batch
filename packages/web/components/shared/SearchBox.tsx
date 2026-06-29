"use client";
import { forwardRef } from "react";

export interface SearchBoxProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
  /** extra class on the wrapper (e.g. "wide" for the recipes table). */
  className?: string;
  /** Enter pressed with a query — hosts use it to open the top match. */
  onEnter?: () => void;
  /** When set, Escape (and "/") call this instead of clearing — e.g. the tree drawer closes itself.
   *  When absent, Escape clears the field. */
  onDismiss?: () => void;
}

/** One search input for every recipe surface (tree drawer, recipes table, cooking queue) so they
 *  look and behave identically: a clear (✕) button, Enter to open the top match, Escape to clear
 *  (or dismiss, when the host passes onDismiss). Pair it with the shared matchesSearch() matcher so
 *  every surface filters the same punctuation/accent-insensitive way. */
export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox(
  { value, onChange, placeholder, ariaLabel, autoFocus, className, onEnter, onDismiss },
  ref,
) {
  return (
    <div className={`sbx${className ? " " + className : ""}`}>
      <input
        ref={ref}
        className="sbx-in"
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (onEnter) { e.preventDefault(); onEnter(); }
          } else if (e.key === "Escape" || e.key === "/") {
            if (e.key === "/" && !onDismiss) return; // "/" is a literal character unless it dismisses
            e.preventDefault();
            if (onDismiss) onDismiss();
            else if (value) onChange("");
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder ?? "Search"}
      />
      {value && (
        <button
          type="button"
          className="sbx-clear"
          aria-label="Clear search"
          onMouseDown={(e) => e.preventDefault()} /* don't steal focus from the input */
          onClick={() => onChange("")}
        >
          ✕
        </button>
      )}
    </div>
  );
});
