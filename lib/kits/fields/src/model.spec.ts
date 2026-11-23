import { describe, expect, test } from "vitest";
import { textOf, widthOf } from "@agents/kit-core/lines.ts";
import { surfaceNames } from "@agents/kit-core/surfaces.ts";
import { fieldsStories, ISSUE } from "./stories.ts";
import { MATCHES, SELECT_MAX, cellOf, view } from "./model.ts";
import { fields } from "./terminal.ts";

const byLabel = (label: string) => ISSUE.find((f) => f.label === label)!;

describe("a field's cell", () => {
  test("one choice is a Select with its meaning icon, where the host draws one", () => {
    expect(cellOf(byLabel("Priority"), "vscode")).toMatchObject({
      kind: "select",
      value: "3",
      icon: "priority:medium",
    });
  });

  test("several are chips and a search; matches are the options not shown, up to a cap", () => {
    const labels = {
      ...byLabel("Labels"),
      editor: {
        kind: "many" as const,
        options: Array.from({ length: 20 }, (_, i) => ({ value: `${i}`, label: `Area ${i}` })),
        chosen: ["1"],
        shown: ["2"],
        query: "area",
      },
    };
    const cell = cellOf(labels, "vscode");
    expect(cell.kind).toBe("chips");
    if (cell.kind !== "chips") return;
    expect(cell.chips.map((c) => [c.value, c.on])).toEqual([
      ["1", true],
      ["2", false],
    ]);
    expect(cell.matches).toHaveLength(MATCHES);
    expect(cell.matches.some((m) => m.value === "1" || m.value === "2")).toBe(false);
  });

  test("a Select takes at most 64 options", () => {
    const options = Array.from({ length: 100 }, (_, i) => ({ value: `${i}`, label: `${i}` }));
    const cell = cellOf(
      { label: "x", value: "0", editor: { kind: "one", options, value: "0" } },
      "vscode",
    );
    expect(cell.kind === "select" && cell.options.length).toBe(SELECT_MAX);
  });

  test("the mobile app draws no Input or Select: an editable value is words", () => {
    expect(cellOf(byLabel("Priority"), "mobile").kind).toBe("text");
    expect(cellOf(byLabel("Labels"), "mobile").kind).toBe("text");
  });

  test("a terminal keeps its lettered rows", () => {
    for (const s of ["pi", "claude-terminal"] as const)
      expect(view({ fields: ISSUE }, s)).toMatchObject({ layout: "rows" });
    expect(view({ fields: ISSUE, inline: true }, "pi").layout).toBe("inline");
  });

  test("every graphical surface is one grid", () => {
    for (const s of surfaceNames.filter((s) => s !== "pi" && s !== "claude-terminal"))
      expect(view({ fields: ISSUE, inline: true }, s).layout).toBe("grid");
  });
});

describe("every fields story", () => {
  test.each(fieldsStories.map((s) => ({ id: `${s.component}/${s.state}`, story: s })))(
    "$id fits every width",
    ({ story }) => {
      for (let width = 24; width <= 130; width++)
        for (const l of fields([...story.model.fields], width, { active: story.model.active }))
          expect(widthOf(l), `${width}: ${textOf(l)}`).toBeLessThanOrEqual(width);
    },
  );
});
