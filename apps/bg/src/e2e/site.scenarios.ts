import { site } from "@agents/drive/lib/site.ts";

export default site({
  plugin: "bg",
  stills: {
    result: {
      caption:
        "bg_run starts a shell task and returns at once; bg_wait collects its exit code and log without a completion starting another turn.",
      harness: "pi",
      project: "sync-worker",
      start: {
        hermetic: true,
        plugins: ["bg"],
        env: { TMPDIR: "{run}" },
        turns: [
          {
            text: "I'll run the worker checks in the background.",
            toolCall: {
              name: "bg_run",
              arguments: {
                name: "worker checks",
                command:
                  "printf 'Checking Retry-After backoff…\\nPASS retry delay\\nPASS retry cap\\n2 checks passed\\n'",
              },
            },
          },
          {
            text: "Now I'll collect the result.",
            toolCall: { name: "bg_wait", arguments: { id: 1 } },
          },
          { text: "Both worker checks passed. The background task exited successfully." },
        ],
      },
      steps: [
        { type: "Run the worker checks in the background and collect the result" },
        { press: "Enter" },
        { wait: "Both worker checks passed", timeout: 30_000 },
        { press: "Ctrl+o" },
        { wait: "2 checks passed" },
      ],
    },
  },
});
