/** The sheet's stories. No host imports. */
import { buttonRow } from "../buttons/terminal.ts";
import { CARD_INSET } from "../card/terminal.ts";
import { fieldHit } from "../fields/contract.ts";
import { fields } from "../fields/terminal.ts";
import { blank, block, inline, line, span, type Line } from "../lines.ts";
import type { KitStory } from "../stories.ts";
import { sheetRoom } from "./contract.ts";
import { sheet, sheetHead } from "./terminal.ts";

/** A row behind the pointer's column, with as many cells kept clear at its right. */
const set = (l: Line): Line =>
  l.spans.length ? { ...l, spans: [span(CARD_INSET), ...l.spans] } : l;
const inner = (width: number) => width - 2 * CARD_INSET.length;

const body = (width: number): Line[] =>
  [
    ...block(
      inline("Honor `Retry-After` when the sync worker backs off", { bold: true }),
      inner(width),
    ),
    blank(),
    ...fields(
      [
        { key: "T", label: "Team", value: "Platform", hit: fieldHit("team") },
        { key: "P", label: "Priority", value: "Medium", hit: fieldHit("priority") },
      ],
      inner(width),
      { active: true },
    ),
    blank(),
  ].map(set);

const footer = (width: number) =>
  buttonRow(
    [
      { hotkey: "enter", label: "Create", hit: "create", isLit: true },
      { hotkey: "d", label: "Discard", hit: "discard" },
    ],
    inner(width),
  ).map(set);

export const sheetStories: KitStory[] = [
  {
    component: "sheet",
    state: "title",
    about: "A panel laid over the screen: the title and Close in its top edge, buttons at its foot",
    settings: "sheet({title, close: {}, body, footer})",
    extreme: true,
    width: "dialog",
    lines: (width) =>
      sheet({
        width,
        title: "Linear draft",
        close: {},
        body: body(sheetRoom(width)),
        footer: footer(sheetRoom(width)),
      }),
  },
  {
    component: "sheet",
    state: "confirm",
    about: "Close asks before the draft goes, in the place it stood; a notice above the buttons",
    settings: "sheet({close: {confirming: true, question}, notice})",
    width: "dialog",
    lines: (width) =>
      sheet({
        width,
        title: "Linear draft",
        close: { confirming: true, question: "Discard draft?" },
        body: body(sheetRoom(width)),
        notice: set(line([span("PLT-212 may already cover this", { role: "warning" })])),
        footer: footer(sheetRoom(width)),
      }),
  },
  {
    component: "sheet",
    state: "head",
    about: "The top edge alone, for a host that frames the panel itself",
    settings: "sheetHead({title, close: {confirming: true, question}})",
    width: "dialog",
    lines: (width) => [
      sheetHead({ width, title: "Linear draft" }),
      sheetHead({
        width,
        title: "Linear draft",
        close: { confirming: true, question: "Discard draft?" },
      }),
    ],
  },
];
