/**
 * The apps a checkout, a file or a link can be handed to: a built-in table, the person's
 * `open.json` laid over it, and the argv each app is started with. Pure: a harness reads the
 * file, runs the probe and starts the process, so a Claude mod and a pi extension share this.
 */

export type Platform = "mac" | "linux";

export type Target =
  | { kind: "dir"; dir: string }
  /** `dir` is where a terminal app starts; the file's own folder when it is not given. */
  | { kind: "file"; file: string; line?: number; dir?: string }
  | { kind: "url"; url: string };

export type TargetKind = Target["kind"];

export type App = {
  id: string;
  label: string;
  /** Executable names, tried in order: the first one installed runs. */
  command: string[];
  /** A path that must exist for the app to count as installed, e.g. a macOS bundle. */
  requires?: string;
  /** The arguments for each kind of target; an app without one is not offered for it. */
  dir?: string[];
  file?: string[];
  url?: string[];
  /** A terminal program: it is started inside a new window of the `terminal` app. */
  terminal?: boolean;
};

export type Config = {
  /** Every app on offer, the person's own first and in their order. */
  apps: App[];
  /** Hosts of self-hosted forges and the forge each one runs. */
  forges: Record<string, string>;
  /** What in the file was left out, and why; for a notice. */
  problems: string[];
};

/** The id of the app that opens a shell, which `terminal: true` apps are started in. */
export const TERMINAL = "terminal";
/** The id of the app that opens a link. */
export const BROWSER = "browser";

const macApp = (id: string, label: string, name: string, withFiles: boolean): App => ({
  id,
  label,
  command: ["open"],
  requires: `/Applications/${name}.app`,
  dir: ["-a", name, "{dir}"],
  ...(withFiles ? { file: ["-a", name, "{file}"] } : {}),
});

/** The apps offered with no configuration at all, in the order they are listed. */
export const builtinApps = (platform: Platform): App[] =>
  platform === "mac"
    ? [
        macApp("code", "VS Code", "Visual Studio Code", true),
        macApp("zed", "Zed", "Zed", true),
        macApp("smerge", "Sublime Merge", "Sublime Merge", false),
        { id: "files", label: "Finder", command: ["open"], dir: ["{dir}"] },
        { id: TERMINAL, label: "Terminal", command: ["open"], dir: ["-a", "Terminal", "{dir}"] },
        { id: BROWSER, label: "Browser", command: ["open"], url: ["{url}"] },
      ]
    : [
        {
          id: "code",
          label: "VS Code",
          command: ["code"],
          dir: ["{dir}"],
          // `code` lands in the focused window only when told.
          file: ["--reuse-window", "--goto", "{file}:{line}"],
        },
        // `zed` from the upstream build, `zeditor` from nixpkgs.
        {
          id: "zed",
          label: "Zed",
          command: ["zed", "zeditor"],
          dir: ["{dir}"],
          file: ["{file}:{line}"],
        },
        { id: "smerge", label: "Sublime Merge", command: ["smerge"], dir: ["{dir}"] },
        { id: "files", label: "Files", command: ["nautilus", "xdg-open"], dir: ["{dir}"] },
        {
          id: TERMINAL,
          label: "Terminal",
          command: ["xdg-terminal-exec"],
          dir: ["--dir={dir}"],
        },
        { id: BROWSER, label: "Browser", command: ["xdg-open"], url: ["{url}"] },
      ];

/**
 * Where the person's configuration is: `$XDG_CONFIG_HOME/agents/open.json`. A relative
 * `XDG_CONFIG_HOME` is ignored, as the XDG spec says.
 */
