import { describe, expect, it } from "vitest";
import { isReplyOf, ownDraft, placeReply } from "./draft.ts";

const reply = "Q1: B\nQ2: A";

describe("the reply filled into the prompt", () => {
  it("stands above the person's draft, which comes back whole", () => {
    for (const draft of ["a draft", "  spaced  ", "one\ntwo", "東京", "\n", "  \n  ", "\ttab"]) {
      const text = placeReply(draft, reply);
      expect(text.startsWith(`${reply}\n\n`)).toBe(true);
      expect(ownDraft(text, reply)).toBe(draft);
    }
  });

  it("replaces its own reply instead of stacking a second one", () => {
    for (const draft of ["", "keep me", "  keep  ", "\nkeep", "trailing\n", "  \n"]) {
      const once = placeReply(draft, reply);
      const twice = placeReply(ownDraft(once, reply), reply);
      // A draft of whitespace alone still keeps its place under the reply.
      expect(twice).toBe(once);
    }
  });

  it("keeps a draft that is nothing but whitespace", () => {
    expect(placeReply("  ", reply)).toBe(`${reply}\n\n  `);
    expect(placeReply("\n", reply)).toBe(`${reply}\n\n\n`);
    expect(ownDraft(`${reply}\n\n\n`, reply)).toBe("\n");
  });

  it("leaves a prompt that is not its reply alone, under it", () => {
    expect(placeReply("my own message", reply)).toBe(`${reply}\n\nmy own message`);
    expect(ownDraft("my own message", reply)).toBe("my own message");
  });

  it("knows its reply from a message that only starts with the same words", () => {
    expect(isReplyOf(reply, reply)).toBe(true);
    expect(isReplyOf(`${reply}\n\nkeep`, reply)).toBe(true);
    expect(isReplyOf(`${reply} and more`, reply)).toBe(false);
    expect(isReplyOf("Q1: B", reply)).toBe(false);
    expect(isReplyOf("anything", "")).toBe(false);
  });

  it("fills nothing over an untouched prompt", () => {
    expect(placeReply("", reply)).toBe(reply);
    expect(ownDraft(reply, reply)).toBe("");
  });
});
