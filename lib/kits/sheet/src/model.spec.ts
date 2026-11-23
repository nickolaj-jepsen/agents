import { describe, expect, test } from "vitest";
import { surfaceNames } from "@agents/kit-core/surfaces.ts";
import { sheetStories } from "./stories.ts";
import { view } from "./model.ts";

const [title, confirm] = sheetStories;

describe("the sheet's view model", () => {
  test("stands on its own edge where the kit lays out cells, and the host's frame elsewhere", () => {
    const feet = Object.fromEntries(surfaceNames.map((s) => [s, view(title!.model, s).foot]));
    expect(feet).toEqual({
      pi: "edge",
      "claude-terminal": "edge",
      vscode: "host",
      desktop: "host",
      mobile: "host",
    });
  });

  test("while Close asks, no button is lit and every control is quiet, on every surface", () => {
    for (const s of surfaceNames) {
      const rows = view(confirm!.model, s).footer.rows;
      expect(rows.flat().length, s).toBeGreaterThan(0);
      expect(
        rows.flat().every((b) => b.tone === "quiet"),
        s,
      ).toBe(true);
    }
  });

  test("a title that repeats the host's is left out where the host draws one", () => {
    const m = { ...title!.model, hostTitle: "Linear draft" };
    expect(view(m, "vscode").head.title).toBeUndefined();
    expect(view(m, "pi").head.title).toBe("Linear draft");
  });

  test("one button of the screen is lit: the head's action, where it has one, outranks the footer's", () => {
    const m = {
      ...title!.model,
      hostTitle: "x",
      actions: [{ hotkey: "", label: "submit", hit: "submit", isLit: true }],
    };
    const v = view(m, "vscode");
    const tones = [...(v.head.actions?.rows.flat() ?? []), ...v.footer.rows.flat()].map(
      (b) => b.tone,
    );
    expect(tones.filter((t) => t === "lit")).toHaveLength(1);
    expect(v.head.actions?.rows[0]?.[0]?.tone).toBe("lit");
  });
});