export const configPath = (env: { XDG_CONFIG_HOME?: string; HOME?: string }) => {
  const config = env.XDG_CONFIG_HOME?.startsWith("/") ? env.XDG_CONFIG_HOME : undefined;
  const base = config ?? (env.HOME?.startsWith("/") ? `${env.HOME}/.config` : undefined);
  return base ? `${base}/agents/open.json` : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string")
    ? (value as string[])
    : undefined;

const KINDS = ["dir", "file", "url"] as const;

/**
 * One entry of the file's `apps`, laid over the built-in app of the same id when there is one.
 * @returns The app, `null` for an entry that hides a built-in one, or why it was left out.
 */
function readApp(raw: unknown, at: number, base: App | undefined): App | null | string {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id)
    return `apps[${at}] has no "id"; left out`;
  const where = `apps[${at}] (${raw.id})`;
  if (raw.hidden === true) return null;
  const app: App = base ? { ...base } : { id: raw.id, label: raw.id, command: [] };
  if (raw.label !== undefined) {
    if (typeof raw.label !== "string") return `${where}: "label" is not a string; left out`;
    app.label = raw.label;
  }
  if (raw.command !== undefined) {
    const command = typeof raw.command === "string" ? [raw.command] : strings(raw.command);
    if (!command?.length || command.some((name) => !name))
      return `${where}: "command" is not a name or a list of names; left out`;
    app.command = command;
    // The built-in app's bundle says nothing about another command.
    delete app.requires;
  }
  if (raw.requires !== undefined) {
    if (typeof raw.requires !== "string") return `${where}: "requires" is not a path; left out`;
    app.requires = raw.requires;
  }
  for (const kind of KINDS) {
    if (raw[kind] === undefined) continue;
    if (raw[kind] === null) {
      delete app[kind];
      continue;
    }
    const args = strings(raw[kind]);
    if (!args) return `${where}: "${kind}" is not a list of arguments; left out`;
    app[kind] = args;
  }
  if (raw.terminal !== undefined) {
    if (typeof raw.terminal !== "boolean") return `${where}: "terminal" is not true or false`;
    app.terminal = raw.terminal;
  }
  if (app.command.length === 0) return `${where} has no "command"; left out`;
  if (!KINDS.some((kind) => app[kind])) return `${where} takes no "dir", "file" or "url"; left out`;
  return app;
}

/**
 * The apps and forges for a platform: the file's own apps first, in its order, then the built-in
 * ones it does not name. A file that is missing or does not parse leaves the built-in table.
 * @param text The contents of `open.json`, if it exists.
 */
export function readConfig(text: string | undefined, platform: Platform): Config {
  const builtin = builtinApps(platform);
  const config: Config = { apps: builtin, forges: {}, problems: [] };
  if (text === undefined || text.trim() === "") return config;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    config.problems.push(
      `open.json is not JSON: ${error instanceof Error ? error.message : error}`,
    );
    return config;
  }
  if (!isRecord(raw)) {
    config.problems.push("open.json is not an object");
    return config;
  }
  if (raw.forges !== undefined) {
    if (!isRecord(raw.forges)) config.problems.push('"forges" is not an object; left out');
    else
      for (const [host, forge] of Object.entries(raw.forges)) {
        if (typeof forge === "string") config.forges[host.toLowerCase()] = forge;
        else config.problems.push(`forges.${host} is not a forge's name; left out`);
      }
  }
  if (raw.apps === undefined) return config;
  if (!Array.isArray(raw.apps)) {
    config.problems.push('"apps" is not a list; left out');
    return config;
  }
  const named: App[] = [];
  const seen = new Set<string>();
  raw.apps.forEach((entry, at) => {
    const id = isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined;
    if (id !== undefined && seen.has(id)) {
      config.problems.push(`apps[${at}] (${id}) is listed twice; the first one counts`);
      return;
    }
    const app = readApp(
      entry,
      at,
      builtin.find((b) => b.id === id),
    );
    if (typeof app === "string") config.problems.push(app);
    // A hidden or a broken entry still takes the built-in app of its id off the list.
    if (id !== undefined) seen.add(id);
    if (app !== null && typeof app !== "string") named.push(app);
  });
  config.apps = [...named, ...builtin.filter((b) => !seen.has(b.id))];
  return config;
}

/** What is installed: each command found, by the name it was asked for, and each path that exists. */
export type Installed = {
  commands: ReadonlyMap<string, string>;
  paths: ReadonlySet<string>;
};

// Prints `c<TAB>name<TAB>path` for a command on PATH and `p<TAB>path` for a path that exists.
const PROBE = `mode=c
for a; do
  if [ "$a" = -- ]; then mode=p; continue; fi
  if [ "$mode" = p ]; then [ -e "$a" ] && printf 'p\\t%s\\n' "$a"; continue; fi
  found=$(command -v "$a" 2>/dev/null) && [ -n "$found" ] && printf 'c\\t%s\\t%s\\n' "$a" "$found"
done
exit 0`;

/**
 * The command that finds out which of the apps are installed; `readProbe` reads what it prints.
 * A command is looked for on the session's `PATH`, so one that is elsewhere is named by its path.
 */
