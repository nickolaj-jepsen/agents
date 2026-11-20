import { readdirSync } from "node:fs";
import { offer, title } from "../../plugins/answer/core/forms.ts";
import { live } from "../lib/live.ts";
import { resolveScenario, type ScenarioSet } from "../lib/scenario.ts";
import { message } from "./fixture.ts";

async function main() {
  const fixture = process.argv[2] ?? "details";
  const fixtures = readdirSync(new URL("./fixtures/", import.meta.url))
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(0, -3));
  if (process.argv.length > 3 || !fixtures.includes(fixture))
    throw new Error(`Usage: just answer-demo [fixture]\nFixtures: ${fixtures.join(", ")}`);

  const answer = message(fixture);
  const form = offer(null, answer)?.form;
  const ready =
    form?.kind === "round"
      ? `${form.items[0]?.label}/${form.items.length}`
      : form
        ? title(form)
        : (answer.split("\n").at(-1) ?? answer);
  const set: ScenarioSet = {
    plugin: "answer",
    harness: "claude",
    scenarios: {
      [fixture]: {
        size: [96, 30],
        start: {
          hermetic: true,
          plugins: ["answer"],
          args: ["--model", "haiku"],
          turns: [{ text: answer }, { text: "The replay received your reply." }],
        },
        steps: [
          { type: "Show me the answer fixture." },
          { press: "Enter" },
          { wait: ready },
          ...(form ? [{ type: "/answer" }, { press: "Enter" }] : []),
        ],
      },
    },
  };
  await live(resolveScenario(set, fixture));
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
