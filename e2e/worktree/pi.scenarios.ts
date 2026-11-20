import type { Turn } from "../lib/harness.ts";
import { gridLines, type Region } from "../lib/screen.ts";
import { scenarios } from "../lib/scenario.ts";

/** The editor between its two rules, and the footer under it. */
const footer: Region = (grid) => {
  const rules = gridLines(grid).flatMap((line, i) => (/^─{20,}$/.test(line) ? [i] : []));
  const top = rules.at(-2);
  return top === undefined
    ? undefined
    : { x: 0, y: top, w: grid[0]?.length ?? 0, h: grid.length - top };
};

/** A repository with one commit, so `wt` has a default branch to branch from. */
const repo = (ctx: { write(rel: string, content: string): void; initRepo(): void }) => {
  ctx.initRepo();
  ctx.write("src/sync.ts", "export const retry = (n: number) => n * 2;\n");
};

/** The move is announced in the conversation when the next turn starts. */
const turns: Turn[] = [{ text: "Continuing in the worktree, from `src/sync.ts`." }];

/** `/wt spike`, then a prompt the moved session answers: where the moved notice lands. */
const moveAndSpeak = [
  { type: "/wt spike" },
  { press: "Enter" },
  // The footer names the checkout the session now runs in.
  { wait: /worktrees\/\S*\/spike/, timeout: 60_000 },
  { type: "Carry on with the retry logic." },
  { press: "Enter" },
  { wait: /This session moved from/, timeout: 30_000 },
];

export default scenarios({
  plugin: "worktree",
  harness: "pi",
  // Hermetic: its own config with this plugin alone, so nothing of the person's setup shows.
  start: { hermetic: true, plugins: ["worktree"], turns: [] },
  // The notice wraps where the worktree's own path puts it, so the shot is the editor and the
  // footer, whose branch names the checkout the session runs in; a `wait` proves the notice.
  region: footer,
  scenarios: {
    moved: {
      about: "/wt moves the session into a new worktree, and the next turn says where from",
      setup: repo,
      start: { turns },
      // The paths in the notice wrap at 70 columns, where a placeholder would leave fragments.
      sizes: [[160, 45]],
      steps: moveAndSpeak,
    },
    returned: {
      about: "/back moves it to the primary checkout and closes the worktree it leaves",
      from: "moved",
      sizes: [[160, 45]],
      steps: [
        { type: "/back" },
        { press: "Enter" },
        // The notice is on screen from `moved` already: the footer leaving the worktree is the move.
        { wait: /\/spike \(spike\)/, gone: true, timeout: 30_000 },
      ],
    },
  },
});
