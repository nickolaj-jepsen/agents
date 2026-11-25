/**
 * Checkouts for open's scenarios, and the programs a press may start. A press must reach only
 * stand-ins that write a line to `launched.log` beside the run's `bin`: nothing a scenario does
 * opens a real editor, file manager or forge.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configHome } from "@agents/drive/lib/setup.ts";
import type { SetupContext } from "@agents/drive/lib/session.ts";

export const BRANCH = "feature/retry-after";

/** A repository on GitHub, a branch that is pushed (so a pull request can be asked about). */
export const checkout = (ctx: SetupContext, branch = BRANCH, mergeBase?: string) => {
  ctx.write("README.md", "# orders-api\n");
  ctx.initRepo();
  ctx.git("remote", "add", "origin", "https://github.com/acme/orders-api.git");
  ctx.git("checkout", "-q", "-b", branch);
  ctx.git("add", "README.md");
  ctx.git(
    "-c",
    "user.name=Alex Example",
    "-c",
    "user.email=alex@example.invalid",
    "commit",
    "-q",
    "-m",
    "Honor Retry-After in the sync worker",
  );
  ctx.git("update-ref", `refs/remotes/origin/${branch}`, "HEAD");
  ctx.git("config", `branch.${branch}.remote`, "origin");
  ctx.git("config", `branch.${branch}.merge`, `refs/heads/${branch}`);
  if (mergeBase) ctx.git("config", `branch.${branch}.gh-merge-base`, mergeBase);
};

export const LONG_BASE = "release/2026-11-payments-integration-train-for-the-eu-region-rollout";

const log = (name: string) =>
  `#!/bin/sh\necho "${name} $*" >> "$(dirname "$0")/../launched.log"\nexit 0\n`;

/** `gh pr view` for a branch with an open pull request, answered without a network or an account. */
const ghPr = `#!/bin/sh\necho '{"url":"https://github.com/acme/orders-api/pull/12","number":12,"state":"OPEN","isDraft":false}'\n`;
/** `gh pr view` for a branch with no pull request yet. */
const ghNone = '#!/bin/sh\necho "no pull requests found for branch" >&2\nexit 1\n';

/** What a press may start: each writes its own name and arguments to `launched.log`. */
const apps = Object.fromEntries(
  ["code", "xdg-open", "nautilus", "nvim-stub"].map((n) => [n, log(n)]),
);

// Called as `xdg-terminal-exec --dir=<cwd> [program...]`.
// `--print-id` is the readiness check: a terminal is chosen when it prints one and exits 0.
apps["xdg-terminal-exec"] = `#!/bin/sh
[ "$1" = --print-id ] && { echo stub.desktop; exit 0; }
printf 'xdg-terminal-exec %s\\n' "$*" >> "$(dirname "$0")/../launched.log"
`;

/** A machine with Code, a file manager and a terminal, and without Sublime Merge or Zed. */
const machine = { bin: apps, hide: ["smerge", "zed", "zeditor"] };

export const start = (gh: "pr" | "none") => ({
  turns: [{ text: "Hello from the stub." }],
  bin: { ...machine.bin, gh: gh === "pr" ? ghPr : ghNone },
  hide: machine.hide,
});

/**
 * The clipboard of a pi run: pi copies with `wl-copy` when it is told of a Wayland display, so the
 * stand-in takes what is copied to `copied.log` and the person's own clipboard is never written.
 */
export const clipboard = {
  bin: { "wl-copy": '#!/bin/sh\ncat > "$(dirname "$0")/../copied.log"\n' },
  env: { WAYLAND_DISPLAY: "e2e-fixture", DISPLAY: "" },
};

/** An app that is on the PATH but cannot start: its interpreter does not exist. */
export const BROKEN = "#!/nonexistent/interpreter\n";

/**
 * The person's `open.json` for a run, in the run's own `$XDG_CONFIG_HOME` (`configHome`): no
 * scenario reads the real one. A string is written as it is, for a file that does not parse.
 */
export const writeConfig = (ctx: SetupContext, config: unknown) => {
  const dir = join(configHome(ctx.runDir), "agents");
  mkdirSync(dir, { recursive: true });
  const text = typeof config === "string" ? config : JSON.stringify(config, null, 2);
  writeFileSync(join(dir, "open.json"), text);
};

/** A custom app listed first, and the file manager hidden. */
export const withConfig = (ctx: SetupContext) => {
  checkout(ctx);
  writeConfig(ctx, {
    apps: [
      { id: "nvim", label: "Neovim", command: "nvim-stub", dir: ["{dir}"], terminal: true },
      { id: "files", hidden: true },
    ],
  });
};

/** An `open.json` that is not JSON: the built-in apps stay, and the menu says what went wrong. */
export const withBrokenConfig = (ctx: SetupContext) => {
  checkout(ctx);
  writeConfig(ctx, "{ not json");
};

/** An app first in the list whose program is installed but will not start (`BROKEN`). */
export const withBrokenApp = (ctx: SetupContext) => {
  checkout(ctx);
  writeConfig(ctx, {
    apps: [{ id: "broken", label: "Broken editor", command: "broken-stub", dir: ["{dir}"] }],
  });
};

/** More apps than a pane holds, with long labels and wide characters; some are not installed. */
export const withCrowd = (ctx: SetupContext) => {
  checkout(ctx);
  const labels = [
    "Neovim in the terminal with the project's long-named profile and plugins",
    "日本語のエディタ（プロジェクトを開く）",
    "Review the checkout in the browser-based editor on the company's intranet",
    "Helix",
    "Emacs, started as a daemon with a very long server name",
    "Kakoune",
    "ターミナルで開く長い名前のアプリケーション",
    "Micro",
  ];
  writeConfig(ctx, {
    apps: labels.map((label, i) => ({
      id: `custom-${i + 1}`,
      label,
      // Every other one has no program on the machine.
      command: i % 2 === 0 ? "nvim-stub" : "missing-stub",
      dir: ["{dir}"],
      terminal: i % 2 === 0,
    })),
  });
};
