/**
 * The fixture the publication specs share: a small agents-like git checkout, a fake `nix` that
 * turns the expression it receives into a fake store with the linkFarm shape the CLI reads back, a
 * baseline, and the environment a Nix wrapper would hand the CLI. No store and no network.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { main } from "../cli.ts";
import type { Environment } from "../core/paths.ts";
import { flockHelperForTests } from "./flock.ts";

export const REVISION = "1".repeat(40);
export const NEXT_REVISION = "2".repeat(40);

export type Halves = readonly ("pi" | "claude")[];
export type FixtureOptions = {
  plugins?: Record<string, Halves>;
  skills?: readonly string[];
};

const FAKE_NIX = `#!/usr/bin/env bash
# Stands in for \`nix build\`: reads the linkFarm entries out of --expr, builds a fake store tree
# with the same shape and links --out-link at it.
set -eu
out=""
expr=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --out-link) out="$2"; shift 2 ;;
    --expr) expr="$2"; shift 2 ;;
    *) shift ;;
  esac
done
if [ -n "\${FAKE_NIX_LOG:-}" ]; then printf '%s\\n' "$expr" >"$FAKE_NIX_LOG"; fi
if [ -n "\${FAKE_NIX_FAIL:-}" ]; then
  echo "fake nix: the build failed" >&2
  exit 1
fi
# A publication that takes a moment, so a spec can hold one open across another process, and a
# marker so it can tell the build has started (the snapshot exists before the build does).
if [ -n "\${FAKE_NIX_SLEEP:-}" ]; then
  if [ -n "\${FAKE_NIX_MARKER:-}" ]; then : >"$FAKE_NIX_MARKER"; fi
  sleep "$FAKE_NIX_SLEEP"
fi
store=\${FAKE_NIX_STORE:?}
# A fresh directory per invocation, the way a real linkFarm build gets a new store path: the GC
# root of an older generation must not see this build's outputs.
farm=$(mktemp -d "$store/farm.XXXXXX")
for entry in $(printf '%s\\n' "$expr" | sed -n 's/.*name = "\\(plugins\\/[^"]*\\)".*/\\1/p'); do
  name=$(printf '%s' "\${entry#plugins/}" | tr '/' '-')
  mkdir -p "$store/out-$name" "$(dirname "$farm/$entry")"
  ln -sfn "$store/out-$name" "$farm/$entry"
done
if printf '%s\\n' "$expr" | grep -q 'name = "skills"'; then
  snap=$(printf '%s\\n' "$expr" | sed -n 's/.*builtins.path { path = \\([^;]*\\);.*/\\1/p' | head -n1)
  rm -rf "$store/snapshot"
  mkdir -p "$store/snapshot"
  if [ -n "$snap" ] && [ -d "$snap/skills" ]; then cp -r "$snap/skills" "$store/snapshot/skills"; fi
  ln -sfn "$store/snapshot" "$farm/skills"
fi
# UI artifacts: a folder of the runtime UI (mods/, layouts/). From FAKE_NIX_UI_SRC when the
# test names one, else a minimal tree, so a deploy has real files to write.
for entry in $(printf '%s\\n' "$expr" | sed -n 's/.*name = "ui\\/\\([^"]*\\)".*/\\1/p'); do
  dir="$store/out-ui-$entry"
  rm -rf "$dir"
  mkdir -p "$dir"
  if [ -n "\${FAKE_NIX_UI_SRC:-}" ]; then
    cp -r "$FAKE_NIX_UI_SRC"/. "$dir"/
  else
    mkdir -p "$dir/mods/$entry" "$dir/layouts"
    printf '// main\n' >"$dir/mods/$entry/main.js"
    printf '{"place":"none"}\n' >"$dir/mods/$entry/mod.json"
    printf '{"id":"root"}\n' >"$dir/layouts/nested.json"
  fi
  mkdir -p "$(dirname "$farm/ui/$entry")"
  ln -sfn "$dir" "$farm/ui/$entry"
