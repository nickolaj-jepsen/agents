/** The visitor's harness, remembered across the site; `null` is both, or never chosen. */
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

/** Where the visitor last looked at Claude Code in a plugin's gallery; `null` is never chosen. */
const SURFACE = "agents-s";

export function readSurface(): "terminal" | "vscode" | null {
  try {
    const v = localStorage.getItem(SURFACE);
    return v === "terminal" || v === "vscode" ? v : null;
  } catch {
    return null;
  }
}

export function writeSurface(s: string): void {
  try {
    if (s === "terminal" || s === "vscode") localStorage.setItem(SURFACE, s);
  } catch {}
}
