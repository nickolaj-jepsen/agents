import { expect, test } from "vitest";

import { textOf, type Line } from "@agents/kit-core/lines.ts";
import { tokens } from "@agents/kit-core/tokens.ts";
import {
  FINDING_LINES,
  MAX_FINDINGS,
  REVIEW_HIT,
  markHit,
  markOfHit,
  reviewBody,
  reviewButtons,
  reviewCaption,
  reviewHeight,
  reviewWindow,
  reviewWidth,
  rowHit,
  rowOfHit,
  toFindings,
  type Finding,
  type ReviewView,
} from "./review.ts";

const text = "Please fix teh handler, it should seperate the orders";

const miss = (word: string, start: number): Finding["offsets"][number] => ({
  word,
  start,
  end: start + word.length,
});

const finding = (
  word: string,
  fix: string | null,
  at: number,
  kind: Finding["kind"] = "typo",
): Finding => {
  const start = text.indexOf(word, at);
  return {
    word,
    fix,
    kind,
    offsets: [miss(word, start)],
    checked: true,
  } satisfies Finding;
};

const view = (over: Partial<ReviewView> = {}): ReviewView => ({
  text,
  findings: [],
  index: 0,
  top: 0,
  height: 3,
  isChecking: false,
  isPendingAll: false,
  added: [],
  ...over,
});

const flat = (lines: readonly Line[]) => lines.map(textOf).join("\n");

const spansOf = (lines: readonly Line[], value: string) =>
  lines.flatMap((l) => l.spans.filter((s) => s.text === value));

test("toFindings groups a word's occurrences, reads casing, unsure and extras, and sorts by draft", () => {
  const findings = toFindings(
    [miss("teh", 0), { word: "teh", start: 20, end: 23 }, miss("handler", 5)],
    [{ word: "form", fix: "from", start: 100, end: 104 }],
    new Map([
      ["teh", { kind: "fix", word: "Teh" }],
      ["handler", { kind: "unsure" }],
    ]),
  );
  expect(findings.map((f) => [f.word, f.fix, f.kind, f.offsets.length])).toEqual([
    ["teh", "Teh", "casing", 2],
    ["handler", null, "unsure", 1],
    ["form", "from", "real word", 1],
  ]);
  expect(findings.every((f) => f.checked)).toBe(true);
});

test("a missed word with no verdict is a typo with no fix yet", () => {
  const [one] = toFindings([miss("teh", 11)], [], new Map());
  expect(one).toMatchObject({ word: "teh", fix: null, kind: "typo", checked: true });
});

test("a window keeps the focused finding whole, only moving as far as it must", () => {
  expect(reviewWindow(0, 8, 3)).toEqual({ top: 0, above: 0, below: 5, rows: 3 });
  expect(reviewWindow(5, 8, 3, 0)).toEqual({ top: 3, above: 3, below: 2, rows: 3 });
  // Inside the window, the top stays where it was.
  expect(reviewWindow(5, 8, 3, 3).top).toBe(3);
  expect(reviewWindow(7, 8, 3, 3).top).toBe(5);
  // Back up: the window follows to keep it in view.
  expect(reviewWindow(0, 8, 3, 5).top).toBe(0);
  // Everything fits: no window.
  expect(reviewWindow(2, 3, 9)).toEqual({ top: 0, above: 0, below: 0, rows: 9 });
  // A previous top past the end is clamped, and a height beyond the cap is the cap.
  expect(reviewWindow(0, 2, 30, 99).rows).toBe(MAX_FINDINGS);
});

test("the height leaves room for the sheet, its footer, its notice and the window's rows", () => {
  expect(reviewHeight(24, { footer: 2, notice: false })).toBe(6);
  expect(reviewHeight(24, { footer: 2, notice: true })).toBe(5);
  expect(reviewHeight(45, { footer: 1, notice: true })).toBe(MAX_FINDINGS);
  // A short terminal still shows a whole finding rather than clipping the sheet to nothing.
  expect(reviewHeight(8, { footer: 3, notice: true })).toBe(3);
  expect(FINDING_LINES).toBe(2);
});

test("the width is a dialog's cap with a cell of margin on either side", () => {
  expect(reviewWidth(70)).toBe(68);
  expect(reviewWidth(112)).toBe(72);
  expect(reviewWidth(240)).toBe(72);
  expect(reviewWidth(4)).toBe(2);
});

test("the caption names the plugin and counts what is checked, not what has no fix", () => {
  expect(textOf({ spans: reviewCaption(view()) })).toBe("spellfix");
  const findings = [finding("teh", "the", 0), finding("seperate", null, 0)];
  expect(textOf({ spans: reviewCaption(view({ findings })) })).toBe(
    "spellfix · 1 to apply · 2 found",
  );
});

