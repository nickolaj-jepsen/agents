import { describe, expect, it } from "vitest";
import { invokeAction, type ActionHost } from "./invoke.ts";

/**
 * A pi that knows these commands and remembers what it was asked to send. A command of pi's list
 * is a name and where it came from: `extension` for one a plugin registered, `prompt` or `skill`
 * for one pi expands into a prompt.
 */
function fakePi(commands: { name: string; source: string }[]) {
  const sent: { text: string; expandPromptTemplates: boolean }[] = [];
  const host: ActionHost = {
    getCommands: () => commands,
    sendUserMessage: (text, options) =>
      sent.push({ text, expandPromptTemplates: options.expandPromptTemplates }),
  };
  return { host, sent };
}

describe("invoking a checkout action", () => {
  it("runs the command its owner registered", () => {
    const { host, sent } = fakePi([{ name: "open", source: "extension" }]);
    expect(invokeAction(host, "open")).toBe(true);
    expect(sent).toEqual([{ text: "/open", expandPromptTemplates: true }]);
  });

  it("runs nothing when no plugin owns the command", () => {
    const { host, sent } = fakePi([{ name: "git", source: "extension" }]);
    expect(invokeAction(host, "open")).toBe(false);
    expect(sent).toEqual([]);
  });

  it("runs nothing when the name is a prompt template or a skill, which would go to the model", () => {
    const { host, sent } = fakePi([
      { name: "open", source: "prompt" },
      { name: "notes", source: "skill" },
    ]);
    expect(invokeAction(host, "open")).toBe(false);
    expect(invokeAction(host, "notes")).toBe(false);
    expect(sent).toEqual([]);
  });
});
