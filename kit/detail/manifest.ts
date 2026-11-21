import { defineComponent, yes } from "../catalog/manifest.ts";

export default defineComponent({
  id: "item-detail",
  name: "Item detail",
  purpose:
    "One item read whole: a meta line, a wrapped title, sections under dim headings or a rule, keyed rows, cut to a height.",
  impl: { pi: ["detail", "detailRange"], claude: ["detail", "detailRange"] },
  status: { pi: "system", claude: "system", gui: "legacy" },
  source: "detail/terminal.ts",
  features: [
    {
      id: "whole",
      label: "A dim meta line, a bold title, then prose and keyed rows under dim headings",
      story: "item-detail/whole",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "cut",
      label: "Cut to a height, a dim `↓ more` saying there is more",
      story: "item-detail/cut",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "scroll",
      label: "Scrolled by `offset`: `↑ more` above and `↓ more` below; `detailRange` bounds it",
      story: "item-detail/rule",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "small",
      label: "Under three rows it is all text: no row goes to a marker",
      story: "item-detail/cut",
      pi: yes(),
      claude: yes(),
    },
    {
      id: "rule",
      label:
        "A section under the frame's caption rule: dim words after its first cell, a short rule between several, and a control at its end, label first and its key dim, dim when it has nothing to do",
      story: "item-detail/rule",
      pi: yes("the control's spans carry its `hit`"),
      claude: yes("the control's spans carry its `hit`"),
    },
    {
      id: "framed",
      label:
        "In a frame's body: rules across the whole width, the frame's corner after their control, and the text set in to line up with their words",
      story: "item-detail/framed",
      pi: yes(),
      claude: yes(),
    },
  ],
});
