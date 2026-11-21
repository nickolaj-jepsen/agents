/** The style's glyphs, shared by every client. No host imports. */
export const tokens = {
  glyph: {
    pointer: "❯",
    single: { off: "○", on: "●" },
    multi: { off: "□", on: "■" },
  },
} as const;
