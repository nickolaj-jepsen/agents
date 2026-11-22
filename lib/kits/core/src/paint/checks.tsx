/**
 * The house style's graphical rules as test assertions, for a mod's `claude plugin test`: a mod's
 * test imports it from `@agents/kit-core/paint/checks.tsx` and the build bundles it. A `.tsx` file
 * so the package's `tsc -b`, which has no Claude types, leaves it out.
 */
import { expect } from "claude-code/testing";
import type { Mounted } from "claude-code/testing";
import { tokens } from "../tokens.ts";

/** The glyphs a graphical surface draws no controls with. */
const GLYPHS = /[□■☐☑○●✎▸▾❯↑↓╰│]/;

/**
 * What a mounted tree shows, one string per element that shows text. A `Markdown`'s text is
 * source the host draws (its table rules and code fences are not painted), so it is cut out of
 * the elements that hold it too, a Box's text being its children's.
 */
async function shown(ui: Pick<Mounted, "findAll">) {
  const all = await ui.findAll({});
  const sources = all.filter((e) => e.type === "Markdown" && e.text).map((e) => e.text);
  return all
    .filter((e) => e.type !== "Markdown")
    .map((e) => sources.reduce((text, source) => text.replaceAll(source, ""), e.text ?? ""))
    .filter(Boolean);
}

export type NativeOptions = {
  /** The keys of the action-row Buttons that may carry a hotkey: Submit, Send. None by default. */
  hotkeys?: readonly string[];
};

/**
 * A tree drawn for a graphical surface keeps the style's rules (`style.md`, "Graphical
 * surfaces"): no rule of repeated characters, no glyph standing in for a control, no text cut
 * by the mod, no key hints, no hotkey but on an action row, and nothing sized to the viewport:
 * no frame drawn in a colour, no width but a side rule's fraction of a cell or a message's
 * reading measure (`tokens.prose`), no height but an icon's line, and only the surface cuts a
 * line.
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
      // The reading measure is the one width a Box may have: a message is sized by its content, so
      // text that wraps would otherwise be a column of a few cells.
      if (e.props.width !== undefined && e.props.width !== tokens.prose)
        expect(e.props.width).toBeLessThan(1);
      if (e.props.height !== undefined) expect(e.props.height).toBe(1);
    }
    if (e.type === "Text") expect([undefined, "truncate-end"]).toContain(e.props.wrap);
  }
}
