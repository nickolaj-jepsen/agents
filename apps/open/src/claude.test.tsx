import type { On } from "claude-code";
import { expect, test } from "claude-code/testing";
import type { Engine, Mounted } from "claude-code/testing";

import { expectNative } from "@agents/kit-core/paint/checks.tsx";
import { DETACH } from "@agents/launch/apps.ts";

const PANE = {
  plugin: "open",
  component: "Pane",
  requestId: "open",
  props: {
    title: "Git",
    isFocused: true,
    bodyColumns: 60,
    placement: "inline",
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const;

const RUN = {
  origin: { kind: "composer" },
  presentation: { isFullscreen: true, columns: 160 },
  args: "",
} as const;

const PR =
  '{"url":"https://github.com/me/repo/pull/12","number":12,"state":"OPEN","isDraft":false}';

const HOME = "/home/me";
const CONFIG = `${HOME}/.config/agents/open.json`;
const BIN = "/usr/bin";
const XDG = `${BIN}/xdg-terminal-exec`;
const CHECKOUT = "/repo with spaces/作業";

/** What the machine has by default: Code, a file manager and a browser, and no terminal launcher. */
const DEFAULT_INSTALLED = ["code", "nautilus", "xdg-open"];

type World = {
  /** Every argv started through `DETACH`, without it. */
  launched: string[][];
  launchCwds: (string | undefined)[];
  copied: string[];
  /** Every toast. */
  toasts: string[];
  /** The panes closed. */
  closed: string[];
  /** Every argv the mod ran at all. */
  ran: string[][];
};

const ok = (stdout: string, exitCode = 0, stderr = "") => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
});

const startsWith = (argv: readonly string[], prefix: readonly string[]) =>
  prefix.every((item, i) => argv[i] === item);

function world(
  on: On,
  {
    pr = PR as string | null,
    mac = false,
    cwd = "/repo",
    installed = DEFAULT_INSTALLED,
    /** Paths the probe finds, e.g. a macOS app bundle. */
    paths = [] as string[],
    /** The contents of `open.json`; undefined for no file. */
    config = undefined as string | undefined,
    remote = "git@github.com:me/repo.git",
  } = {},
): World {
  const w: World = { launched: [], launchCwds: [], copied: [], toasts: [], closed: [], ran: [] };
  on("env.get", (_, e) => ({
    value: ({ HOME, USER: "me" } as Record<string, string>)[e.name],
  }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.close", (_, e) => {
    w.closed.push(e.id);
    return { value: undefined };
  });
  on("ui.panes", () => ({ value: [] }));
  on("ui.toast", (_, e) => {
    w.toasts.push(e.text);
    return { value: undefined };
  });
  on("ui.copy", (_, e) => {
    w.copied.push(e.text);
    return { value: { isCopied: true } };
  });
  on("session.cwd", () => ({ value: cwd }));
  on("fs.exists", (_, e) => ({ value: config !== undefined && e.path === CONFIG }));
  on("fs.read", (_, e) => {
    if (config === undefined || e.path !== CONFIG) throw new Error(`ENOENT: ${e.path}`);
    return { value: config };
  });
  on("process.run", (_, e) => {
    const argv = [...e.argv];
    const line = argv.join(" ");
    w.ran.push(argv);
    if (argv[0] === "uname") return ok(mac ? "Darwin\n" : "Linux\n");
    if (argv[0] === "gh")
      return pr === null ? ok("", 1, "no pull requests found for branch") : ok(pr);
    if (argv[0] === "git") {
      if (line.includes(" status ")) {
        return ok(
          "# branch.oid abc1234def\n# branch.head feat/x\n# branch.upstream origin/feat/x\n",
        );
      }
      if (line.includes("--get-regexp")) return ok(`remote.origin.url ${remote}\n`);
      if (line.endsWith("branch.feat/x.remote")) return ok("origin\n");
      if (line.includes("symbolic-ref")) return ok("origin/main\n");
      return ok("", 1);
    }
    // The probe: `sh -c <script> sh <commands...> -- <paths...>`.
    if (argv[0] === "sh" && argv[2]?.startsWith("mode=c")) {
      const rest = argv.slice(4);
      const cut = rest.indexOf("--");
      const commands = rest.slice(0, cut);
      const wanted = rest.slice(cut + 1);
      return ok(
        [
          ...commands.filter((c) => installed.includes(c)).map((c) => `c\t${c}\t${BIN}/${c}\n`),
          ...wanted.filter((p) => paths.includes(p)).map((p) => `p\t${p}\n`),
        ].join(""),
      );
    }
    if (startsWith(argv, DETACH)) {
      w.launched.push(argv.slice(DETACH.length));
      w.launchCwds.push(e.init?.cwd);
      return ok("");
    }
    return ok("", 1);
  });
  return w;
}

