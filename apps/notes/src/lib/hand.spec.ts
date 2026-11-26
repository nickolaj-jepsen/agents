import { builtinApps, type Installed, readConfig } from "@agents/launch/apps.ts";
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

  it("names an app that is installed but not set up, for a file and for a link", () => {
    // Every app that takes a file is installed, and the only one says it is not set up.
    const notSetUp = { ...installed("xdg-open"), unready: new Set(["browser"]) };
    expect(handOff(LINUX, notSetUp, FILE, "app")).toEqual({
      problem: "No app that opens a file is installed. Add one to ~/.config/agents/open.json.",
    });
    expect(handOff(LINUX, notSetUp, "/s/r/a.html", "browser")).toEqual({
      problem: "Browser is not set up, so there is nothing to open the note in.",
    });
    const mine = readConfig(
      JSON.stringify({
        apps: [{ id: "mine", label: "Mine", command: "mine", file: ["{file}"], ready: ["--ok"] }],
      }),
      "linux",
    ).apps;
    expect(
      handOff(mine, { ...installed("mine"), unready: new Set(["mine"]) }, FILE, "app"),
    ).toEqual({ problem: "Mine is not set up, so there is nothing to open the note in." });
  });

  it("says a terminal program has no terminal, not that no app is installed", () => {
    const apps = readConfig(
      JSON.stringify({
        apps: [{ id: "nvim", label: "Neovim", command: "nvim", file: ["{file}"], terminal: true }],
      }),
      "linux",
    ).apps;
    const has = installed("nvim", "xdg-terminal-exec");
    // With a terminal to run it in, the note goes there; with none, the note says which piece is missing.
    expect(handOff(apps, has, FILE, "app")).toMatchObject({
      argv: [
        "/usr/bin/xdg-terminal-exec",
        "--dir=/data/store/shop-api/plans",
        "/usr/bin/nvim",
        FILE,
      ],
      label: "Neovim",
    });
    expect(handOff(apps, { ...has, unready: new Set(["terminal"]) }, FILE, "app")).toEqual({
      problem: "Neovim has no terminal to run it in, so there is nothing to open the note in.",
    });
  });

  it("counts the apps it cannot use, and keeps the note's words about them", () => {
    const apps = readConfig(
      JSON.stringify({
        apps: [
          { id: "one", label: "One", command: "one", file: ["{file}"], ready: ["--ok"] },
          {
            id: "two",
            label: "Two",
            command: "two",
            file: ["{file}"],
            terminal: true,
          },
        ],
      }),
      "linux",
    ).apps;
    const has = { ...installed("one", "two"), unready: new Set(["one", "terminal"]) };
    expect(handOff(apps, has, FILE, "app")).toEqual({
      problem: "One is not set up (and 1 more), so there is nothing to open the note in.",
    });
  });
});
