import { describe, expect, test } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { textOf, widthOf } from "../lines.ts";
import { paintLines } from "../paint/pi.ts";
import { choiceKey, choiceReduce, type ChoiceState } from "./contract.ts";
import { choiceStories } from "./stories.ts";
import { choiceLines } from "./terminal.ts";

const plain = {
  fg: (_c: string, t: string) => t,
  bold: (t: string) => t,
  underline: (t: string) => t,
} as never;

describe("the choice list's drawing", () => {
  test.each(choiceStories)("$state fits every width, by the kit's measure and by pi's", (s) => {
    for (let width = 12; width <= 130; width++) {
      const lines = choiceLines({ ...s.props, focus: 1 }, width);
      for (const l of lines)
        expect(widthOf(l), `${width}: ${textOf(l)}`).toBeLessThanOrEqual(width);
      for (const painted of paintLines(plain, lines, width).lines)
        expect(visibleWidth(painted), `${width}: ${painted}`).toBeLessThanOrEqual(width);
    }
  });

  test("pi's measure has the last word: a line it counts wider is cut", () => {
    const [cut] = paintLines(plain, [{ spans: [{ text: "x".repeat(50) }] }], 20).lines;
    expect(visibleWidth(cut ?? "")).toBe(20);
  });
});

describe("the choice list's intents", () => {
  const props = choiceStories[0]!.props;
  const start: ChoiceState = { chosen: [1], focus: 0 };

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
