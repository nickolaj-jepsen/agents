import type { Turn } from "../lib/harness.ts";
import { poster, site, slow } from "../lib/site.ts";

/** A repository with one commit, so `wt` has a default branch to branch from. */
const setup = (ctx: { write(rel: string, content: string): void; initRepo(): void }) => {
  ctx.initRepo();
  ctx.write("src/sync.ts", "export const retry = (n: number) => n * 2;\n");
};

const turns: Turn[] = [
  {
    text: "The retry loop is in `src/sync.ts`; in the worktree I can change it without touching your checkout.",
  },
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
  list)
    for dir in "$bin"/../worktrees/*/*; do [ -d "$dir" ] && basename "$dir"; done
    ;;
  cd)
    cat "$state" 2>/dev/null || pwd
    ;;
  close)
    rm -rf "$2"
    ;;
esac
`;

export default site({
  plugin: "worktree",
  demo: {
    caption:
      "The session moves itself into a git worktree, with its conversation, and the next turn starts there; /back brings it home and closes the worktree it leaves.",
    project: "shop-api",
    harness: "pi",
    setup,
    start: { hermetic: true, plugins: ["worktree"], turns, bin: { wt: WT } },
    steps: [
      { sleep: 600 },
      slow("/wt spike"),
      { press: "Enter" },
      // The footer names the checkout the session now runs in.
      { wait: /worktrees\/\S*\/spike/, timeout: 60_000 },
      { sleep: 2400 },
      slow("Make the retry back off instead of doubling."),
      { press: "Enter" },
      { wait: /The retry loop is in/, timeout: 30_000 },
      { sleep: 3200 },
      poster,
      slow("/back"),
      { press: "Enter" },
      { wait: /This session moved from/, timeout: 30_000 },
      { sleep: 3200 },
    ],
  },
  stills: {},
});
