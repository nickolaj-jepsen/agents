/**
 * `drive compare <package> --base <path>`: every VS Code scenario of a package, photographed in
 * this checkout and in another, wide and narrow, and laid side by side in an `index.html`.
 * Each side is this checkout's driver playing that checkout's scenarios and builds
 * (`AGENTS_DRIVE_ROOT`), so both are photographed the same way, at the same scale, under a private
 * session name of their own.
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { e2ePackage, repoRoot } from "./packages.ts";

const DRIVE = join(import.meta.dirname, "..", "drive.ts");
export const WIDE: [number, number] = [1280, 720];
export const NARROW: [number, number] = [420, 800];

type Side = {
  label: "base" | "this";
  root: string;
  branch: string;
  sha: string;
  session: string;
  scenarios: string[];
};

type Outcome = { wide?: string; narrow?: string; failed?: string };

const git = (root: string, ...args: string[]) =>
  execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();

function describe(root: string) {
  let branch = "";
  try {
    branch = git(root, "symbolic-ref", "--short", "-q", "HEAD");
  } catch {
    branch = "detached";
  }
  return { branch, sha: git(root, "rev-parse", "--short", "HEAD") };
}

/** Where a package's build is in `root`, as `distOf` says for this checkout. */
const distIn = (root: string, pkg: string) =>
  pkg.startsWith("kit-")
    ? join(root, "lib", "kits", pkg.slice(4), "dist")
    : join(root, "apps", pkg, "dist");

type Run = { code: number; out: string };

/** This checkout's driver, working on `root`'s scenarios; its output is returned, not shown. */
function drive(root: string, args: string[]): Promise<Run> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [DRIVE, ...args], {
      cwd: root,
      env: { ...process.env, AGENTS_DRIVE_ROOT: root },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d));
    child.stderr.on("data", (d: Buffer) => (out += d));
    child.on("error", (e) => done({ code: 1, out: String(e) }));
    child.on("close", (code) => done({ code: code ?? 1, out }));
  });
}

async function scenariosOf(root: string, pkg: string): Promise<string[]> {
  const r = await drive(root, ["ls", pkg, "--harness", "vscode"]);
  if (r.code !== 0) throw new Error(`drive ls ${pkg} failed in ${root}:\n${r.out}`);
  return r.out
    .split("\n")
    .map((l) => /^\S+ (\S+)\s+\[vscode\]/.exec(l)?.[1])
    .filter((n): n is string => !!n);
}

const slug = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, "_");

