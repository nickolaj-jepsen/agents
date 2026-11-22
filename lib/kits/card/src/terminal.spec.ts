import { describe, expect, test } from "vitest";
import { textOf } from "@agents/kit-core/lines.ts";
import { choiceKey, choiceReduce, type ChoiceListState } from "./contract.ts";
import { liveChoices } from "./stories.ts";
import { choice, choiceList, closing, heading, note, railRole, steps } from "./terminal.ts";

describe("a choice", () => {
  const item = { key: "A", text: "Write your own answer" };

  test("keeps a column for the pointer, which only the keyboard's row fills", () => {
    const [rest] = choice(item, 60);
    const [focused] = choice({ ...item, focused: true }, 60);
    expect(textOf(rest!)).toBe("  A ○ Write your own answer");
    expect(textOf(focused!)).toBe("❯ A ○ Write your own answer");
    expect(focused!.spans.at(-1)).toMatchObject({ role: "text", bold: true });
  });

  test("is accented only when chosen, and underlined when it is the keyboard's row too", () => {
    const [chosen] = choice({ ...item, chosen: true, focused: true }, 60);
    expect(textOf(chosen!)).toBe("❯ A ● Write your own answer");
    expect(chosen!.spans.at(-1)).toMatchObject({ role: "accent", bold: true, underline: true });
  });

  test("a write-in is dim while it is empty, with the mark of any answer", () => {
    const [row] = choice({ ...item, literal: true }, 60);
    expect(textOf(row!)).toBe("  A ○ Write your own answer");
    expect(row!.spans.at(-1)).toMatchObject({ role: "dim" });
  });

  test("its detail hangs under the words", () => {
    const rows = choice({ ...item, detail: "One file, no service to run." }, 60);
    expect(rows.map(textOf)).toEqual([
      "  A ○ Write your own answer",
      "      One file, no service to run.",
    ]);
  });

  test("has its letter in the accent on the keyboard's card, and nothing else changes", () => {
    const [rest] = choice(item, 60);
    const [live] = choice({ ...item, active: true }, 60);
    expect(rest!.spans.find((s) => s.text === "A")).toMatchObject({ role: "dim" });
    expect(live!.spans.find((s) => s.text === "A")).toMatchObject({ role: "accent" });
    expect(live!.spans.filter((s) => s.text !== "A")).toEqual(
      rest!.spans.filter((s) => s.text !== "A"),
    );
    expect(choice({ ...item, answered: true }, 60)).toEqual(choice(item, 60));
  });

  test("a chosen one is in the accent, whatever its card's state", () => {
    const [chosen] = choice({ ...item, chosen: true }, 60);
    const [answered] = choice({ ...item, chosen: true, answered: true }, 60);
    expect(chosen!.spans.at(-1)).toMatchObject({ role: "accent", bold: true });
    expect(answered!.spans).toEqual(chosen!.spans);
  });

  test("the pointer's row is bold like the keyboard's, without its pointer", () => {
    const rows = choiceList({ ...liveChoices, focus: 0, hover: 2 }, 60);
    const last = rows.at(-1)!;
    expect(textOf(last).startsWith("  C ")).toBe(true);
    expect(last.spans.at(-1)).toMatchObject({ bold: true });
  });
});

describe("the card's other parts", () => {
  test("a heading hangs its title from the label, and an answer does not change it", () => {
    const rows = heading({ label: "Q1", title: "One two three four", answered: true }, 18);
    expect(rows.map(textOf)).toEqual(["  Q1  One two", "      three four"]);
  });

  test("the rail is green by an answered card, bright by the keyboard's, quiet by the rest", () => {
    expect(railRole({ answered: true, active: true })).toBe("success");
    expect(railRole({ active: true })).toBe("text");
    expect(railRole({})).toBe("dim");
  });

  test("a heading takes the pointer when the keyboard is on its card and on no row", () => {
    const [row] = heading({ label: "Q1", title: "One", active: true, focused: true }, 30);
    expect(textOf(row!)).toBe("❯ Q1  One");
    expect(row!.spans.at(-1)).toMatchObject({ role: "text", bold: true });
  });

  test("an empty note invites one, dim, under the answers' letters", () => {
    const [row] = note({ value: "" }, 40);
    expect(textOf(row!)).toBe("  Note: Add a note");
    expect(textOf(note({ value: "", focused: true }, 40)[0]!)).toBe("❯ Note: Add a note");
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

describe("a round's closing row", () => {
  const hits = { count: "count", fill: "fill" };

  test("lines its count up with the answers' letters, and takes the pointer on its step", () => {
    const [rest] = closing({ answered: 2, total: 3, hits }, 60);
    const [focused] = closing({ answered: 2, total: 3, hits, focused: true }, 60);
    expect(textOf(rest!)).toBe("  2 of 3 answered  Fill prompt");
    expect(textOf(focused!)).toBe("❯ 2 of 3 answered  Fill prompt");
    expect(textOf(choice({ key: "A", text: "x" }, 60)[0]!).indexOf("A")).toBe(2);
  });

  test("the count is a control, bold under the keyboard or the mouse and never accented", () => {
    const countOf = (state: object) =>
      closing({ answered: 1, total: 3, hits, ...state }, 60)[0]!.spans.find(
        (s) => s.hit === "count",
      );
    expect(countOf({})).toMatchObject({ role: "text", text: "1 of 3 answered" });
    expect(countOf({})?.bold).toBeUndefined();
    expect(countOf({ focused: true })).toMatchObject({ role: "text", bold: true });
    expect(countOf({ hovered: "count", canFill: true })).toMatchObject({
      role: "text",
      bold: true,
    });
  });

  test("Fill prompt takes the accent only when there is a reply, and prints no key", () => {
    const fillOf = (state: object) =>
      closing({ answered: 1, total: 3, hits, ...state }, 60)[0]!.spans.filter(
        (s) => s.hit === "fill",
      );
    expect(fillOf({})).toEqual([{ text: "Fill prompt", role: "text", hit: "fill" }]);
    expect(fillOf({ canFill: true })).toEqual([
      { text: "Fill prompt", role: "accent", bold: true, hit: "fill" },
    ]);
    expect(fillOf({ hovered: "fill" })[0]).toMatchObject({ role: "text", bold: true });
  });

  test("a sent round says so in the success colour and offers nothing", () => {
    const rows = closing({ answered: 3, total: 3, sent: true, hits, canFill: true }, 60);
    expect(rows.map(textOf)).toEqual(["  3 of 3 answered ✓ Sent"]);
    expect(rows[0]!.spans.at(-1)).toMatchObject({ role: "success" });
    expect(rows[0]!.spans.some((s) => s.hit === "fill")).toBe(false);
  });

  test("with no room beside the count, Fill goes under it", () => {
    const rows = closing({ answered: 12, total: 12, hits }, 24);
    expect(rows.map(textOf)).toEqual(["  12 of 12 answered", "  Fill prompt"]);
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
