import { describe, expect, test } from "vitest";
import { surfaceNames } from "@agents/kit-core/surfaces.ts";
import { view } from "./model.ts";

describe("the notice's view model", () => {
  test("a state is an icon on a graphical surface and none in a terminal", () => {
    const marks = Object.fromEntries(
      surfaceNames.map((s) => [s, view({ text: "Filed", status: "success" }, s).mark]),
    );
    expect(marks).toEqual({
      pi: undefined,
      "claude-terminal": undefined,
      vscode: "state:success",
      desktop: "state:success",
      mobile: "state:success",
    });
  });

  test("dim words and an empty list are captions, a state is read as body", () => {
    expect(view({ text: "x", status: "dim" }, "vscode").type).toBe("caption");
    expect(view({ text: "x", isEmpty: true }, "vscode")).toMatchObject({
      type: "caption",
      mark: undefined,
    });
    expect(view({ text: "x", status: "error" }, "vscode").type).toBe("body");
  });

  test("a graphical surface says the fuller sentence, a terminal the shorthand", () => {
    const m = { text: "No rows", words: "Nothing here yet", isEmpty: true };
    expect(view(m, "pi").text[0]?.text).toBe("No rows");
    expect(view(m, "vscode").text[0]?.text).toBe("Nothing here yet");
  });

  test("a span with no role takes the status's", () => {
    const [a] = view({ text: [{ text: "word" }], status: "error" }, "pi").text;
    expect(a?.role).toBe("error");
  });
});
