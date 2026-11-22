import type { Turn } from "@agents/drive/lib/harness.ts";
import { poster, site, slow } from "@agents/drive/lib/site.ts";

/** A repository with one commit, so `wt` has a default branch to branch from. */
const setup = (ctx: { write(rel: string, content: string): void; initRepo(): void }) => {
  ctx.initRepo();
  ctx.write("src/sync.ts", "export const retry = (n: number) => n * 2;\n");
};

const turns: Turn[] = [
  { toolCall: { name: "enter_worktree", arguments: { name: "spike" } } },
  { text: "The retry change is ready to test in the spike worktree." },
  { toolCall: { name: "exit_worktree", arguments: { action: "keep" } } },
  { text: "Back in the primary checkout. The spike worktree is still open." },
];

/**
 * `wt` ships with the system config these plugins are wired into, not with this flake, so a
 * recording on a machine without it (CI) gets a stand-in. The plugin only reads paths out of
 * `wt`, and the demo is about the session moving: this keeps `wt`'s layout,
 * `worktrees/<repo>/<name>` beside the agent's folder, and remembers the checkout it was
 * called from for `cd --main`.
 */
const WT = `#!/bin/sh
bin=$(dirname "$0")
state="$bin/../wt-main"
case "$1" in
  new)
    main=$(cat "$state" 2>/dev/null || pwd)
    [ -f "$state" ] || printf %s "$main" > "$state"
    dest="$bin/../worktrees/$(basename "$main")/$2"
    mkdir -p "$dest"
    (cd "$dest" && pwd)
    ;;
  cd)
    case "$2" in
      --main) cat "$state" ;;
      .) pwd ;;
    esac
    ;;
esac
`;

export default site({
  plugin: "worktree",
  demo: {
    caption:
      "Ask pi to work in a separate checkout, then test the change there. You can ask pi to return without closing the worktree.",
    project: "shop-api",
    harness: "pi",
    setup,
    start: { hermetic: true, plugins: ["worktree"], turns, bin: { wt: WT } },
    steps: [
      { sleep: 600 },
      slow("Make the retry back off in a worktree named spike."),
      { press: "Enter" },
      { wait: /The retry change is ready/, timeout: 60_000 },
      { sleep: 3200 },
      poster,
      slow("Return to the main checkout, but leave spike open."),
      { press: "Enter" },
      { wait: /Back in the primary checkout/, timeout: 30_000 },
      { sleep: 3200 },
    ],
  },
  stills: {},
});
