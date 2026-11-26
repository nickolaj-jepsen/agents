import { afterEach, expect, test, vi } from "vitest";
import { agentBin } from "./harness.ts";

afterEach(() => vi.unstubAllEnvs());

test("Claude uses the supplied Nix binary", () => {
  vi.stubEnv("CLAUDE_BIN", "/nix/store/pinned-claude/bin/claude");
  expect(agentBin("claude")).toBe("/nix/store/pinned-claude/bin/claude");
  expect(agentBin("pi")).not.toBe(process.env.CLAUDE_BIN);
});

test("hermetic Claude requires an explicit binary, never PATH or stale npm", () => {
  vi.stubEnv("CLAUDE_BIN", undefined);
  expect(() => agentBin("claude")).toThrow("nix develop .#full");
});
