/**
 * Schema 2, proved on the throwaway fixture (`fixture/`): the checks pass on it, and each one
 * fires on a variant of it that breaks the rule. Types are read from what `tsc` prints.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";
import type { ComponentV2 } from "@agents/kit-core/manifest.ts";
import { surfaceNames } from "@agents/kit-core/surfaces.ts";
import manifest from "./fixture/manifest.ts";
import { fixtureStories } from "./fixture/stories.ts";
import { view } from "./fixture/model.ts";
import { markdown, modelOf2 } from "./model.ts";
import { kitStories2 } from "./registry.ts";
import { answers, checkComponent2, drawnOn, modelSnapshotText } from "./schema2.ts";

const here = import.meta.dirname;
const component = manifest as unknown as ComponentV2;
const check = (c: ComponentV2) => checkComponent2(c, fixtureStories);

describe("the fixture", () => {
  test("passes every check", () => {
    expect(check(component)).toEqual([]);
  });

  test("derives each feature's answer from the capability table", () => {
    const [text, focus, hover, window] = component.features.map(answers);
    expect(surfaceNames.map((s) => text?.[s].status)).toEqual(Array(5).fill("yes"));
    // The host draws the focus on vscode; nobody has checked desktop or mobile.
    expect(focus?.pi.status).toBe("yes");
    expect(focus?.["claude-terminal"].status).toBe("yes");
    expect(focus?.vscode).toMatchObject({
      status: "no",
      note: "the host draws a Button's focus itself",
    });
    expect(focus?.desktop).toMatchObject({
      status: "no",
      note: "keyFocus has not been checked on desktop",
    });
    // A limit of the component itself makes pi `partial`.
    expect(hover?.pi).toMatchObject({ status: "partial", note: "the label is bold, with no fill" });
    expect(window?.vscode.status).toBe("no");
    expect(window?.pi.status).toBe("yes");
  });

  test("the manifest, not a flag, says which surfaces draw a story", () => {
    // `text` is a yes everywhere; `window` needs a capability only the terminals have.
    expect(drawnOn(component, "fixture/rows")).toEqual([...surfaceNames]);
    expect(drawnOn(component, "fixture/window")).toEqual(["pi", "claude-terminal"]);
  });

  test("the catalogue can list it, with the derived answers", () => {
    const text = markdown({
      kits: { pi: { file: "", present: false }, claude: { file: "", present: false } },
      components: [modelOf2(component, fixtureStories, "fixture")],
      problems: [],
      notMirrored: [],
    });
    expect(text).toContain("## Fixture");
    expect(text).toContain(
      "**no** — the host draws a Button's focus itself; desktop: no, keyFocus has not been checked on desktop",
    );
  });

  test("its stories are plain data", () => {
    expect(JSON.parse(JSON.stringify(fixtureStories))).toEqual(fixtureStories);
  });

  test("the view model, on every surface", async () => {
    for (const s of fixtureStories)
      await expect(modelSnapshotText(s, view)).toMatchFileSnapshot(
        join(here, "fixture/__snapshots__/model", `${s.state}.json`),
      );
  });
});

describe("the catalogue check fires", () => {
  const without = (id: string): ComponentV2 => ({
    ...component,
    features: component.features.filter((f) => f.id !== id),
  });

  test("on a model field that belongs to no feature", () => {
    const c = {
      ...component,
      features: component.features.map((f) =>
        f.id === "text" ? { ...f, fields: ["key", "text"] } : f,
      ),
    };
    expect(check(c)).toEqual(["fixture: model field `aside` belongs to no feature"]);
  });

  test("on a capability-gated field that belongs to no feature", () => {
    expect(check(without("focus")).filter((p) => p.includes("`focused`"))).toEqual([
      "fixture: capability-gated field `focused` (needs `keyFocus:kit|ring`) belongs to no feature",
    ]);
  });

  test("on a feature that covers a gated field without its need", () => {
    const c = {
      ...component,
      features: component.features.map((f) => (f.id === "focus" ? { ...f, needs: [] } : f)),
    };
    expect(check(c).join("\n")).toContain("does not list it");
  });

  test("on a part a drawing lacks with no reason", () => {
    const c = {
      ...component,
      parts: { ...component.parts, rowsFollow: { drawings: ["terminal"] } },
    } as unknown as ComponentV2;
    expect(check(c)).toEqual([
      "fixture: part `rowsFollow` is not in gui, and says no `none` reason",
    ]);
  });

  test("on a story no feature names, and one that is not data", () => {
    const stray = { ...fixtureStories[0]!, state: "stray", model: { key: "x", text: () => "" } };
    expect(checkComponent2(component, [...fixtureStories, stray as never]).join("\n")).toMatch(
      /story `fixture\/stray` is not plain data[\s\S]*drawn on no surface/,
    );
  });
});

describe("tsc rejects, in words", () => {
  const out = (() => {
    try {
      execFileSync(
        join(here, "../node_modules/.bin/tsc"),
        ["--noEmit", "-p", "tsconfig.fixture.json"],
        {
          cwd: join(here, ".."),
          encoding: "utf8",
        },
      );
      return "";
    } catch (e) {
      return (e as { stdout: string }).stdout;
    }
  })();

  test.each([
    ["a stray export", '"undeclared export: helper"'],
    ["a missing part", '"missing part: rows"'],
    ["`focused` on vscode", "'focused' does not exist in type 'Props<Row,"],
    ["`hovered` on a union with a host that draws it", "'hovered' does not exist"],
    ["a field on a surface nobody checked", "'detailLines' does not exist"],
    ["a model field left out of the list", '"missing model field": "aside" | "detailLines"'],
  ])("%s", (_name, text) => {
    expect(out).toContain(text);
  });
});

// Every component that opted in and has a view model: its snapshot per story, in its own package
// (`e2e/__snapshots__/model/<state>.json`), the parity check across the five surfaces.
const kits = join(here, "../..");
const opted = [] as {
  folder: string;
  manifest: ComponentV2;
  view: Parameters<typeof modelSnapshotText>[1];
}[];
for (const folder of readdirSync(kits).sort()) {
  const dir = join(kits, folder, "src");
  if (!existsSync(join(dir, "manifest.ts")) || !existsSync(join(dir, "model.ts"))) continue;
  const m = (
    (await import(pathToFileURL(join(dir, "manifest.ts")).href)) as { default: ComponentV2 }
  ).default;
  if (m.schema !== 2) continue;
  const mod = (await import(pathToFileURL(join(dir, "model.ts")).href)) as { view: never };
  opted.push({ folder, manifest: m, view: mod.view });
}

describe.each(opted)("$manifest.id's view model", ({ folder, manifest: m, view: v }) => {
  test.each(kitStories2.filter((s) => s.component === m.id).map((s) => ({ state: s.state, s })))(
    "$state, on every surface",
    async ({ state, s }) => {
      await expect(modelSnapshotText(s, v)).toMatchFileSnapshot(
        join(kits, folder, "e2e/__snapshots__/model", `${state}.json`),
      );
    },
  );
});
