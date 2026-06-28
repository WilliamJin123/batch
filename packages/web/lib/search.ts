/**
 * Normalize text for searching: lowercase, strip accents, drop in-word apostrophes/quotes,
 * turn any other punctuation into spaces, then collapse whitespace. This makes search
 * case-, punctuation-, and accent-insensitive — so "smores" matches "S'mores" and
 * "creme brulee" matches "Crème Brûlée".
 *
 * Apostrophes are REMOVED (s'mores -> smores) rather than spaced, because they sit
 * inside a word; other punctuation becomes a space (no-bake -> "no bake") so hyphenated
 * terms still match a two-word query.
 */
export function normalizeForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")            // strip diacritics: crème -> creme
    .replace(/['‘’‚‛ʼ`]/g, "") // drop apostrophes/quotes: s'mores -> smores
    .replace(/[^a-z0-9]+/g, " ")                                 // any other punctuation -> space
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Case/punctuation/accent-insensitive substring search across several haystacks (e.g. a
 * recipe's name, family, and tags). Matches anywhere in the text, not just a prefix.
 * An empty/whitespace query matches everything. This is the single matcher every recipe
 * search surface (tree drawer, recipes table, …) should use, so they all behave the same.
 */
export function matchesSearch(haystacks: string[], query: string): boolean {
  const q = normalizeForSearch(query);
  if (q === "") return true;
  return haystacks.some((h) => normalizeForSearch(h).includes(q));
}
