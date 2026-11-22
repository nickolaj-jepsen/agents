/** The fixture's stories: plain data, the model and what each drawing adds. */
import type { GuiExt, Story } from "@agents/kit-core/stories.ts";
import type { Row } from "./contract.ts";

export const fixtureStories: Story<Row, { width: number }, GuiExt>[] = [
  {
    component: "fixture",
    state: "rows",
    about: "A row the keyboard is on and the pointer is over",
    model: { key: "a", text: "Where should the session store live?", focused: true, hovered: true },
    ext: { terminal: { width: 70 }, gui: { inputs: { a: { value: "", placeholder: "Note" } } } },
  },
  {
    component: "fixture",
    state: "window",
    about: "A row with many lines of detail",
    model: { key: "b", text: "Retention", detailLines: 40 },
  },
];
