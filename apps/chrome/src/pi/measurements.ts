/**
 * The two condense toggles ahead of the border's measurements, and the readings the footer
 * measured turned into the rows the border can afford. Each toggle reports the flag pi already
 * owns — ctrl+o and alt+t stay authoritative, and a click reads as one more key.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Part } from "../lib/line.ts";
import { measurementLevels } from "../lib/measurements.ts";
import type { BorderInput } from "./footer.ts";
import type { ChromeState } from "./state.ts";

// The Nerd Font range: present in Hack Nerd Font, where a text glyph like U+2692 would come from
// another font at another width and misalign the row. The terminal sits in a box rather than as a
// bare `>_`, whose underscore pulls its ink below the dashes beside it.
const GLYPH_TOOLS = "\uf489";
const GLYPH_THINKING = "\uf0eb";

// A one-cell glyph is a small target; the separator absorbs the rest.
const CHIP_HIT_PAD = 2;

/** Lit while the content is open, dim while condensing, bright under the pointer. */
const chip = (id: string, glyph: string, open: boolean): Part => ({
  id,
  text: glyph,
  action: id,
  hitPad: CHIP_HIT_PAD,
  ...(open ? { role: "accent" as const, bold: true } : { role: "dim" as const }),
});

export const createMeasurements = (pi: ExtensionAPI, state: ChromeState) => {
  /** The toggles, ahead of every level, so a narrow border drops the numbers before them. */
  const chips = (ctx: ExtensionContext): Part[] => [
    chip("tools", GLYPH_TOOLS, ctx.ui.getToolsExpanded()),
    chip("thinking", GLYPH_THINKING, !pi.getSettings().hideThinkingBlock),
  ];

  /** The border's right-hand rows, fullest first. Nothing to right-align without a model. */
  const levels = (input: BorderInput): Part[][] => {
    const ctx = state.ctx;
    if (!ctx?.model) return [];
    return measurementLevels({
      chips: chips(ctx),
      percent: input.percent,
      window: input.window,
      meters: input.meters,
    });
  };

  return { levels };
};

export type Measurements = ReturnType<typeof createMeasurements>;
