import { describe, expect, test } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { textOf, widthOf } from "../lines.ts";
import { paintLines } from "../paint/pi.ts";
import { kitStories, storyId } from "../stories.ts";
import { choiceKey, choiceReduce, type ChoiceListState } from "./contract.ts";
import { liveChoices } from "./stories.ts";
import { choice, choiceList, heading, note, steps } from "./terminal.ts";

const plain = {
  fg: (_c: string, t: string) => t,
  bold: (t: string) => t,
  italic: (t: string) => t,
  underline: (t: string) => t,
} as never;

describe("every kit story", () => {
  test.each(kitStories.map((s) => ({ id: storyId(s), story: s })))(
    "$id fits every width, by the kit's measure and by pi's",
    ({ story }) => {
      for (let width = 24; width <= 130; width++) {
        const lines = story.lines(width);
        for (const l of lines)
          expect(widthOf(l), `${width}: ${textOf(l)}`).toBeLessThanOrEqual(width);
        for (const painted of paintLines(plain, lines, width).lines)
          expect(visibleWidth(painted), `${width}: ${painted}`).toBeLessThanOrEqual(width);
      }
    },
  );

  test("pi's measure has the last word: a line it counts wider is cut", () => {
    const [cut] = paintLines(plain, [{ spans: [{ text: "x".repeat(50) }] }], 20).lines;
    expect(visibleWidth(cut ?? "")).toBe(20);
  });
});

describe("a choice", () => {
  const item = { key: "A", text: "Write your own answer" };

  test("in a form keeps a gutter for the pointer, which only the keyboard's row fills", () => {
    const [rest] = choice({ ...item, presentation: "form" }, 60);
    const [focused] = choice({ ...item, presentation: "form", focused: true }, 60);
    expect(textOf(rest!)).toBe("  A ○ Write your own answer");
    expect(textOf(focused!)).toBe("❯ A ○ Write your own answer");
    expect(focused!.spans.at(-1)).toMatchObject({ role: "text", bold: true });
  });

  test("is accented only when chosen, and underlined when it is the keyboard's row too", () => {
    const [chosen] = choice({ ...item, presentation: "form", chosen: true, focused: true }, 60);
    expect(textOf(chosen!)).toBe("❯ A ● Write your own answer");
    expect(chosen!.spans.at(-1)).toMatchObject({ role: "accent", bold: true, underline: true });
  });

  test("a write-in in a form has its own mark while it is empty", () => {
    const [row] = choice({ ...item, presentation: "form", literal: true }, 60);
    expect(textOf(row!)).toBe("  A + Write your own answer");
    expect(row!.spans.at(-1)).toMatchObject({ role: "dim" });
  });

  test("in a transcript card has no gutter, and its detail hangs under the words", () => {
    const rows = choice({ ...item, detail: "One file, no service to run." }, 60);
    expect(rows.map(textOf)).toEqual([
      "A ○ Write your own answer",
      "    One file, no service to run.",
    ]);
  });

  test("the pointer's row is bold like the keyboard's, without its pointer", () => {
    const rows = choiceList({ ...liveChoices, focus: 0, hover: 2 }, 60);
    const last = rows.at(-1)!;
    expect(textOf(last).startsWith("  C ")).toBe(true);
    expect(last.spans.at(-1)).toMatchObject({ bold: true });
  });
});

describe("the card's other parts", () => {
  test("a heading hangs its title from the label, and an answered one ends in a tick", () => {
    const rows = heading(
      { presentation: "form", label: "Q1", title: "One two three four", answered: true },
      16,
    );
    expect(rows.map(textOf)).toEqual(["Q1  One two", "    three four ✓"]);
  });

  test("an empty note invites one, dim", () => {
    const [row] = note({ value: "" }, 40);
    expect(textOf(row!)).toBe("Note: Add a note");
  });

  test("steps shorten the longest name first and drop to short labels with no room", () => {
    const all = [
      { short: "1", name: "Storage", done: true },
      { short: "2", name: "Retention", current: true },
      { short: "Review" },
    ];
    expect(textOf(steps(all, 60)!)).toBe("✓ 1 Storage ── ❯ 2 Retention ── Review");
    expect(textOf(steps(all, 20)!)).toBe("✓1 ─ ❯2 ─ Review");
    expect(steps(all, 6)).toBeUndefined();
  });
});

describe("the choice list's intents", () => {
  const props = { ...liveChoices, items: [...liveChoices.items, { key: "D", text: "Other" }] };
  const start: ChoiceListState = { chosen: [1], focus: 0 };

  test("moving wraps at both ends", () => {
    expect(choiceReduce(start, { do: "move", by: -1 }, props).focus).toBe(props.items.length - 1);
    expect(choiceReduce({ ...start, focus: 3 }, { do: "move", by: 1 }, props).focus).toBe(0);
  });

  test("one of many replaces the answer; several of many toggles it", () => {
    expect(choiceReduce(start, { do: "pick" }, props).chosen).toEqual([0]);
    const many = { ...props, multiple: true };
    expect(choiceReduce(start, { do: "pick", index: 2 }, many).chosen).toEqual([1, 2]);
    expect(choiceReduce(start, { do: "pick", index: 1 }, many).chosen).toEqual([]);
  });

  test("a letter picks its item, in either case, and a client without its own focus keeps none", () => {
    expect(choiceKey(props.items, "c")).toEqual({ do: "pick", index: 2 });
    expect(choiceKey(props.items, "z")).toBeUndefined();
    expect(choiceReduce({ chosen: [] }, { do: "pick", index: 2 }, props)).toEqual({
      chosen: [2],
      focus: undefined,
    });
  });
});