export function probeArgv(apps: readonly App[]): string[] {
  const commands = [...new Set(apps.flatMap((app) => app.command))];
  const paths = [...new Set(apps.flatMap((app) => (app.requires ? [app.requires] : [])))];
  return ["sh", "-c", PROBE, "sh", ...commands, "--", ...paths];
}

export function readProbe(stdout: string): Installed {
  const commands = new Map<string, string>();
  const paths = new Set<string>();
  for (const line of stdout.split("\n")) {
    const [kind, first, second] = line.split("\t");
    if (kind === "c" && first && second) commands.set(first, second);
    else if (kind === "p" && first) paths.add(first);
  }
  return { commands, paths };
}

/** An app as a target's menu offers it: how it starts, or why it cannot. */
export type Choice = {
  app: App;
  /** The whole command; none when the app cannot run. */
  argv?: string[];
  /** The directory it starts in. */
  cwd?: string;
  /** Why it cannot run, in a few words. */
  unavailable?: string;
};

const parent = (path: string) => {
  const cut = path.replace(/\/+$/, "").lastIndexOf("/");
  return cut > 0 ? path.slice(0, cut) : "/";
};

/** The folder a target's app starts in. */
const cwdOf = (target: Target) =>
  target.kind === "dir"
    ? target.dir
    : target.kind === "file"
      ? (target.dir ?? parent(target.file))
      : undefined;

/**
 * An app's arguments for a target, its placeholders filled; a file with no line loses `:{line}`.
 * Each value goes in through a function, so a `$&` or `$$` in a path or a link stays as it is.
 */
function fill(args: readonly string[], target: Target): string[] {
  const line =
    target.kind === "file" && target.line !== undefined ? String(target.line) : undefined;
  const dir = cwdOf(target);
  const put = (text: string, name: string, value: string) => text.replaceAll(name, () => value);
  return args.map((arg) => {
    let out =
      line === undefined ? put(put(arg, ":{line}", ""), "{line}", "1") : put(arg, "{line}", line);
    if (dir !== undefined) out = put(out, "{dir}", dir);
    if (target.kind === "file") out = put(out, "{file}", target.file);
    if (target.kind === "url") out = put(out, "{url}", target.url);
    return out;
  });
}

/** `open -a Terminal` and the like: a macOS app takes a folder, and nothing to run in it. */
const runsPrograms = (shell: App) => !/(^|\/)open$/.test(shell.command[0] ?? "");

/** The app's own command for a target: its first installed executable and the filled arguments. */
function own(app: App, installed: Installed, target: Target): string[] | undefined {
  const args = app[target.kind];
  if (!args) return undefined;
  if (app.requires !== undefined && !installed.paths.has(app.requires)) return undefined;
  const found = app.command.map((name) => installed.commands.get(name)).find(Boolean);
  return found ? [found, ...fill(args, target)] : undefined;
}

/**
 * The apps that take a target, in the list's order. One that is not installed keeps its place and
 * says why, so the rows never move.
 */
export function choices(apps: readonly App[], installed: Installed, target: Target): Choice[] {
  const cwd = cwdOf(target);
  const shell = apps.find((app) => app.id === TERMINAL);
  return apps
    .filter((app) => app[target.kind])
    .map((app): Choice => {
      const argv = own(app, installed, target);
      if (!argv) return { app, unavailable: "not installed" };
      if (!app.terminal) return { app, argv, cwd };
      const window =
        shell && cwd !== undefined && runsPrograms(shell)
          ? own(shell, installed, { kind: "dir", dir: cwd })
          : undefined;
      return window
        ? { app, argv: [...window, ...argv], cwd }
        : { app, unavailable: "no terminal to run it in" };
    });
}

/** The app a target goes to when nobody picks: the first one in the list that can run. */
export const preferred = (offered: readonly Choice[]): Choice | undefined =>
  offered.find((choice) => choice.argv);

/**
 * Put before a command, starts it without waiting: its output is closed and, where `setsid` is
 * there (Linux, GNU or busybox), it gets a session of its own, so it outlives the call that
 * started it. A background child of a shell without job control leads no process group, so
 * `setsid` needs no `-f`, which busybox lacks.
 */
export const DETACH = [
  "sh",
  "-c",
  'exec >/dev/null 2>&1 </dev/null; if command -v setsid >/dev/null; then setsid "$@" & else "$@" & fi',
  "sh",
];
