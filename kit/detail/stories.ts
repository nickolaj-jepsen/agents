/** The detail's stories. No host imports. */
import type { KitStory } from "../stories.ts";
import type { Detail } from "./contract.ts";
import { detail } from "./terminal.ts";

const ITEM: Detail = {
  meta: "wrong · seen 3× · 2 days ago",
  title:
    "pi's permission gate cannot resolve shell variables, so `cat $S/id_ed25519` reads what `cat ~/.ssh/id_ed25519` denies.",
  sections: [
    {
      heading: "Why the repo didn't say it",
      text: "The docs describe the gate as matching on the command text, and nothing says the text is not expanded first.",
    },
    {
      heading: "Details",
      text: "Measured: the path projection resolves only HOME and PWD.\nAny other $VAR spelling lands inside cwd and is allowed.",
    },
    {
      heading: "Points at",
      items: [
        { key: "path", value: "modules/programs/pi/default.nix" },
        { key: "command", value: "cat $S/id_ed25519" },
        { key: "quote", value: "if it happens again, just wait", isQuote: true },
      ],
    },
  ],
};

export const detailStories: KitStory[] = [
  {
    component: "item-detail",
    state: "whole",
    about: "A dim meta line, a bold title, then sections under dim headings: prose and keyed rows",
    settings: "detail({meta, title, sections})",
    extreme: true,
    lines: (width) => detail(ITEM, width),
  },
  {
    component: "item-detail",
    state: "cut",
    about: "Cut to a height: a dim `↓ more` says there is more",
    settings: "detail({..., height: 8})",
    lines: (width) => detail({ ...ITEM, height: 8 }, width),
  },
  {
    component: "item-detail",
    state: "rule",
    about: "A section under a rule with a control at its end, scrolled: `↑ more` and `↓ more` both",
    settings:
      'detail({sections: [{rule, action: {label: "Next", hotkey: "n"}}, ...], height: 9, offset: 3})',
    lines: (width) =>
      detail(
        {
          ...ITEM,
          sections: [
            {
              rule: "Evidence 1 of 2 · 2 days ago",
              action: { label: "Next", hotkey: "n", hit: "next" },
            },
            ...(ITEM.sections ?? []),
          ],
          height: 9,
          offset: 3,
        },
        width,
      ),
  },
];
