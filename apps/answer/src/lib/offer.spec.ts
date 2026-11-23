import { describe, expect, it } from "vitest";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { AnswerOffer } from "../pi/offer.ts";
import { offerNote } from "./offer.ts";

// The kit's painter reads only these two; a plain theme keeps the assertion on the words.
const plain = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

const draw = (title: string, answered: number, width = 80) =>
  new AnswerOffer(plain, title, offerNote(answered, "alt+a"), () => {}).render(width);

describe("the answer offer", () => {
  it("sets the answered count and the key after a separator", () => {
    expect(draw("Q1  Use SQLite?", 2)).toEqual([
      " Q1  Use SQLite? · 2 answered · alt+a or /answer",
    ]);
  });

  it("keeps the separator with no answers yet", () => {
    expect(draw("Review", 0)).toEqual([" Review · alt+a or /answer"]);
  });

  it("cuts the row to the width it is given", () => {
    const [row] = draw("A question whose title is much too long to fit", 0, 24);
    expect(row).toHaveLength(24);
    expect(row?.endsWith("…")).toBe(true);
    expect(row).not.toContain("alt+a");
  });
});