async function photograph(
  side: Side,
  pkg: string,
  scale: number,
  out: string,
  log: (line: string) => void,
): Promise<Map<string, Outcome>> {
  const results = new Map<string, Outcome>();
  const run = (args: string[]) => drive(side.root, ["--session", side.session, ...args]);
  for (const sc of side.scenarios) {
    const base = join(out, `${slug(sc)}--${side.label}`);
    let text = "";
    const step = async (args: string[]) => {
      const r = await run(args);
      text += `$ drive ${args.join(" ")}\n${r.out}\n`;
      return r.code === 0;
    };
    log(`${side.label}: ${pkg} ${sc}`);
    const o: Outcome = {};
    try {
      const shot = (file: string) => ["shot", file, "--scale", String(scale)];
      if (!(await step(["goto", pkg, sc, "--harness", "vscode"]))) o.failed = "did not park";
      else if (!(await step(shot(`${base}--wide.png`)))) o.failed = "wide shot failed";
      else {
        o.wide = `${slug(sc)}--${side.label}--wide.png`;
        if (!(await step(["resize", String(NARROW[0]), String(NARROW[1])])))
          o.failed = "resize failed";
        else if (!(await step(shot(`${base}--narrow.png`)))) o.failed = "narrow shot failed";
        else o.narrow = `${slug(sc)}--${side.label}--narrow.png`;
      }
    } finally {
      await step(["stop"]);
    }
    if (o.failed) {
      log(`${side.label}: ${sc}: ${o.failed}`);
      const file = `${slug(sc)}--${side.label}.log`;
      writeFileSync(join(out, file), text);
      o.failed = `${o.failed}; log: ${file}`;
    }
    results.set(sc, o);
  }
  return results;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(
  pkg: string,
  scale: number,
  base: Side,
  mine: Side,
  res: Record<string, Map<string, Outcome>>,
) {
  const names = [...new Set([...base.scenarios, ...mine.scenarios])].sort();
  const head = (s: Side) =>
    `<b>${esc(s.label === "base" ? "base" : "this")}</b> ${esc(s.branch)} @ ${esc(s.sha)}`;
  const cell = (s: Side, sc: string, kind: "wide" | "narrow") => {
    if (!s.scenarios.includes(sc)) return `<div class="only">not in ${esc(s.label)}</div>`;
    const o = res[s.label]!.get(sc)!;
    const f = o[kind];
    if (f) return `<a href="${esc(f)}"><img src="${esc(f)}" loading="lazy"></a>`;
    return `<div class="fail">${esc(o.failed ?? "no picture")}</div>`;
  };
  const sections = names
    .map((sc) => {
      const both = base.scenarios.includes(sc) && mine.scenarios.includes(sc);
      const note = both
        ? ""
        : ` <span class="tag">only in ${base.scenarios.includes(sc) ? "base" : "this"}</span>`;
      const row = (kind: "wide" | "narrow") =>
        `<div class="pair ${kind}"><figure>${cell(base, sc, kind)}<figcaption>${head(base)}</figcaption></figure>` +
        `<figure>${cell(mine, sc, kind)}<figcaption>${head(mine)}</figcaption></figure></div>`;
      return `<section id="${esc(slug(sc))}"><h2>${esc(sc)}${note}</h2>${row("wide")}${row("narrow")}</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(pkg)} compared</title>
<style>
:root{color-scheme:light dark;font:14px system-ui,sans-serif}
body{margin:16px auto;max-width:1400px;padding:0 16px}
.pair{display:flex;gap:16px;align-items:flex-start;margin:8px 0}
.pair figure{margin:0;flex:1 1 0;min-width:0}.pair.narrow figure{flex:0 1 420px}
img{max-width:100%;height:auto;border:1px solid #8886;display:block}
figcaption{font-size:12px;opacity:.8;margin-top:4px}
.fail,.only{padding:16px;border:1px dashed #8888}.fail{color:#c33}
.tag{font-size:12px;border:1px solid #8886;border-radius:4px;padding:0 6px;font-weight:400}
</style></head><body>
<h1>${esc(pkg)}: VS Code, base against this checkout</h1>
<p>${head(base)} &middot; ${head(mine)} &middot; wide ${WIDE.join("x")}, narrow ${NARROW.join("x")} CSS px, at scale ${scale}</p>
<nav>${names.map((n) => `<a href="#${esc(slug(n))}">${esc(n)}</a>`).join(" &middot; ")}</nav>
${sections}
</body></html>
`;
}

export async function compare(
  pkg: string,
  o: { base: string; out?: string; scale: number },
): Promise<string> {
  if (!e2ePackage(pkg)) throw new Error(`no package ${pkg}; \`drive ls\` lists them`);
  const baseRoot = resolve(o.base);
  if (!existsSync(join(baseRoot, "package.json")))
    throw new Error(`--base ${baseRoot} is not a checkout of this repository`);
  if (baseRoot === repoRoot) throw new Error("--base is this checkout; give another one");
  const dist = (root: string) => distIn(root, pkg);
  for (const [what, root] of [
    ["this checkout", repoRoot],
    ["--base", baseRoot],
  ] as const)
    if (!existsSync(dist(root)))
      throw new Error(
        `${what} has no build of ${pkg} (${dist(root)} is missing). Build it: ` +
          `cd ${root} && pnpm install && pnpm turbo run build --filter=${pkg.startsWith("kit-") ? `./lib/kits/${pkg.slice(4)}` : `./apps/${pkg}`}`,
      );
  const out = o.out ? resolve(o.out) : mkdtempSync(join(tmpdir(), `drive-compare-${pkg}-`));
  mkdirSync(out, { recursive: true });

  const id = String(process.pid % 10000);
  const sides: Side[] = (
    [
      ["base", baseRoot],
      ["this", repoRoot],
    ] as const
  ).map(([label, root]) => ({
    label,
    root,
    ...describe(root),
    session: `cmp-${label}-${id}`,
    scenarios: [],
  }));
  const [base, mine] = sides as [Side, Side];
  await Promise.all(
    sides.map(async (s) => {
      s.scenarios = await scenariosOf(s.root, pkg);
    }),
  );
  if (base.scenarios.length + mine.scenarios.length === 0)
    throw new Error(`${pkg} has no VS Code scenarios`);

  const log = (line: string) => console.error(line);
  const stopped = () =>
    Promise.all(sides.map((s) => drive(s.root, ["--session", s.session, "stop"])));
  const onSignal = () => void stopped().finally(() => process.exit(130));
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  const [rb, rm] = await Promise.all(sides.map((s) => photograph(s, pkg, o.scale, out, log)));
  await stopped();
  const index = join(out, "index.html");
  writeFileSync(index, page(pkg, o.scale, base, mine, { base: rb!, this: rm! }));
  const failed = [...rb!.values(), ...rm!.values()].filter((r) => r.failed).length;
  if (failed) console.error(`${failed} picture set(s) failed; see the *.log files in ${out}`);
  return index;
}
