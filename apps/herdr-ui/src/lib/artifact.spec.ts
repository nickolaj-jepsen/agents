// The folder Herdr loads, as `pkgs/herdr-ui.nix` publishes it: `src/mods/` and `src/layouts/` and
// nothing else. A file that is not runtime UI (a spec, a generated `gpui-kit.d.ts` or `jsconfig.json`,
// a README) must not be there, or it would ride along into the artifact and into a NixOS generation.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const src = fileURLToPath(new URL("..", import.meta.url));

/** What the artifact copies: the two folders, by name, from the app's `src/`. */
const RUNTIME = ["mods", "layouts"];

function files(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name), base) : [relative(base, join(dir, e.name))],
  );
}

/** Every file the artifact holds, relative to its root, sorted. */
const runtime = (): string[] =>
  RUNTIME.flatMap((name) => files(join(src, name)).map((f) => `${name}/${f}`)).sort();

test("the artifact is the mods and the layout, and the files Herdr needs to load them", () => {
  expect(runtime()).toEqual([
    "layouts/nested.json",
    "mods/nested-header/main.js",
    "mods/nested-header/mod.json",
    "mods/nested-spaces/agent-name.js",
    "mods/nested-spaces/main.js",
    "mods/nested-spaces/mod.json",
    "mods/nested-spaces/monitor-row.js",
    "mods/nested-spaces/open.svg",
    "mods/nested-status/main.js",
    "mods/nested-status/mod.json",
    "mods/new-space/main.js",
    "mods/new-space/mod.json",
    "mods/open-from/main.js",
    "mods/open-from/mod.json",
    "mods/open-in/main.js",
    "mods/open-in/mod.json",
    "mods/repo-agent-menu/main.js",
    "mods/repo-agent-menu/mod.json",
    "mods/workqueue/inbox.svg",
    "mods/workqueue/main.js",
    "mods/workqueue/message.svg",
    "mods/workqueue/mod.json",
    "mods/workqueue/queue.js",
  ]);
});

test("nothing an editor or a test leaves is runtime UI", () => {
  // A mod is code and its manifest; the one other file is the sidebar's open mark.
  expect(runtime().filter((file) => !/\.(js|json|svg)$/.test(file))).toEqual([]);
  // What a mod run writes for an editor's sake, and what a spec would be if it were put beside a mod.
  expect(
    runtime().filter((file) => /(^|\/)(gpui-kit\.d\.ts|jsconfig\.json)$|\.spec\./.test(file)),
  ).toEqual([]);
});

test("every mod is a manifest and an entry, and the layout is one JSON document", () => {
  for (const dir of readdirSync(join(src, "mods"), { withFileTypes: true })) {
    expect(dir.isDirectory(), `${dir.name} is a folder`).toBe(true);
    const mod = JSON.parse(readFileSync(join(src, "mods", dir.name, "mod.json"), "utf8")) as {
      place?: string;
    };
    // `place: none` is the mod drawn where the layout puts it: this UI is a whole window, not a panel.
    expect(mod.place, `${dir.name}/mod.json`).toBe("none");
    expect(readFileSync(join(src, "mods", dir.name, "main.js"), "utf8").length).toBeGreaterThan(0);
  }
  const layout = JSON.parse(readFileSync(join(src, "layouts", "nested.json"), "utf8")) as {
    id?: string;
    type?: string;
  };
  expect(layout.id).toBe("root");
  expect(layout.type).toBe("column");
});

test("a mod's own imports are files that ship beside it", () => {
  for (const file of runtime().filter((f) => f.endsWith(".js"))) {
    const code = readFileSync(join(src, file), "utf8");
    for (const [, specifier] of code.matchAll(/from\s+"(\.\.?\/[^"]+)"/g)) {
      expect(
        existsSync(join(src, dirname(file), specifier as string)),
        `${file} → ${specifier}`,
      ).toBe(true);
    }
  }
});