test("the buttons offer the actions that apply, toggle and keep, and close as a key hint", () => {
  const findings = [finding("teh", "the", 0), finding("seperate", "separate", 30)];
  const row = reviewButtons(view({ findings }))[0]!;
  expect(row.map((b) => [b.label, b.hotkey, b.hit, b.isLit])).toEqual([
    ["Apply", "enter", REVIEW_HIT.apply, true],
    ["Apply all", "a", REVIEW_HIT.applyAll, undefined],
    ["Toggle", "space", REVIEW_HIT.toggle, undefined],
    ["Keep word", "d", REVIEW_HIT.keep, undefined],
    ["close", "esc", undefined, undefined],
  ]);
  expect(reviewButtons(view({ findings, index: 1 }))[0]![0]!.isLit).toBe(true);
  // A real word is a typo the model found, so it is not added to the dictionary.
  const word = [finding("form", "from", 0, "real word")];
  expect(reviewButtons(view({ findings: word }))[0]!.some((b) => b.hit === REVIEW_HIT.keep)).toBe(
    false,
  );
  // Undo only once this answer added something.
  expect(
    reviewButtons(view({ findings, added: ["Jepsen"] }))[0]!.some((b) => b.hit === REVIEW_HIT.undo),
  ).toBe(true);
  // With nothing to act on, the row is the way out.
  expect(reviewButtons(view())[0]!.map((b) => b.label)).toEqual(["close"]);
  expect(reviewButtons(view({ findings }), REVIEW_HIT.apply)[0]![0]!.hovered).toBe(true);
});

test("unchecked findings do not count as ready to apply", () => {
  const findings = [finding("teh", "the", 0), finding("seperate", "separate", 30)];
  findings[0]!.checked = false;
  expect(textOf({ spans: reviewCaption(view({ findings })) })).toBe(
    "spellfix · 1 to apply · 2 found",
  );
  expect(reviewButtons(view({ findings }))[0]!.some((b) => b.hit === REVIEW_HIT.applyAll)).toBe(
    true,
  );
});

test("a finding is two lines: its kind, mark and count, then the draft with the change", () => {
  const findings = [finding("teh", "the", 0)];
  const lines = reviewBody(view({ findings }), 70);
  expect(lines).toHaveLength(FINDING_LINES + 1);
  expect(textOf(lines[0]!)).toBe("❯ ■ [typo]");
  // The keyboard's row has a neutral pointer and a bold label; the mark is the accent.
  expect(lines[0]!.spans.find((s) => s.text === tokens.glyph.pointer)).toMatchObject({
    role: "text",
    bold: true,
  });
  expect(lines[0]!.spans.find((s) => s.text === "[typo]")?.bold).toBe(true);
  expect(lines[0]!.spans.find((s) => s.text === tokens.glyph.multi.on)).toMatchObject({
    role: "accent",
  });
  expect(textOf(lines[1]!)).toContain("teh the");
  expect(spansOf(lines, "teh")[0]).toMatchObject({ role: "error" });
  expect(spansOf(lines, "the")[0]).toMatchObject({ role: "success" });
  // The mark is its own control; the row's text focuses it.
  expect(lines[0]!.spans.find((s) => s.text === "■")?.hit).toBe(markHit(0));
  expect(lines[1]!.spans.every((s) => s.hit === rowHit(0))).toBe(true);
});

test("a finding with no fix underlines the word in the warning role", () => {
  const findings = [finding("teh", null, 0)];
  const [, line] = reviewBody(view({ findings }), 70);
  expect(spansOf([line!], "teh")[0]).toMatchObject({ role: "warning", underline: true });
});

test("an occurrence count is shown beside the kind", () => {
  const start = text.indexOf("teh");
  const findings = [
    { ...finding("teh", "the", 0), offsets: [miss("teh", start), miss("teh", 35)] },
  ];
  expect(textOf(reviewBody(view({ findings }), 70)[0]!)).toBe("❯ ■ [typo] ×2");
});

test("a tall list is a window with the kit's markers and the keyboard's place", () => {
  const words = ["teh", "seperate", "orders", "handler", "Please", "fix", "should", "it"];
  const findings = words.map((word, i) => finding(word, null, i === 0 ? 0 : 0));
  const lines = reviewBody(view({ findings, index: 5, height: 3, top: 0 }), 70);
  const shown = flat(lines);
  expect(shown).toContain("↑ 3 more");
  expect(shown).toContain("↓ 2 more");
  expect(shown).toContain("6/8");
  // Three whole findings, two lines each, then the marker and the progress.
  expect(lines).toHaveLength(3 * FINDING_LINES + 2);
});

test("an empty review says what it is doing and then that nothing is left", () => {
  expect(flat(reviewBody(view({ isChecking: true }), 70))).toBe("Checking for misspellings…");
  expect(flat(reviewBody(view(), 70))).toBe("No misspellings left.");
});

test("the hits name a focused row and the mark that toggles it", () => {
  expect(rowOfHit(rowHit(4))).toBe(4);
  expect(markOfHit(markHit(2))).toBe(2);
  expect(rowOfHit(markHit(2))).toBeUndefined();
  expect(markOfHit(REVIEW_HIT.apply)).toBeUndefined();
  expect(rowOfHit(undefined)).toBeUndefined();
});