type Surface = "terminal" | "desktop" | "vscode";

async function start($: Engine, on: On, surface: Surface = "terminal") {
  on("command.register", (_, e) => ({ value: { command: e.name } }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  await $.session.start({ cwd: "/repo", surface, isInteractive: true });
}

/** Everything the pane says. */
async function paneText($: Engine, surface: Surface = "terminal") {
  const pane = await $.ui.mount({ ...PANE, surface });
  const texts = await pane.findAll({ type: "Text" });
  await pane.unmount();
  return texts.map((t) => t.text).join(" ");
}

/** The keys of the pane's buttons. */
async function buttonKeys($: Engine, surface: Surface = "terminal") {
  const pane = await $.ui.mount({ ...PANE, surface });
  const keys = (await pane.findAll({ type: "Button" })).map((b) => String(b.key));
  await pane.unmount();
  return keys;
}

test("/git opens the branch's pull request on the forge", async ($, on) => {
  const w = world(on);
  await start($, on);
  for (const surface of ["terminal", "desktop"] as const) {
    w.launched = [];
    await $.command.run({ ...RUN, command: "git" });
    const pane = await $.ui.mount({ ...PANE, surface });
    await pane.press({ key: "pr" });
    await pane.unmount();
    expect(w.launched).toEqual([[`${BIN}/xdg-open`, "https://github.com/me/repo/pull/12"]]);
  }
});

test("a row that cannot run starts nothing", async ($, on) => {
  const w = world(on);
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });

  // The branch already has an open pull request, so there is none to create: its row is no
  // control, and its number key says why.
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await pane.find({ type: "Button", key: "create" })).toBeUndefined();
  await pane.press({ key: "kit-key-4" });
  await pane.unmount();
  expect(w.launched).toEqual([]);
  expect(w.toasts).toEqual(["Create pull request: PR #12 is open"]);
});

test("without a pull request, create links the compare page into the default branch", async ($, on) => {
  const w = world(on, { pr: null });
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });

  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "create" });
  await pane.unmount();
  expect(w.launched).toContainEqual([
    `${BIN}/xdg-open`,
    "https://github.com/me/repo/compare/main...feat/x?expand=1",
  ]);
});

test("the copy row puts the branch name on the clipboard", async ($, on) => {
  const w = world(on);
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });

  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "copy" });
  await pane.unmount();
  expect(w.copied).toEqual(["feat/x"]);
  expect(w.launched).toEqual([]);
});

test("a repository on a host nobody named has no forge links", async ($, on) => {
  const w = world(on, { remote: "git@git.example.com:team/repo.git" });
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await pane.find({ type: "Button", key: "repo" })).toBeUndefined();
  await pane.press({ key: "kit-key-1" });
  await pane.unmount();
  expect(w.toasts).toEqual(["Open repository: no supported remote"]);
  expect(w.launched).toEqual([]);
});

test("/open hands the checkout to an installed app and not to a missing one", async ($, on) => {
  const w = world(on);
  await start($, on);
  await $.command.run({ ...RUN, command: "open" });

  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  // Sublime Merge is not installed: its row is no control, and its number key says why.
  expect(await pane.find({ type: "Button", key: "smerge" })).toBeUndefined();
  await pane.press({ key: "kit-key-3" });
  expect(w.launched).toEqual([]);
  expect(w.toasts).toEqual(["Sublime Merge: not installed"]);
  await pane.press({ key: "code" });
  await pane.unmount();
  expect(w.launched).toEqual([[`${BIN}/code`, "/repo"]]);
  expect(w.launchCwds).toEqual(["/repo"]);
});