done
ln -sfn "$farm" "$out"
`;

export function runGit(checkout: string, ...args: string[]): void {
  execFileSync("git", ["-C", checkout, ...args], { stdio: "ignore" });
}

export function commitAll(checkout: string, message: string): void {
  runGit(checkout, "add", "-A");
  runGit(checkout, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", message);
}

export class Fixture {
  readonly temporary: string;
  readonly snapshots: string;
  readonly store: string;
  readonly bin: string;
  readonly checkout: string;
  readonly baselinePath: string;
  readonly stateHome: string;
  readonly configHome: string;
  readonly exprLog: string;
  env: Environment;

  constructor(options: FixtureOptions = {}) {
    this.temporary = fs.mkdtempSync(join(os.tmpdir(), "agents-test-"));
    this.snapshots = join(this.temporary, "tmp");
    fs.mkdirSync(this.snapshots);
    this.store = join(this.temporary, "store");
    fs.mkdirSync(join(this.store, "nixpkgs-source"), { recursive: true });
    fs.mkdirSync(join(this.store, "claude-code-2.0"));
    this.bin = join(this.temporary, "bin");
    fs.mkdirSync(this.bin);
    const fake = join(this.bin, "nix");
    fs.writeFileSync(fake, FAKE_NIX, { mode: 0o755 });

    this.checkout = join(this.temporary, "checkout");
    fs.mkdirSync(this.checkout);
    const plugins = options.plugins ?? { answer: ["pi", "claude"], docfix: ["pi"] };
    for (const [name, halves] of Object.entries(plugins)) {
      const directory = join(this.checkout, "apps", name);
      fs.mkdirSync(join(directory, "src"), { recursive: true });
      const packageJson: Record<string, unknown> = {
        name: `@nickolaj-jepsen/${name}`,
        version: "0.1.0",
      };
      for (const half of halves) packageJson[half] = {};
      fs.writeFileSync(join(directory, "package.json"), JSON.stringify(packageJson));
      fs.writeFileSync(join(directory, "src", "index.ts"), "export {};\n");
    }
    // Herdr's UI artifact: `"herdr": {"ui": true}` makes an app the folder Herdr loads.
    const ui = join(this.checkout, "apps", "herdr-ui");
    fs.mkdirSync(join(ui, "src", "mods", "demo"), { recursive: true });
    fs.mkdirSync(join(ui, "src", "layouts"), { recursive: true });
    fs.writeFileSync(
      join(ui, "package.json"),
      JSON.stringify({ name: "herdr-ui", version: "0.1.0", herdr: { ui: true } }),
    );
    fs.writeFileSync(join(ui, "src", "mods", "demo", "main.js"), "// main\n");
    fs.writeFileSync(join(ui, "src", "mods", "demo", "mod.json"), '{"place":"none"}\n');
    fs.writeFileSync(join(ui, "src", "mods", "demo", "queue.js"), "// queue\n");
    fs.writeFileSync(join(ui, "src", "layouts", "nested.json"), '{"id":"root"}\n');
    for (const name of options.skills ?? ["demo"]) {
      const directory = join(this.checkout, "skills", name);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(join(directory, "SKILL.md"), `# ${name}\n`);
    }
    fs.writeFileSync(join(this.checkout, ".gitignore"), "node_modules/\n");
    runGit(this.checkout, "init", "-q", "-b", "main");
    commitAll(this.checkout, "init");

    fs.mkdirSync(join(this.store, "baseline-herdr-ui", "mods", "demo"), { recursive: true });
    fs.mkdirSync(join(this.store, "baseline-herdr-ui", "layouts"), { recursive: true });
    fs.writeFileSync(
      join(this.store, "baseline-herdr-ui", "mods", "demo", "main.js"),
      "// pinned\n",
    );
    fs.writeFileSync(
      join(this.store, "baseline-herdr-ui", "layouts", "nested.json"),
      '{"id":"pinned"}\n',
    );
    this.baselinePath = join(this.temporary, "baseline.json");
    this.stateHome = join(this.temporary, "state");
    this.configHome = join(this.temporary, "config");
    this.exprLog = join(this.temporary, "expr.log");
    this.env = {
      PATH: `${this.bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
      HOME: join(this.temporary, "home"),
      TMPDIR: this.snapshots,
      XDG_STATE_HOME: this.stateHome,
      XDG_CONFIG_HOME: this.configHome,
      AGENTS_BASELINE: this.baselinePath,
      AGENTS_CHECKOUT: this.checkout,
      AGENTS_NIXPKGS: join(this.store, "nixpkgs-source"),
      AGENTS_CLAUDE: join(this.store, "claude-code-2.0"),
      AGENTS_SYSTEM: "x86_64-linux",
      AGENTS_UPDATE_LOCK_TIMEOUT: "5",
      AGENTS_FLOCK: flockHelperForTests(),
      FAKE_NIX_STORE: this.store,
      FAKE_NIX_LOG: this.exprLog,
      // The artifact a publish builds is the checkout's own UI sources, so a deploy has real
      // files to put where Herdr reads them.
      FAKE_NIX_UI_SRC: join(this.checkout, "apps", "herdr-ui", "src"),
    };
    this.writeBaseline();
  }

  cleanup(): void {
    fs.rmSync(this.temporary, { recursive: true, force: true });
  }

  get state(): string {
    return join(this.stateHome, "agents-updates");
  }

  get current(): string {
    return join(this.state, "current.json");
  }

  writeBaseline(
    options: {
      revision?: string;
      plugins?: Record<string, { pi: string | null; claude: string | null }>;
      skills?: Record<string, string>;
      ui?: Record<string, string>;
    } = {},
  ): Record<string, unknown> {
    const payload = {
      revision: options.revision ?? REVISION,
      plugins: options.plugins ?? {
        answer: {
          pi: join(this.store, "baseline-answer-pi"),
          claude: join(this.store, "baseline-answer-claude"),
        },
        docfix: { pi: join(this.store, "baseline-docfix-pi"), claude: null },
      },
      skills: options.skills ?? { demo: join(this.store, "baseline-skills", "demo") },
      ui: options.ui ?? { "herdr-ui": join(this.store, "baseline-herdr-ui") },
    };
    fs.writeFileSync(this.baselinePath, JSON.stringify(payload));
    return payload;
  }

  async runCli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
    return this.runCliWith(this.env, ...argv);
  }

  async runCliWith(
    env: Environment,
    ...argv: string[]
  ): Promise<{ code: number; out: string; err: string }> {
    let out = "";
    let err = "";
    const code = await main(argv, {
      env,
      out: { write: (text: string) => void (out += text) },
      err: { write: (text: string) => void (err += text) },
    });
    return { code, out, err };
  }

  async update(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
    return this.runCli("update", ...argv);
  }

  readState(): Record<string, any> {
    return JSON.parse(fs.readFileSync(this.current, "utf8"));
  }

  expr(): string {
    return fs.existsSync(this.exprLog) ? fs.readFileSync(this.exprLog, "utf8") : "";
  }

  head(): string {
    return execFileSync("git", ["-C", this.checkout, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  }

  /** A pid that certainly has no process behind it: a child that has already finished. */
  deadPid(): number {
    const result = spawnSync(process.execPath, ["-e", ""]);
    if (result.pid === undefined) throw new Error("no pid");
    return result.pid;
  }
}
