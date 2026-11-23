import { defineComponent } from "@agents/kit-core/manifest.ts";
import { detailFields, detailNeeds } from "./contract.ts";

/** A note every graphical surface shares. */
const gui = (note: string) => ({ vscode: note, desktop: note, mobile: note }) as const;

export default defineComponent({
  schema: 2,
  id: "item-detail",
  name: "Item detail",
  purpose:
    "One item read whole: a meta line, a wrapped title, sections under dim headings or a rule, keyed rows, cut to a height.",
  contract: { fields: detailFields, needs: detailNeeds },
  parts: {
    detail: {},
    detailRange: {
      drawings: ["terminal"],
      none: { gui: "the surface scrolls the pane; there is no window to bound" },
    },
  },
  features: [
    {
      id: "whole",
      label: "A dim meta line, a bold title, then prose and keyed rows under dim headings",
      fields: ["meta", "title", "sections"],
      story: "item-detail/whole",
      limits: gui(
        "the meta is a caption, the title a heading, a section's heading the `section` role",
      ),
    },
    {
      id: "title-max",
      label: "A title takes the rows it may; the last of a cut one ends in `…`",
      fields: ["titleMax"],
      needs: ["cells"],
      story: "item-detail/whole",
    },
    {
      id: "cut",
      label: "Cut to a height, a dim `↓ 7 more` counting what is below",
      fields: ["height"],
      needs: ["window"],
      story: "item-detail/cut",
    },
    {
      id: "scroll",
      label:
        "Scrolled by `offset`, with the window every kit component scrolls by (`scrolled`): `↑ n more` above and `↓ n more` below; `detailRange` bounds it",
      fields: ["offset"],
      needs: ["window"],
      story: "item-detail/rule",
    },
    {
      id: "small",
      label: "Under three rows it is all text: no row goes to a marker",
      needs: ["window"],
      story: "item-detail/cut",
    },
    {
      id: "rule",
      label:
        "A section under the frame's caption rule: dim words after its first cell, a short rule between several, and a control at its end, label first and its key dim, dim when it has nothing to do",
      story: "item-detail/rule",
      limits: {
        pi: "the control's spans carry its `hit`",
        "claude-terminal": "the control's spans carry its `hit`",
        ...gui("the words are a `section` heading, the control a quiet Button at the far edge"),
      },
    },
    {
      id: "framed",
      label:
        "In a frame's body: rules across the whole width, the frame's corner after their control, and the text set in to line up with their words",
      fields: ["framed"],
      needs: ["cells"],
      story: "item-detail/framed",
    },
    {
      id: "hit",
      label: "The whole item is a control: every row but a rule's action",
      fields: ["hit"],
      story: "item-detail/rule",
    },
    {
      id: "hover",
      label: "Under the mouse the meta line is bold",
      fields: ["hovered"],
      needs: ["hover:kit|painter"],
      story: "item-detail/rule",
    },
    {
      id: "action",
      label: "The word on the item's Button, under the title or at the first row's far edge",
      fields: ["action", "isActionAtEdge"],
      needs: ["cells:false"],
      story: "item-detail/button",
    },
    {
      id: "flush",
      label: "In a panel or another block with an inset: none of its own",
      fields: ["isFlush"],
      needs: ["cells:false"],
      story: "item-detail/flush",
    },
    {
      id: "items",
      label: "Keyed rows: a dim key column, each value wrapped beside its key, a quote in marks",
      story: "item-detail/whole",
      limits: gui("an aligned two-column block; a quote stays italic"),
    },
  ],
} as const);
