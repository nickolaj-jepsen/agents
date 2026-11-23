import { describe, expect, test } from "vitest";
import { statusBandStories } from "./stories.ts";
import { view } from "./model.ts";

const [, success, draft] = statusBandStories;

describe("the status band's view model", () => {
  test("a terminal's band is one line that is one control: no mark, no buttons", () => {
    for (const s of ["pi", "claude-terminal"] as const) {
      const v = view(success!.model, s);
      expect(v.mark, s).toBeUndefined();
      expect(v.buttons, s).toEqual([]);
    }
  });

  test("a graphical surface marks the status and has the way in and each action, all quiet buttons", () => {
    for (const s of ["vscode", "desktop", "mobile"] as const) {
      const v = view(success!.model, s);
      expect(v.mark, s).toBe("state:success");
      expect(
        v.buttons.map((b) => b.label),
        s,
      ).toEqual(["Open", "Copy link", "Dismiss"]);
      expect(v.layout, s).toBe("stacked");
    }
  });

  test("one line keeps the buttons after the words, and a mark of its own replaces the status's", () => {
    const v = view(draft!.model, "vscode");
    expect(v.layout).toBe("line");
    expect(v.mark).toBe("field:draft");
  });
});
