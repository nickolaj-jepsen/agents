/**
 * Fireproof, the Flexoki variant of `~/nixos/modules/base/theme.nix`, as the code blocks' Shiki
 * theme. Code sits on the page ground (bg), where every token colour here reads at 4.5:1 or
 * better; blue is the only hue nudged lighter to get there (DESIGN.md, Colour).
 */
import type { ShikiConfig } from "@astrojs/markdown-remark";

type ThemeRegistration = Exclude<ShikiConfig["theme"], string | undefined>;

export const palette = {
  bg: "#1C1B1A",
  bgAlt: "#282726",
  fg: "#DAD8CE",
  fgAlt: "#B7B5AC",
  muted: "#878580",
  ui: "#343331",
  uiAlt: "#403E3C",
  accent: "#CF6A4C",
  accentContainer: "#6B3528",
  red: "#DB5F53", // #D14D41 nudged to 4.5:1 on bg
  orange: "#DA702C",
  yellow: "#D0A215",
  green: "#879A39",
  cyan: "#3AA99F",
  blue: "#4D8EC6", // #4385BE nudged to 4.5:1 on bg
  purple: "#8B7EC8",
  magenta: "#CE5D97",
} as const;

const p = palette;

export const fireproof: ThemeRegistration = {
  name: "fireproof",
  type: "dark",
  colors: { "editor.background": p.bg, "editor.foreground": p.fg },
  tokenColors: [
    { settings: { foreground: p.fg } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: p.muted } },
    {
      scope: ["keyword", "storage", "storage.type", "keyword.control", "variable.language"],
      settings: { foreground: p.green },
    },
    { scope: ["keyword.operator", "punctuation", "meta.brace"], settings: { foreground: p.fgAlt } },
    {
      scope: ["string", "string.quoted", "punctuation.definition.string", "markup.inline.raw"],
      settings: { foreground: p.cyan },
    },
    {
      scope: ["constant.numeric", "constant.language", "constant.character", "support.constant"],
      settings: { foreground: p.purple },
    },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call entity.name.function",
      ],
      settings: { foreground: p.orange },
    },
    {
      scope: [
        "entity.name.type",
        "entity.name.class",
        "support.type",
        "support.class",
        "entity.other.inherited-class",
      ],
      settings: { foreground: p.yellow },
    },
    {
      scope: [
        "support.type.property-name",
        "meta.object-literal.key",
        "entity.name.tag",
        "variable.other.property",
      ],
      settings: { foreground: p.blue },
    },
    {
      scope: ["entity.other.attribute-name", "variable.parameter"],
      settings: { foreground: p.magenta },
    },
    { scope: ["markup.heading", "markup.bold"], settings: { foreground: p.fg, fontStyle: "bold" } },
    { scope: ["markup.italic"], settings: { fontStyle: "italic" } },
    { scope: ["markup.deleted"], settings: { foreground: p.red } },
    { scope: ["markup.inserted"], settings: { foreground: p.green } },
    // Shell: the command in a line reads as the function, its flags as parameters.
    {
      scope: ["entity.name.command", "support.function.builtin.shell"],
      settings: { foreground: p.orange },
    },
  ],
};
