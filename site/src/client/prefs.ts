/**
 * The visitor's harness, remembered across the site: the gallery's switch and the catalogue's
 * share it. `null` is both (the catalogue's default) or never chosen.
 */
const KEY = "agents-h";

export function readHarness(): "claude" | "pi" | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "claude" || v === "pi" ? v : null;
  } catch {
    return null;
  }
}

export function writeHarness(h: string | null): void {
  try {
    if (h === "claude" || h === "pi") localStorage.setItem(KEY, h);
    else localStorage.removeItem(KEY);
  } catch {}
}
