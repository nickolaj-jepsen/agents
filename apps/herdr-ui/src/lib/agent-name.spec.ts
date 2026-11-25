import { expect, test } from "vitest";
import { agentName } from "../mods/nested-spaces/agent-name.js";

const claude = (title: string) => ({ title, app: "claude-code", program: { name: "Claude Code" } });
const pi = (title: string) => ({ title, app: "pi", program: { name: "Pi" } });

test("Claude's session name, without its working spinner", () => {
  expect(agentName(claude("build-fix"))).toBe("build-fix");
  expect(agentName(claude("✳ Fix login bug"))).toBe("Fix login bug");
  expect(agentName(claude("⠂ Fix login bug"))).toBe("Fix login bug");
});

test("program names and folders are not names", () => {
  expect(agentName(claude("Claude Code"))).toBe("");
  expect(agentName(claude("✳ Claude Code"))).toBe("");
  expect(agentName(pi("~/dev/agents · 2m"))).toBe("");
  expect(agentName(pi("π - nixos"))).toBe("");
  expect(agentName(pi(""))).toBe("");
  expect(agentName({})).toBe("");
});

test("Pi's named session title gives its name", () => {
  expect(agentName(pi("π - herdr sidebar - nixos"))).toBe("herdr sidebar");
});
