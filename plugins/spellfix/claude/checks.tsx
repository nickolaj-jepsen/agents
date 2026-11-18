/**
 * The house style's graphical rules as test assertions, for a mod's `claude plugin test`. Copied
 * into each mod beside `ui.tsx` as `claude/checks.tsx` by `just kit-sync`, since a test cannot
 * import outside its mod's folder; edit this source, never a copy. A `.tsx` file so the pi
 * build's `tsc -b`, which has no Claude types, leaves it out.
 */
import { expect } from "claude-code/testing";
import type { Mounted } from "claude-code/testing";

/** The glyphs a graphical surface draws no controls with. */
const GLYPHS = /[□■☐☑○●✎▸▾❯↑↓╰│]/;

/** What a mounted tree shows, one string per element that shows text. */
async function shown(ui: Pick<Mounted, "findAll">) {
  return (await ui.findAll({})).map((e) => e.text).filter(Boolean);
}

export type NativeOptions = {
  /** The keys of the action-row Buttons that may carry a hotkey: Submit, Send. None by default. */
  hotkeys?: readonly string[];
};

/**
 * A tree drawn for a graphical surface keeps the style's rules (`style.md`, "Graphical
 * surfaces"): no rule of repeated characters, no glyph standing in for a control, no text cut
 * by the mod, no key hints, no hotkey but on an action row, and nothing sized to the viewport:
 * no frame drawn in a colour, no width but a side rule's fraction of a cell, no height but an
 * icon's line, and only the surface cuts a line.
 */
export async function expectNative(ui: Pick<Mounted, "findAll">, options: NativeOptions = {}) {
  const hotkeys = new Set(options.hotkeys ?? []);
  for (const text of await shown(ui)) {
    expect(text).not.toMatch(/[─-]{3,}/);
    expect(text).not.toMatch(GLYPHS);
    expect(text).not.toMatch(/…$/m);
    expect(text).not.toMatch(/\b(?:ctrl\+|Enter\b|Esc\b)|\b[a-z]: /);
  }
  for (const e of await ui.findAll({})) {
    if (e.type === "Button" && !hotkeys.has(String(e.key))) expect(e.props.hotkey).toBeUndefined();
    if (e.type === "Box") {
      // Flat: a round border only for its corner, in no colour.
      if (e.props.borderStyle !== undefined) expect(e.props.borderColor).toBe("#00000000");
      expect(e.props.minHeight).toBeUndefined();
      if (e.props.width !== undefined) expect(e.props.width).toBeLessThan(1);
      if (e.props.height !== undefined) expect(e.props.height).toBe(1);
    }
    if (e.type === "Text") expect([undefined, "truncate-end"]).toContain(e.props.wrap);
  }
}