for (const { label, options, argv } of [
  {
    label: "the desktop's terminal on Linux",
    options: { installed: [...DEFAULT_INSTALLED, "xdg-terminal-exec"] },
    argv: [XDG, `--dir=${CHECKOUT}`],
  },
  {
    label: "Terminal.app on macOS",
    options: {
      mac: true,
      installed: ["open"],
      paths: [],
    },
    argv: [`${BIN}/open`, "-a", "Terminal", CHECKOUT],
  },
]) {
  test(`/open Terminal uses ${label} in the checkout`, async ($, on) => {
    const w = world(on, { ...options, cwd: CHECKOUT });
    await start($, on);
    await $.command.run({ ...RUN, command: "open" });
    const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
    await pane.press({ key: "terminal" });
    await pane.unmount();
    expect(w.launched).toEqual([argv]);
    expect(w.launchCwds).toEqual([CHECKOUT]);
  });
}

test("/open on macOS offers the apps whose bundle exists", async ($, on) => {
  const w = world(on, {
    mac: true,
    installed: ["open"],
    paths: ["/Applications/Zed.app"],
  });
  await start($, on);
  await $.command.run({ ...RUN, command: "open" });
  const keys = await buttonKeys($);
  // Zed has its bundle; Visual Studio Code does not.
  expect(keys).toContain("zed");
  expect(keys).not.toContain("code");
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "zed" });
  await pane.unmount();
  expect(w.launched).toEqual([[`${BIN}/open`, "-a", "Zed", "/repo"]]);
});

test("on macOS a link goes to `open`", async ($, on) => {
  const w = world(on, { mac: true, installed: ["open"] });
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "pr" });
  await pane.unmount();
  expect(w.launched).toEqual([[`${BIN}/open`, "https://github.com/me/repo/pull/12"]]);
});

test("/open Terminal is unavailable without a launcher", async ($, on) => {
  const w = world(on);
  await start($, on);
  await $.command.run({ ...RUN, command: "open" });
  expect(await paneText($)).toContain("not installed");
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await pane.find({ type: "Button", key: "terminal" })).toBeUndefined();
  await pane.press({ key: "kit-key-5" });
  await pane.unmount();
  expect(w.toasts).toEqual(["Terminal: not installed"]);
  expect(w.launched).toEqual([]);
});

test("the terminal pane keeps its rows' keys, the keyboard on the pull request, and Close", async ($, on) => {
  const w = world(on);
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  const said = (await pane.findAll({ type: "Text" })).map((t) => t.text).join("\n");
  // The menu's name and what it acts on in the caption, a number before each row, the pointer on
  // the branch's pull request, and the way to close.
  expect(said).toContain("Git");
  expect(said).toContain("me/repo");
  expect(said).toMatch(/❯ 3 Open pull request #12/);
  expect(said).toContain("Close ×");
  for (const key of ["kit-key-1", "kit-key-6"])
    expect(await pane.find({ type: "Button", key })).toBeDefined();
  await pane.press({ key: "frame:close" });
  await pane.unmount();
  expect(w.closed).toEqual(["open"]);
  expect(w.launched).toEqual([]);
});

test("bare /open shows the folder menu, with a row to copy the path", async ($, on) => {
  const w = world(on);
  await start($, on);
  await $.command.run({ ...RUN, command: "open" });
  const keys = await buttonKeys($);
  expect(await paneText($)).toContain("Open folder");
  // Which apps the machine has decides their rows; Copy path is the menu's own, and there is no
  // row for notes.
  expect(keys).toEqual(expect.arrayContaining(["code", "files", "copy"]));
  expect(keys).not.toContain("notes");
  expect(await paneText($)).not.toContain("Notes");
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "copy" });
  await pane.unmount();
  expect(w.copied).toEqual(["/repo"]);
});

test("/open plan is gone: the folder menu opens as for a bare /open", async ($, on) => {
  world(on);
  await start($, on);
  await $.command.run({ ...RUN, command: "open", args: "plan" });
  expect(await paneText($)).toContain("Open folder");
});

// open.json: the person's own apps, laid over the built-in ones.

/** The row the keyboard starts on, as the terminal draws it. */
const pointed = async ($: Engine) => /❯ (\d+) (.+?)(?:\s{2,}|$)/m.exec(await paneText($))?.[2];

