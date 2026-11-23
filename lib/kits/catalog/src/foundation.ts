/**
 * The design foundation's stories: type roles, a panel, icons that carry meaning, and the row
 * rhythm, each shown alone before any component uses it. The terminal's form is drawn here as
 * lines; the graphical one is `foundation.tsx`. Not a component: no manifest, no snapshot of its
 * own, drawn by the catalogue so `/kit foundation icons` is how a role, a panel or an icon is
 * looked at. No host imports.
 */
import { blank, line, meaningSpan, panelLines, span, typed } from "@agents/kit-core/lines.ts";
import { meanings, type MeaningName } from "@agents/kit-core/icons.ts";
import type { KitStory } from "@agents/kit-core/stories.ts";
import { surfaceNames } from "@agents/kit-core/surfaces.ts";
import { tokens, type TypeRole } from "@agents/kit-core/tokens.ts";

export const ROLES = Object.keys(tokens.type) as TypeRole[];

export const SAMPLES: Record<TypeRole, string> = {
  title: "Doc suggestions",
  heading: "just build is not enough to verify a pi change",
  section: "Evidence",
  body: "AGENTS.md: the line contradicts what the code does now.",
  caption: "seen 3 times, 2 days ago",
};

/** The meanings, by family, as the icons story lists them. */
export const FAMILIES = (() => {
  const by = new Map<string, MeaningName[]>();
  for (const name of Object.keys(meanings) as MeaningName[]) {
    const family = name.split(":")[0] ?? "";
    by.set(family, [...(by.get(family) ?? []), name]);
  }
  return [...by];
})();

export const foundationStories: KitStory[] = [
  {
    component: "foundation",
    state: "roles",
    about:
      "The type roles: a graphical surface sizes each, a terminal keeps one size with bold or dim",
    settings: "typed(g, role, text)",
    surfaces: surfaceNames,
    lines: () => [
      ...ROLES.map((role) => line([typed(role, SAMPLES[role])])),
      blank(),
      line([typed("caption", "Tabular digits: 1 112 and 8 888 line up")]),
    ],
  },
  {
    component: "foundation",
    state: "panel",
    about:
      "What opens in place sits in a panel: filled on a graphical surface, on a rail on a terminal",
    settings: "panel(g, {}, …parts)",
    surfaces: surfaceNames,
    lines: () => [
      line([typed("body", "AGENTS.md")]),
      ...panelLines([
        line([typed("heading", "Edit the claim")]),
        line([typed("body", "The line contradicts what the code does now.")]),
        line([span("Apply", { role: "accent" }), span("  Dismiss")]),
      ]),
      line([typed("body", "README.md")]),
    ],
  },
  {
    component: "foundation",
    state: "icons",
    about:
      "Icons carry a meaning: an Svg in its role's colour on a graphical surface, a glyph on a terminal",
    settings: "meaning(g, name)",
    surfaces: surfaceNames,
    extreme: true,
    lines: () =>
      FAMILIES.flatMap(([family, names]) => [
        line([typed("section", family)]),
        ...names.map((name) => line([meaningSpan(name), span(`  ${name}`)])),
      ]),
  },
  {
    component: "foundation",
    state: "light",
    about:
      "Every icon on a white well and a near-black one: an Svg is an image and keeps its colours on a light theme",
    settings: "meaning(g, name)",
    surfaces: surfaceNames,
    lines: () =>
      Object.keys(meanings).map((name) =>
        line([meaningSpan(name as MeaningName), span(`  ${name}`)]),
      ),
  },
  {
    component: "foundation",
    state: "rhythm",
    about: "Rows keep one height, whether or not one holds a Button, and one gap",
    settings: "rowOf(g, {}, …parts), rows(g, {}, …rows)",
    surfaces: surfaceNames,
    lines: () => [
      line([span("A row of text")]),
      line([span("A row with a button  "), span("Open", { role: "accent" })]),
      line([span("A row of text")]),
    ],
  },
];
