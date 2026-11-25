import { expect, test } from "vitest";
import { monitorRow } from "../mods/nested-spaces/monitor-row.js";

const terminal = (name: string, state: string) => ({
  title: "Pi agent: old name",
  labels: {
    "fireproof.pi-agent-monitor": "true",
    "fireproof.pi-agent-name": name,
    "fireproof.pi-agent-state": state,
  },
});

test("normal agent and shell rows are unchanged", () => {
  expect(monitorRow({ title: "main", git: { ahead: 3 } }, {})).toBeUndefined();
  expect(monitorRow({ plain: true })).toBeUndefined();
});

test("monitor identities replace inherited branch names", () => {
  const row = monitorRow({ title: "main", git: { ahead: 3 } }, terminal("verifier", "working"));
  expect(row?.name).toBe("verifier");
  expect(row?.label).toBe("Working");
  expect(row?.tooltip).toContain("Read-only");
  expect(row?.tooltip).not.toContain("main");
});

test("waiting is not user-blocked; failures and completion have honest labels", () => {
  expect(monitorRow({}, terminal("a", "waiting"))?.tone).toBe("idle");
  expect(monitorRow({}, terminal("a", "failed"))?.label).toBe("Failed");
  expect(monitorRow({}, terminal("a", "idle"))?.label).toBe("Finished");
});

test("legacy monitors use their title; hostile text and prototype keys are harmless", () => {
  expect(
    monitorRow({}, { title: "Pi agent: legacy", labels: { "fireproof.pi-agent-monitor": "true" } })
      ?.name,
  ).toBe("legacy");
  const row = monitorRow({}, terminal("abc\x1b]0;spoof\x07\u202e", "constructor"));
  expect(row?.name).toBe("abc");
  expect(row?.label).toBe("Monitor");
  expect(monitorRow({}, terminal("x".repeat(1000), "working"))?.name.length).toBeLessThanOrEqual(
    160,
  );
});
