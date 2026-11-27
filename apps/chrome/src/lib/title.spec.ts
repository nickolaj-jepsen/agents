import { describe, expect, it } from "vitest";
import { titleText } from "./title.ts";

const HOME = "/home/e2e";
const at = { cwd: "/home/e2e/worktrees/agents/chrome", home: HOME };

describe("the terminal title", () => {
  it("names the session, the folder, its age and the state word", () => {
    expect(titleText({ ...at, label: "Release cleanup", age: "4m", word: "waiting" })).toBe(
      "Release cleanup · ~/…/chrome · 4m · waiting",
    );
  });

  it("leads with a frozen frame of pi's spinner while a turn runs", () => {
    expect(titleText({ ...at, label: "Release cleanup", age: "now", working: true })).toBe(
      "⠿ Release cleanup · ~/…/chrome · now",
    );
  });

  it("leaves an unnamed session's label out", () => {
    expect(titleText({ ...at, age: "2h" })).toBe("~/…/chrome · 2h");
  });

  it("writes just the label and the folder as a session ends", () => {
    expect(titleText({ ...at, label: "Release cleanup" })).toBe("Release cleanup · ~/…/chrome");
  });
});
