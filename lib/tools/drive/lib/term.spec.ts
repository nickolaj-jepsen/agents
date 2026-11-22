import { expect, it, vi } from "vitest";
import { LibTerm, snapshotWorkerEnv } from "./term.ts";

const seen = vi.hoisted(() => ({ homes: [] as (string | undefined)[] }));
vi.mock("@microsoft/tui-test", () => ({
  TuiTest: class {
    async run() {}
    async screenshot() {
      seen.homes.push(process.env.HOME);
    }
    async close() {}
  },
}));
vi.mock("./fonts.ts", () => ({
  FONT_FAMILIES: "fixture fonts",
  realHome: "/real-home",
  fakeFontHome: () => "/font-home",
}));

it("passes font settings to the test worker without changing the caller during capture", async () => {
  const terminalEnvironment = () => ({
    home: process.env.HOME,
    fonts: process.env.TUI_TEST_RECORDING_FONT_FAMILIES,
    config: process.env.TUI_TEST_CONFIG,
  });
  const before = terminalEnvironment();
  expect(snapshotWorkerEnv()).toMatchObject({
    HOME: "/font-home",
    DRIVE_TEST_REAL_HOME: "/real-home",
    TUI_TEST_RECORDING_FONT_FAMILIES: "fixture fonts",
  });
  const spec = { program: "fixture", args: [], cwd: "/", env: {}, unset: [], cols: 70, rows: 24 };
  const terminals = await Promise.all([LibTerm.launch(spec, "a"), LibTerm.launch(spec, "b")]);
  try {
    await Promise.all(terminals.map((term, i) => term.screenshot(`${i}.png`)));
    expect(seen.homes).toEqual([before.home, before.home]);
    expect(terminalEnvironment()).toEqual(before);
  } finally {
    await Promise.all(terminals.map((term) => term.close()));
  }
});
