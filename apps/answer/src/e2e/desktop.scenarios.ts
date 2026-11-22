import { desktopScenarios, type DesktopScenario } from "@agents/drive/lib/desktop-scenario.ts";
import { fixtureNames, message, says } from "./fixture.ts";

/** Every fixture, opened in Claude Desktop as a session that has already said it. */
export default desktopScenarios({
  plugin: "answer",
  harness: "desktop",
  scenarios: Object.fromEntries(
    fixtureNames().map((name): [string, DesktopScenario] => [
      name,
      {
        about: `the ${name} fixture's message, as a session in Claude Desktop (--draft: a draft for a real model)`,
        setup: (ctx) => ctx.write("answer-fixture.md", `${message(name)}\n`),
        start: { plugins: ["answer"], turns: says(name) },
        prompt: `Show me the ${name} answer fixture.`,
        draft:
          "Read answer-fixture.md and reply with its exact Markdown as your entire response. Preserve the headings, choices, and line breaks. Do not use a code fence or call AskUserQuestion.",
      },
    ]),
  ),
});
