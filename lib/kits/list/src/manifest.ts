import { defineComponent } from "@agents/kit-core/manifest.ts";
import { listFields, listNeeds } from "./contract.ts";

/** A note every graphical surface shares. */
const gui = (note: string) => ({ vscode: note, desktop: note, mobile: note }) as const;

export default defineComponent({
  schema: 2,
  id: "grouped-list",
  name: "Grouped list",
  purpose:
    "Rows with a mark and a line or two each, under group rows, behind rails or bare; taller than its room, a window.",
  contract: { fields: listFields, needs: listNeeds },
  parts: {
    list: {},
    listFollow: {
      drawings: ["terminal"],
      none: { gui: "the host scrolls; there is no window to follow" },
    },
    listTopMax: {
      drawings: ["terminal"],
      none: { gui: "the host scrolls; there is no window to bound" },
    },
    listShowsWhole: {
      drawings: ["terminal"],
      none: { gui: "a row is shown whole or cut by the host" },
    },
    listRows: { drawings: ["terminal"], none: { gui: "the host counts no rows" } },
    listTextRoom: { drawings: ["terminal"], none: { gui: "the host sets no cells" } },
    cutLeft: {
      drawings: ["terminal"],
      none: { gui: "a heading wraps instead of being cut in cells" },
    },
  },
  features: [
    {
      id: "groups",
      label:
        "Groups behind the card's rail: green once every row is decided, bright by the keyboard's group, whose label is in the accent",
      fields: ["groups"],
      story: "grouped-list/groups",
      limits: gui(
        "no rail; the heading is in the `section` role, in the accent for the keyboard's group, with a check once every row is decided",
      ),
    },
    {
      id: "marks",
      label:
        "A row left alone, chosen (the accent, a filled mark) or set aside (the whole row dim); its mark a control apart from its text",
      story: "grouped-list/groups",
      limits: {
        pi: "the pointer column and the mark carry `markHit`, the text `hit`",
        "claude-terminal": "the pointer column and the mark are a Button of their own",
        ...gui(
          "an icon, the chosen one in the accent; a `markHit` adds a quiet Button naming what a press steps the mark to (`Choose`, `Set aside`, `Restore`), never filled",
        ),
      },
    },
    {
      id: "icons",
      label:
        "A row's kind or state as a meaning icon (`kind:stale`, `decision:apply`), so it reads without its buttons",
      story: "grouped-list/groups",
      limits: {
        pi: "a terminal keeps the mark",
        "claude-terminal": "a terminal keeps the mark",
      },
    },
    {
      id: "aside",
      label: "An aside column every row keeps, blank where a row has none, so cut text lines up",
      fields: ["aside"],
      needs: ["cells"],
      story: "grouped-list/groups",
    },
    {
      id: "aside-text",
      label:
        "A row's aside follows its text, dim, in digits of one width; it never takes a column from long text",
      story: "grouped-list/groups",
      limits: {
        pi: "the aside is a column at the right",
        "claude-terminal": "the aside is a column at the right",
      },
    },
    {
      id: "actions",
      label: "Dim controls at the right of a group's row, bold under the mouse",
      story: "grouped-list/groups",
      limits: gui("quiet Buttons at the heading's far edge, those with a `hit`"),
    },
    {
      id: "window",
      label:
        "Taller than its room: a window from `top` that `listFollow` moves only when the keyboard would leave it, its last row saying how many rows are above and below",
      fields: ["height", "top"],
      needs: ["window"],
      story: "grouped-list/window",
      limits: {
        pi: "the wheel moves `top`; `listTopMax` bounds it",
        "claude-terminal":
          "the wheel reaches the mod as `ui.scroll` with the row under the pointer",
      },
    },
    {
      id: "sticky",
      label: "The keyboard's group row stands in for the window's first row when it is above it",
      needs: ["window"],
      story: "grouped-list/sticky",
    },
    {
      id: "space",
      label:
        "A blank row between groups, without a rail: a line of the list, which a window scrolls past",
      fields: ["space"],
      needs: ["cells"],
      story: "grouped-list/spaced",
    },
    {
      id: "bare",
      label:
        "No rails, where the list is not a form to complete: a group's label starts the row, and nothing says a group is decided",
      fields: ["rail"],
      needs: ["cells"],
      story: "grouped-list/bare",
    },
    {
      id: "lines",
      label:
        "Rows of several lines: a text wraps under its first line up to `lines`, the window counts and follows lines, and a row its end cuts ends in `…`",
      fields: ["lines"],
      story: "grouped-list/wrapped",
      limits: {
        "claude-terminal": "a later line is a Button of its own with the row's `hit`",
        ...gui(
          "`lines: 1` is one line the surface cuts at its edge, an opened row whole; more lines wrap whole, since the surface cannot clamp a count",
        ),
      },
    },
    {
      id: "flat",
      label: "Little room: rows carry their group's label, dim, and there are no group rows",
      fields: ["flat"],
      needs: ["cells"],
      story: "grouped-list/flat",
    },
    {
      id: "key",
      label:
        "A key before a row's mark, dim and in the accent in the keyboard's group, one column for the widest; a row marked `none` draws no mark, and where every row does the list keeps no cell for it",
      needs: ["cells"],
      story: "grouped-list/menu",
      limits: {
        pi: "the caller owns the binding",
        "claude-terminal": "the caller owns the binding",
      },
    },
    {
      id: "unlabelled",
      label: "A group with no label draws no group row: a menu's rows are the whole list",
      story: "grouped-list/menu",
    },
    {
      id: "literal",
      label: "A row's text that is a name or a path: shown as it is, not read as Markdown",
      story: "grouped-list/menu",
    },
    {
      id: "action",
      label:
        "The word on a row's control, where rows of one list do different things (`Open`, `Copy`)",
      fields: ["action"],
      needs: ["cells:false"],
      story: "grouped-list/menu",
    },
    {
      id: "disabled",
      label: "A row that cannot be used now: dim, with its aside, and no control",
      story: "grouped-list/menu",
      limits: {
        pi: "no `hit` nor `markHit`; the key is dim too",
        "claude-terminal": "no `hit` nor `markHit`; the key is dim too",
      },
    },
    {
      id: "more",
      label: "A long group shows `maxItems` rows, then a `Show N more` control",
      fields: ["more", "maxItems"],
      needs: ["cells:false"],
      story: "grouped-list/capped",
    },
    {
      id: "opened",
      label:
        "A row opened in place: what belongs to it under its text, in a panel, whose `hit` keys it and whose Button says `Close`",
      fields: ["opened", "closeAction"],
      needs: ["cells:false"],
      story: "grouped-list/opened",
    },
    {
      id: "hover",
      label: "The row under the pointer is shown",
      needs: ["hover:kit|painter"],
      story: "grouped-list/groups",
      limits: {
        pi: "the row is bold, like the keyboard's, without its pointer; `hovered` names it",
        "claude-terminal":
          "the row sits on a soft fill: the engine inverts it, and the painter swaps its colours first",
      },
    },
  ],
} as const);
