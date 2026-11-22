/** The assistant messages the answer scenarios replay, one file each under `fixtures/`. */
import { readdirSync, readFileSync } from "node:fs";
import type { Turn } from "@agents/drive/lib/harness.ts";
import type { Scenario } from "@agents/drive/lib/scenario.ts";
import { offer, title } from "../lib/forms.ts";

/** The text of `fixtures/<name>.md`. */
export const message = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.md`, import.meta.url), "utf8").trimEnd();

/** One replayed turn that says the fixture. */
export const says = (name: string): Turn[] => [{ text: message(name) }];

/** Every fixture's name. */
export const fixtureNames = (): string[] =>
  readdirSync(new URL("./fixtures/", import.meta.url))
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(0, -3))
    .sort();

/**
 * The fixtures as scenarios to look at (`drive live answer <fixture>`, `goto`): the message said
 * once, then the form, if it has one. They have no snapshots, so the e2e run leaves them out. A
 * fixture that has a scenario of its own (`taken`) is not repeated.
 */
export function fixtureScenarios(
  harness: "claude" | "pi",
  taken: string[],
  start: (fixture: string) => Scenario["start"],
): Record<string, Scenario> {
  const out: Record<string, Scenario> = {};
  for (const name of fixtureNames().filter((n) => !taken.includes(n))) {
    const text = message(name);
    const form = offer(null, text)?.form;
    // What the screen shows once the message is in: the round's first card, or the message's end.
    const ready =
      form?.kind === "round"
        ? `${form.items[0]?.label}/${form.items.length}`
        : form
          ? title(form)
          : (text.split("\n").at(-1) ?? text);
    out[name] = {
      about: `the ${name} fixture's message${form ? " and its form" : ""}, to look at`,
      snapshots: false,
      size: [96, 30],
      start: start(name),
      steps:
        harness === "claude"
          ? [
              { type: "ask" },
              { press: "Enter" },
              { wait: ready },
              ...(form ? [{ type: "/answer" }, { press: "Enter" }] : []),
            ]
          : [{ type: "ask" }, { press: "Enter" }, { wait: form ? "Answer [alt+a]" : ready }],
    };
  }
  return out;
}
