/**
 * What both halves do to fill a menu and to carry a press out, over a `Host` that runs the
 * commands, reads `open.json` and talks to the person. Pure: the Claude mod's host is the engine,
 * pi's is node, and the commands, their order and the words said are the same in both.
 */
import {
  BROWSER,
  choices,
  type Config,
  type Installed,
  type Platform,
  preferred,
  probeArgv,
  readConfig,
  readProbe,
} from "@agents/launch/apps.ts";
import {
  chooseRemote,
  folderMenu,
  forgesOf,
  gitMenu,
  type Menu,
  type MenuKind,
  parsePr,
  parseStatus,
  type PrAnswer,
  type Row,
  type Status,
} from "./menus.ts";

/** How long git, the probe and a start may take; `gh` asks the network, so it gets longer. */
export const GIT_TIMEOUT_MS = 3000;
export const GH_TIMEOUT_MS = 5000;

export const TITLES: Record<MenuKind, string> = { git: "Git", folder: "Open folder" };

/** The two commands: the name typed, the menu it opens, and what the command list says of it. */
export const COMMANDS = [
  {
    name: "git",
    kind: "git",
    description: "Open the git menu: the repository, branch and pull request on the forge",
  },
  {
    name: "open",
    kind: "folder",
    description: "Open the folder menu: this checkout in an editor, file manager or terminal",
  },
] as const satisfies readonly { name: string; kind: MenuKind; description: string }[];

/** A command run to its end. */
export type Ran = { exitCode: number; stdout: string; stderr: string };

/** What a harness gives to fill a menu. */
export type Host = {
  /**
   * Runs a command to its end, in `cwd` when one is given; nothing when it could not be started at
   * all. A command that ran out of time is a result that is not a success.
   */
  run(argv: string[], timeoutMs: number, cwd?: string): Promise<Ran | undefined>;
  /** The person's `open.json` as text, if it is there, and the platform its apps are for. */
  config(): Promise<{ text: string | undefined; platform: Platform }>;
  /** Tells the person what `open.json` got wrong; never called with none. */
  report(problems: readonly string[]): void;
};

/** What a harness gives to carry a press out. */
export type PressHost = Host & {
  copy(text: string): Promise<{ isCopied: true } | { isCopied: false; reason: string }>;
  /** Starts an app without waiting for it; false when it would not start. */
  start(argv: string[], cwd?: string): Promise<boolean>;
  /** One line to the person: what happened, or as a `warning` what did not. */
  say(text: string, tone: "info" | "warning"): void;
};

/** The row the keyboard is on: the one it was moved to, else the menu's own pick, else the first. */
export const focusOf = (m: Menu | null, at: string | null | undefined) =>
  m?.rows?.find((r) => r.id === at)?.id ?? m?.preferred ?? m?.rows?.[0]?.id;

/** What `open.json` got wrong as one line: the first problem, and how many more there are. */
export function problemsText(problems: readonly string[]): string | undefined {
  if (problems.length === 0) return undefined;
  const rest = problems.length > 1 ? ` (and ${problems.length - 1} more)` : "";
  return `open.json: ${problems[0]}${rest}`;
}

/** One read-only git command; anything it refuses is an empty answer. */
const git = async (host: Host, cwd: string, args: string[]) => {
  const r = await host.run(["git", "--no-optional-locks", "-C", cwd, ...args], GIT_TIMEOUT_MS);
  return r?.exitCode === 0 ? r.stdout.trim() : "";
};

async function lookupPr(host: Host, cwd: string, status: Status): Promise<PrAnswer> {
  // A branch that was never pushed has no pull request yet, and that is an answer.
  if (!status.branch || !status.upstream) return null;
  const r = await host.run(
    ["gh", "pr", "view", "--json", "url,number,state,isDraft"],
    GH_TIMEOUT_MS,
    cwd,
  );
  if (!r) return "no-gh";
  if (r.exitCode !== 0) {
    // These two are answers; anything else (offline, auth, timeout) is not.
    return /no pull requests found|no git remotes found/.test(r.stderr) ? null : "unknown";
  }
  return parsePr(r.stdout) ?? "unknown";
}

/** The remote's default branch, then the local main/master refs, then `main`. */
async function defaultBranch(host: Host, cwd: string, remote: string) {
  const head = await git(host, cwd, [
    "symbolic-ref",
    "--quiet",
    "--short",
    `refs/remotes/${remote}/HEAD`,
  ]);
  if (head.startsWith(`${remote}/`)) return head.slice(remote.length + 1);
  for (const candidate of ["main", "master"]) {
    const ref = `refs/remotes/${remote}/${candidate}`;
    if (await git(host, cwd, ["rev-parse", "--verify", "--quiet", ref])) return candidate;
  }
  return "main";
}

