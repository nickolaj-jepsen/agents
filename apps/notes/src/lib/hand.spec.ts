import { builtinApps, type Installed } from "@agents/launch/apps.ts";
import { describe, expect, it } from "vitest";
import { fileUrl, handOff, MAX_READ_BYTES, sizeText, tooLarge } from "./hand.ts";

const installed = (...names: string[]): Installed => ({
  commands: new Map(names.map((name) => [name, `/usr/bin/${name}`])),
  paths: new Set(),
});

const LINUX = builtinApps("linux");
const FILE = "/data/store/shop-api/plans/retry after.md";

describe("tooLarge", () => {
  it("reads a note up to 256 KiB, and says why it reads no larger one", () => {
    expect(tooLarge(MAX_READ_BYTES)).toBeUndefined();
    expect(tooLarge(MAX_READ_BYTES + 1)).toBe(
      "This note is 256 KiB, too large to read here. Open hands it to an app.",
    );
    expect(tooLarge(3 * 1024 * 1024)).toMatch(/^This note is 3\.0 MiB,/);
  });

  it("says a size in the fewest letters", () => {
    expect([0, 300, 300 * 1024, 1536 * 1024].map(sizeText)).toEqual([
      "1 KiB",
      "1 KiB",
      "300 KiB",
      "1.5 MiB",
    ]);
  });
});

describe("fileUrl", () => {
  it("is the path as a file link, each part encoded", () => {
    expect(fileUrl("/data/a b/Évaluer #1.html")).toBe(
      "file:///data/a%20b/%C3%89valuer%20%231.html",
    );
  });
});

describe("handOff", () => {
  it("gives a note to the first installed app that takes a file, in its folder", () => {
    expect(handOff(LINUX, installed("zeditor", "xdg-open"), FILE, "app")).toEqual({
      argv: ["/usr/bin/zeditor", FILE],
      cwd: "/data/store/shop-api/plans",
      label: "Zed",
    });
    expect(handOff(LINUX, installed("code", "zed"), FILE, "app")).toMatchObject({
      argv: ["/usr/bin/code", "--reuse-window", "--goto", FILE],
      label: "VS Code",
    });
  });

  it("gives an HTML note to the first installed app that takes a link", () => {
    expect(handOff(LINUX, installed("code", "xdg-open"), "/s/r/a b.html", "browser")).toEqual({
      argv: ["/usr/bin/xdg-open", "file:///s/r/a%20b.html"],
      cwd: undefined,
      label: "Browser",
    });
  });

  it("says so when nothing that would take it is installed", () => {
    expect(handOff(LINUX, installed("xdg-open"), FILE, "app")).toEqual({
      problem: "No app that opens a file is installed. Add one to ~/.config/agents/open.json.",
    });
    expect(handOff(LINUX, installed("code"), FILE, "browser")).toMatchObject({
      problem: expect.stringMatching(/^No app that opens a link/),
    });
  });
});