test("open.json puts its apps first, and the first installed one is preselected", async ($, on) => {
  const w = world(on, {
    // Zed first, though it is not installed; then the file manager, then Code.
    config: JSON.stringify({ apps: [{ id: "zed" }, { id: "files" }, { id: "code" }] }),
  });
  await start($, on);
  await $.command.run({ ...RUN, command: "open" });
  const keys = await buttonKeys($);
  // Zed is not installed and has no button, so the buttons run files, code, then the rest.
  expect(keys.filter((k) => !k.startsWith("kit-") && k !== "frame:close")).toEqual([
    "files",
    "code",
    "copy",
  ]);
  const text = await paneText($);
  expect(text.indexOf("Zed")).toBeLessThan(text.indexOf("Files"));
  expect(text.indexOf("Files")).toBeLessThan(text.indexOf("VS Code"));
  expect(text.indexOf("VS Code")).toBeLessThan(text.indexOf("Sublime Merge"));
  expect(await pointed($)).toMatch(/^Files/);
  expect(w.toasts).toEqual([]);
});

test("open.json adds an app of its own, started in a terminal", async ($, on) => {
  const w = world(on, {
    installed: [...DEFAULT_INSTALLED, "xdg-terminal-exec", "nvim"],
    config: JSON.stringify({
      apps: [{ id: "nvim", label: "Neovim", command: "nvim", dir: ["{dir}"], terminal: true }],
    }),
  });
  await start($, on);
  await $.command.run({ ...RUN, command: "open" });
  expect(await paneText($)).toContain("Neovim");
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "nvim" });
  await pane.unmount();
  expect(w.launched).toEqual([[XDG, "--dir=/repo", `${BIN}/nvim`, "/repo"]]);
  expect(w.launchCwds).toEqual(["/repo"]);
  expect(w.toasts).toEqual([]);
});

test("open.json hides a built-in app", async ($, on) => {
  world(on, { config: JSON.stringify({ apps: [{ id: "zed", hidden: true }] }) });
  await start($, on);
  await $.command.run({ ...RUN, command: "open" });
  const text = await paneText($);
  // Zed would otherwise show as "not installed".
  expect(text).not.toContain("Zed");
  expect(text).toContain("Sublime Merge");
  expect(text).toContain("VS Code");
});

test("open.json names a self-hosted forge, and /git links it", async ($, on) => {
  const w = world(on, {
    remote: "git@git.example.com:team/sub/repo.git",
    pr: null,
    config: JSON.stringify({ forges: { "Git.Example.com": "gitlab" } }),
  });
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "repo" });
  await pane.unmount();
  expect(w.launched).toEqual([[`${BIN}/xdg-open`, "https://git.example.com/team/sub/repo"]]);

  await $.command.run({ ...RUN, command: "git" });
  const again = await $.ui.mount({ ...PANE, surface: "terminal" });
  await again.press({ key: "branch" });
  await again.unmount();
  expect(w.launched[1]).toEqual([
    `${BIN}/xdg-open`,
    "https://git.example.com/team/sub/repo/-/tree/feat/x",
  ]);
});

test("a forge that is none of the three is reported", async ($, on) => {
  const w = world(on, { config: JSON.stringify({ forges: { "git.example.com": "gitea" } }) });
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });
  expect(w.toasts).toHaveLength(1);
  expect(w.toasts[0]).toMatch(/^open\.json: .*gitea/);
});

test("a broken open.json is a toast, and the built-in apps still work", async ($, on) => {
  const w = world(on, { config: "{ not json" });
  await start($, on);
  await $.command.run({ ...RUN, command: "open" });
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "code" });
  await pane.unmount();
  expect(w.toasts).toHaveLength(1);
  expect(w.toasts[0]).toMatch(/^open\.json:/);
  expect(w.launched).toEqual([[`${BIN}/code`, "/repo"]]);
});

test("a broken open.json is a toast in /git too", async ($, on) => {
  const w = world(on, { config: "[1, 2]" });
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });
  expect(w.toasts).toHaveLength(1);
  expect(w.toasts[0]).toMatch(/^open\.json:/);
});

test("a link with no browser installed says so and starts nothing", async ($, on) => {
  const w = world(on, { installed: ["code", "nautilus"] });
  await start($, on);
  await $.command.run({ ...RUN, command: "git" });
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  await pane.press({ key: "pr" });
  await pane.unmount();
  expect(w.launched).toEqual([]);
  expect(w.toasts).toEqual(["No browser app is installed to open the link"]);
});

