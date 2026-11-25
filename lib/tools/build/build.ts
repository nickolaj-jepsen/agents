/**
 * `node build.ts <app> [--watch]`: bundles one app (`apps/<name>`, or the catalogue's package) into
 * its gitignored `dist/`, in the shape Claude Code and pi load:
 *
 *   dist/.claude-plugin/plugin.json   the package.json's `claude` field plus its `version` (`types` points at ./types.d.ts)
 *   dist/hooks/hooks.json             the module (`../register.js`) and any settings-style `claude.hooks`
 *   dist/register.js                  `src/claude.tsx`, with the kit and `src/lib` bundled in
 *   dist/claude.test.ts               `src/claude.test.tsx`, which `claude plugin test` runs
 *   dist/types.d.ts                   the mod's state contract (`src/claude/types.d.ts`)
 *   dist/pi/index.ts, dist/package.json   `src/pi.ts`, and the manifest pi reads it from
 *   dist/README.md
 *   dist/CHANGELOG.md                 the released versions of the app's changelog, which pi shows
 *
 * Everything the mod engine reads is bundled, because a mod cannot import outside its folder. Two
 * things about that, both of which `claude plugin validate --strict` reports:
 *
 * - The engine's "function handed `$` is assigned to elsewhere" check is not scope-aware, and a bundle
 *   is one scope: a top-level function that takes `$` (`open($)`, `ask($)`) collides with any
 *   `let open = ...` anywhere else in the bundle, a kit's included. Rename the function in source
 *   (`openForm`, `askAbout`).
 * - `dist/.claude-plugin/types/` (the API types the engine lays when it loads a mod) and the
 *   `tsconfig.json` beside it are the engine's, so a build never wipes them (`clean: false`).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { build, type InlineConfig } from "tsdown";
import { publishedChangelog } from "./changelog.ts";

type Pkg = {
  name: string;
  version?: string;
  description?: string;
  keywords?: string[];
  agentTools?: unknown;
  peerDependencies?: Record<string, string>;
  claude?: Record<string, unknown> & { types?: string; hooks?: Record<string, unknown> };
  pi?: { extensions?: string[] };
};

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const dir = resolve(args.find((a) => !a.startsWith("-")) ?? process.cwd());
const dist = join(dir, "dist");
const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Pkg;
const first = (...files: string[]) => files.map((f) => join(dir, f)).find((f) => existsSync(f));

const mod = first("src/claude.tsx", "src/claude.ts");
const test = first("src/claude.test.tsx", "src/claude.test.ts");
const pi = first("src/pi.ts");

/** Writes a file unless it already holds the text: a running session reloads a mod on any write. */
function put(file: string, text: string | Buffer) {
  if (existsSync(file) && readFileSync(file).equals(Buffer.from(text))) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** The manifests, the types file and the README: what a build writes besides the bundles. */
function writeMetadata() {
  const json = (o: unknown) => JSON.stringify(o, null, 2) + "\n";
  if (mod && pkg.claude) {
    const { types, hooks, ...manifest } = pkg.claude;
    const typesFile = types && join(dir, types);
    if (typesFile && existsSync(typesFile)) {
      put(join(dist, "types.d.ts"), readFileSync(typesFile));
      (manifest as Record<string, unknown>).types = "./types.d.ts";
    }
    // The package.json version is the plugin's only one: the `claude` object carries none.
    put(join(dist, ".claude-plugin/plugin.json"), json({ ...manifest, version: pkg.version }));
    put(join(dist, "hooks/hooks.json"), json({ ...hooks, modules: ["../register.js"] }));
  }
  if (pi) {
    put(
      join(dist, "package.json"),
      json({
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        keywords: pkg.keywords,
        type: "module",
        pi: { extensions: ["./pi/index.ts"] },
        ...(pkg.agentTools ? { agentTools: pkg.agentTools } : {}),
        ...(pkg.peerDependencies ? { peerDependencies: pkg.peerDependencies } : {}),
      }),
    );
  }
  if (existsSync(join(dir, "README.md")))
    put(join(dist, "README.md"), readFileSync(join(dir, "README.md")));
  // Without `[Unreleased]`: a line written there changes no build until a version releases it.
  if (existsSync(join(dir, "CHANGELOG.md")))
    put(
      join(dist, "CHANGELOG.md"),
      publishedChangelog(readFileSync(join(dir, "CHANGELOG.md"), "utf8")),
    );
}

/** Empties `dist/` of what a build writes, keeping what the engine lays there. */
function prune() {
  if (!existsSync(dist)) return;
  for (const entry of readdirSync(dist)) {
    if (entry === "tsconfig.json") continue;
    if (entry === ".claude-plugin") {
      for (const inner of readdirSync(join(dist, entry)))
        if (inner !== "types") rmSync(join(dist, entry, inner), { recursive: true, force: true });
      continue;
    }
    rmSync(join(dist, entry), { recursive: true, force: true });
  }
}

const common = {
  config: false,
  cwd: dir,
  outDir: dist,
  format: "esm",
  minify: false,
  dts: false,
  clean: false,
  tsconfig: false,
  // `.ts` for two files that are bundled JavaScript all the same: the test bundle (`claude plugin test`
  // skips `*.test.js`), and pi's extension. pi loads a `.js` extension natively, so a package it
  // supplies (pi-tui) is another copy than its own and an `instanceof` of ours fails; a `.ts` one goes
  // through its loader, whose aliases give it the host's copy.
  outputOptions: {
    entryFileNames: (c: { name: string }) =>
      c.name.endsWith(".test") || c.name === "pi/index" ? "[name].ts" : "[name].js",
  },
  hooks: { "build:done": writeMetadata },
  watch,
} satisfies InlineConfig;

const configs: InlineConfig[] = [];
if (mod)
  configs.push({
    ...common,
    name: "claude",
    platform: "neutral",
    entry: { register: mod, ...(test ? { "claude.test": test } : {}) },
    // The mod engine supplies `claude-code`, and `claude-code/testing` to a test.
    deps: { neverBundle: [/^claude-code(\/.*)?$/] },
    // Its elements are made with `h` and `Fragment`, which the engine supplies as globals.
    inputOptions: {
      transform: { jsx: { runtime: "classic", pragma: "h", pragmaFrag: "Fragment" } },
    },
  });
if (pi)
  configs.push({
    ...common,
    name: "pi",
    platform: "node",
    entry: { "pi/index": pi },
    // pi supplies its own packages and TypeBox to an extension (`getAliases` in its extension loader),
    // so they are never bundled, whatever the package lists as peers: the kit's painter imports pi's.
    deps: {
      neverBundle: [
        /^@earendil-works\/pi-(ai|agent-core|coding-agent|tui)(\/.*)?$/,
        /^typebox(\/.*)?$/,
        ...Object.keys(pkg.peerDependencies ?? {}).map(
          (n) => new RegExp(`^${n.replace(/[/.]/g, "\\$&")}(/.*)?$`),
        ),
      ],
    },
  });
if (configs.length === 0) {
  console.error(`build: ${dir} has no src/claude.ts(x) or src/pi.ts`);
  process.exit(1);
}

if (!watch) prune();
await Promise.all(configs.map((c) => build(c)));
