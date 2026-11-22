import type { Turn } from "@agents/drive/lib/harness.ts";
import { gridLines, type Region } from "@agents/drive/lib/screen.ts";
import { scenarios } from "@agents/drive/lib/scenario.ts";

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

const turns: Turn[] = [
  { toolCall: { name: "enter_worktree", arguments: { name: "spike" } } },
  { text: "Ready in the worktree." },
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
      about: "The session stays in the worktree after reporting the task ready",
      setup: repo,
      start: { turns },
      // The paths in the notice wrap at 70 columns, where a placeholder would leave fragments.
      sizes: [[160, 45]],
      steps: [
        { type: "Work in a worktree named spike." },
        { press: "Enter" },
        { wait: /Ready in the worktree\./, timeout: 60_000 },
        { wait: /\/spike \(spike\)/ },
      ],
    },
    returned: {
      about: "Leaving moves to the primary checkout and keeps the worktree open",
      from: "moved",
      start: {
        turns: [
          ...turns,
          { toolCall: { name: "exit_worktree", arguments: {} } },
          {
            toolCall: {
              name: "bash",
              arguments: { command: "wt cd spike >/dev/null && echo 'checkout still open'" },
            },
          },
          { text: "Back in the primary checkout." },
        ],
      },
      sizes: [[160, 45]],
      steps: [
        { type: "Go back, but leave the worktree open." },
        { press: "Enter" },
        { wait: /^\s*checkout still open\s*$/m, timeout: 30_000 },
        { wait: /Back in the primary checkout\./ },
        { wait: /\/spike \(spike\)/, gone: true },
      ],
    },
    closed: {
      about: "Only confirmed removal closes the worktree after returning to the primary checkout",
      from: "moved",
      start: {
        turns: [
          ...turns,
          { toolCall: { name: "exit_worktree", arguments: { action: "remove" } } },
          { text: "Removal needs confirmation." },
          {
            toolCall: {
              name: "exit_worktree",
              arguments: { action: "remove", discard_changes: true },
            },
          },
          {
            toolCall: {
              name: "bash",
              arguments: {
                command: "test ! -d \"$WT_WORKTREE_ROOT/cwd/spike\" && echo 'checkout removed'",
              },
            },
          },
          { text: "Back in the primary checkout." },
        ],
      },
      sizes: [[160, 45]],
      steps: [
        { type: "Check whether the worktree can be removed." },
        { press: "Enter" },
        { wait: /confirm an explicit request to close/ },
        { wait: /Removal needs confirmation\./ },
        { wait: /\/spike \(spike\)/ },
        { type: "Yes, close the worktree." },
        { press: "Enter" },
        { wait: /^\s*checkout removed\s*$/m, timeout: 30_000 },
        { wait: /Back in the primary checkout\./ },
        { wait: /\/spike \(spike\)/, gone: true },
      ],
    },
  },
});