/** The apps on offer and which of them are installed, asked once for each menu that opens. */
export type Apps = { config: Config; installed: Installed };

export async function loadApps(host: Host): Promise<Apps> {
  const { text, platform } = await host.config();
  const config = readConfig(text, platform);
  const probe = await host.run(probeArgv(config.apps), GIT_TIMEOUT_MS);
  return { config, installed: readProbe(probe?.stdout ?? "") };
}

const report = (host: Host, problems: readonly string[]) => {
  if (problems.length) host.report(problems);
};

export async function buildGit(host: Host, cwd: string): Promise<Menu> {
  const out = await git(host, cwd, [
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=no",
  ]);
  if (!out) return { kind: "git", title: TITLES.git, rows: [], error: "Not a git repository." };
  const status = parseStatus(out);
  const branch = status.branch;
  const [config, branchRemote, mergeBase, pr, apps] = await Promise.all([
    git(host, cwd, ["config", "--get-regexp", "^remote\\..*\\.url$"]),
    branch ? git(host, cwd, ["config", "--get", `branch.${branch}.remote`]) : "",
    branch ? git(host, cwd, ["config", "--get", `branch.${branch}.gh-merge-base`]) : "",
    lookupPr(host, cwd, status),
    loadApps(host),
  ]);
  const { forges, problems } = forgesOf(apps.config.forges);
  report(host, [...apps.config.problems, ...problems]);
  const remote = chooseRemote(config, branchRemote, forges);
  // Mirrors `gh pr create`: the branch's gh-merge-base, else the remote's default branch.
  const base = mergeBase || (remote ? await defaultBranch(host, cwd, remote.name) : "main");
  return gitMenu({ status, remote, base, pr });
}

export async function buildFolder(host: Host, cwd: string): Promise<Menu> {
  const { config, installed } = await loadApps(host);
  report(host, config.problems);
  return folderMenu(cwd, choices(config.apps, installed, { kind: "dir", dir: cwd }));
}

/** A menu's rows, found. */
export const buildMenu = (host: Host, kind: MenuKind, cwd: string) =>
  kind === "git" ? buildGit(host, cwd) : buildFolder(host, cwd);

/** The command that opens a link: the first installed app that takes one. */
export async function browse(host: Host, url: string) {
  const { config, installed } = await loadApps(host);
  return preferred(choices(config.apps, installed, { kind: "url", url }))?.argv;
}

/**
 * Carries a row's press out and says how it went.
 * @returns Whether the menu closes: it stays for a row that cannot run, so the person reads why.
 */
export async function pressRow(host: PressHost, row: Row): Promise<"stay" | "close"> {
  if (!row.action) {
    host.say(`${row.label}: ${row.unavailable ?? "not available"}`, "info");
    return "stay";
  }
  const action = row.action;
  if (action.kind === "copy") {
    const r = await host.copy(action.text);
    if (r.isCopied) host.say(`Copied the ${action.what}`, "info");
    else host.say(`Couldn't copy: ${r.reason}`, "warning");
    return "close";
  }
  const argv = action.kind === "url" ? await browse(host, action.url) : action.argv;
  if (!argv) {
    host.say(`No ${BROWSER} app is installed to open the link`, "warning");
    return "stay";
  }
  const cwd = action.kind === "launch" ? action.cwd : undefined;
  if (!(await host.start(argv, cwd))) host.say(`Couldn't start ${argv[0]}`, "warning");
  return "close";
}

/**
 * The menu as plain text, for where no menu can be drawn: each row with its number, its note, and
 * what a press would open, copy or start, or why it cannot.
 */
export function menuText(m: Menu): string {
  const head = m.context ? `${m.title}: ${m.context}` : m.title;
  if (m.error) return `${head}\n${m.error}`;
  const rows = (m.rows ?? []).map((row, i) => {
    const what = !row.action
      ? `unavailable, ${row.unavailable ?? "not available"}`
      : row.action.kind === "url"
        ? row.action.url
        : row.action.kind === "copy"
          ? row.action.text
          : row.action.argv.join(" ");
    const note = row.action && row.description ? ` (${row.description})` : "";
    return `${i + 1}. ${row.label}${note}: ${what}`;
  });
  return [head, ...rows].join("\n");
}
