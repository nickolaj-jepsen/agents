import { defineComponent, no, yes } from "@agents/kit-core/manifest.ts";

export default defineComponent({
  id: "item-detail",
  name: "Item detail",
  purpose:
    "One item read whole: a meta line, a wrapped title, sections under dim headings or a rule, keyed rows, cut to a height.",
  impl: { pi: ["detail", "detailRange"], claude: ["detail", "detailRange"], gui: "detail" },
  status: { pi: "system", claude: "system", gui: "system" },
  source: "detail/src/terminal.ts",
  features: [
    {
      id: "whole",
      label: "A dim meta line, a bold title, then prose and keyed rows under dim headings",
      story: "item-detail/whole",
      pi: yes(),
      claude: yes(),
      gui: yes("meta dim, the title semibold and wrapped, Markdown text, a dim heading"),
    },
    {
      id: "cut",
      label: "Cut to a height, a dim `↓ 7 more` counting what is below",
      story: "item-detail/cut",
      pi: yes(),
      claude: yes(),
      gui: no("the surface scrolls the pane, so a detail is never cut"),
    },
    {
      id: "scroll",
      label:
        "Scrolled by `offset`, with the window every kit component scrolls by (`scrolled`): `↑ n more` above and `↓ n more` below; `detailRange` bounds it",
      story: "item-detail/rule",
      pi: yes(),
      claude: yes(),
      gui: no("the surface scrolls the pane; `detailRange` has nothing to bound"),
    },
    {
      id: "small",
      label: "Under three rows it is all text: no row goes to a marker",
      story: "item-detail/cut",
      pi: yes(),
      claude: yes(),
      gui: no("there is no window to mark"),
    },
    {
      id: "rule",
      label:
        "A section under the frame's caption rule: dim words after its first cell, a short rule between several, and a control at its end, label first and its key dim, dim when it has nothing to do",
      story: "item-detail/rule",
      pi: yes("the control's spans carry its `hit`"),
      claude: yes("the control's spans carry its `hit`"),
      gui: yes("dim semibold words, the control a quiet Button at the far edge"),
    },
    {
      id: "framed",
      label:
        "In a frame's body: rules across the whole width, the frame's corner after their control, and the text set in to line up with their words",
      story: "item-detail/framed",
      pi: yes(),
      claude: yes(),
      gui: no("the host frames the pane; text is set at the inset"),
    },
    {
      id: "hit",
      label:
        "The whole item is a control: every row but a rule's action, the meta line bold under the mouse",
      story: "item-detail/rule",
      pi: yes(),
      claude: yes(),
      gui: yes(
        "a quiet Button under the title, its word the `action` option (a Button never wraps), or at the first row's far edge with `isActionAtEdge`",
      ),
    },
    {
      id: "items",
      label: "Keyed rows: a dim key column, each value wrapped beside its key, a quote in marks",
      story: "item-detail/whole",
      pi: yes(),
      claude: yes(),
      gui: yes("a two-column block; a quote is in italics"),
    },
  ],
});