// On the graphical surfaces a row is text with a quiet button at its end; the checks are the style's
// (`expectNative`), what the pane says, and that a press does what a key does in the terminal.
for (const surface of ["desktop", "vscode"] as const) {
  /** The pane as the host opens it: titled with its menu's name. */
  const mount = ($: Engine, title: string) =>
    $.ui.mount({ ...PANE, props: { ...PANE.props, title }, surface });
  /** What the mounted pane's Text shows, in order; a Text inside a Text is one line, once. */
  const said = async (pane: Pick<Mounted, "findAll">) => [
    ...new Set((await pane.findAll({ type: "Text" })).map((t) => t.text)),
  ];

  test(`${surface}: /git draws a row per action, and a press runs it`, async ($, on) => {
    const w = world(on);
    await start($, on, surface);
    await $.command.run({ ...RUN, command: "git" });
    const pane = await $.ui.mount({ ...PANE, surface });
    await expectNative(pane);
    // The toolbar says which repository the rows act on; the pane's own title is the host's.
    expect(await said(pane)).toEqual(
      expect.arrayContaining(["me/repo", "Open repository", "github.com", "Open pull request #12"]),
    );
    for (const key of ["pr", "copy"])
      expect(await pane.find({ type: "Button", key })).toBeDefined();
    // The branch has a pull request already, so there is none to create: a row with no button.
    expect(await pane.find({ type: "Button", key: "create" })).toBeUndefined();
    expect(await pane.find({ type: "Text", text: "Create pull request" })).toBeDefined();
    await pane.press({ key: "pr" });
    await pane.unmount();
    expect(w.launched).toEqual([[`${BIN}/xdg-open`, "https://github.com/me/repo/pull/12"]]);
    await $.command.run({ ...RUN, command: "git" });
    const again = await $.ui.mount({ ...PANE, surface });
    await again.press({ key: "copy" });
    await again.unmount();
    expect(w.launched).toHaveLength(1);
    expect(w.copied).toEqual(["feat/x"]);
  });

  test(`${surface}: without a pull request, create is a button`, async ($, on) => {
    const w = world(on, { pr: null });
    await start($, on, surface);
    await $.command.run({ ...RUN, command: "git" });
    const pane = await $.ui.mount({ ...PANE, surface });
    await expectNative(pane);
    await pane.press({ key: "create" });
    await pane.unmount();
    expect(w.launched).toContainEqual([
      `${BIN}/xdg-open`,
      "https://github.com/me/repo/compare/main...feat/x?expand=1",
    ]);
  });

  test(`${surface}: /open draws the folder menu, and a press opens the terminal`, async ($, on) => {
    const w = world(on, { installed: [...DEFAULT_INSTALLED, "xdg-terminal-exec"] });
    await start($, on, surface);
    await $.command.run({ ...RUN, command: "open" });
    const pane = await mount($, "Open folder");
    await expectNative(pane);
    const keys = (await pane.findAll({ type: "Button" })).map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining(["code", "terminal", "copy"]));
    expect(keys).not.toContain("notes");
    // An app that is not installed keeps its row and says so, with no button to press.
    expect(keys).not.toContain("smerge");
    expect(await said(pane)).toEqual(expect.arrayContaining(["Sublime Merge", "not installed"]));
    expect(await said(pane)).toContain("Terminal");
    expect(await said(pane)).not.toContain("Notes");
    await pane.press({ key: "terminal" });
    await pane.unmount();
    expect(w.launched).toEqual([[XDG, "--dir=/repo"]]);
    expect(w.launchCwds).toEqual(["/repo"]);
  });

  test(`${surface}: no row carries a hotkey and no hint is drawn`, async ($, on) => {
    world(on);
    await start($, on, surface);
    await $.command.run({ ...RUN, command: "open" });
    const pane = await mount($, "Open folder");
    for (const b of await pane.findAll({ type: "Button" })) expect(b.props.hotkey).toBeUndefined();
    expect((await said(pane)).join(" ")).not.toMatch(/Enter|Esc/);
    await pane.unmount();
  });

  test(`${surface}: an app from open.json is a row with a button`, async ($, on) => {
    const w = world(on, {
      installed: [...DEFAULT_INSTALLED, "idea"],
      config: JSON.stringify({
        apps: [{ id: "idea", label: "IntelliJ", command: "idea", dir: ["{dir}"] }],
      }),
    });
    await start($, on, surface);
    await $.command.run({ ...RUN, command: "open" });
    const pane = await mount($, "Open folder");
    await expectNative(pane);
    expect(await said(pane)).toContain("IntelliJ");
    await pane.press({ key: "idea" });
    await pane.unmount();
    expect(w.launched).toEqual([[`${BIN}/idea`, "/repo"]]);
  });
}
