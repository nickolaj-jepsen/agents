// Keep the VS Code manifest separate: the terminal recorder runs independently.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkoutRoot } from "./lib/harness.ts";
import { loadSet } from "./lib/scenario.ts";
import {
  BUDGET,
  isVscodeFile,
  kb,
  onPath,
  pngSize,
  squeeze,
  VSCODE_MANIFEST,
  VSCODE_SIZE,
  type SiteSet,
} from "./lib/site.ts";
import {
  loadVscodeSet,
  reachVscode,
  reloadVscode,
  resolveVscode,
  vscodeFiles,
} from "./lib/vscode-scenario.ts";
import { fixedOf, stopVscode, VscodeSession } from "./lib/vscode.ts";

const mediaRoot = join(checkoutRoot, "apps", "site", "media");

type VscodeStill = {
  png: string;
  caption: string;
  harness: "claude";
  surface: "vscode";
  width: number;
  height: number;
};

/**
 * pngquant, then oxipng: a UI's flat colours and its text keep their edges in a palette at a
 * fraction of the size. 98 and 99 are a file pngquant left as it was.
 */
function optimise(files: string[]) {
  const script = [
    'pngquant --quality 85-100 --speed 1 --strip --skip-if-larger --force --ext .png -- "$@"; s=$?',
    '{ [ $s -eq 0 ] || [ $s -eq 98 ] || [ $s -eq 99 ]; } && oxipng --quiet --opt 4 --strip safe -- "$@"',
  ].join("; ");
  const args = ["-c", script, "sh", ...files];
  const run =
    onPath("pngquant") && onPath("oxipng")
      ? spawnSync("sh", args, { stdio: "inherit" })
      : spawnSync(
          "nix",
          [
            "shell",
            "--inputs-from",
            checkoutRoot,
            "nixpkgs#pngquant",
            "nixpkgs#oxipng",
            "--command",
            "sh",
            ...args,
          ],
          { stdio: "inherit" },
        );
  if (run.status !== 0) throw new Error("pngquant or oxipng failed");
}

/** The window of a run folder, photographed whole: what a failed step left on screen. */
async function failedShot(runDir: string, file: string) {
  try {
    const session = await VscodeSession.attach(runDir);
    await session.shot(file);
    session.close();
  } catch {
    /* no window to photograph */
  }
}

async function runPlugin(plugin: string, siteFile: string, vscodeFile: string) {
  const set = (await loadSet(siteFile)) as unknown as SiteSet;
  const pictures = Object.entries(set.vscode ?? {});
  if (pictures.length === 0) return;
  const scenarios = await loadVscodeSet(vscodeFile);
  const stage = mkdtempSync(join(tmpdir(), `site-vscode-${plugin}-`));
  // A window per start that its environment fixes (`fixedOf`): a picture whose scenario starts
  // like the last one's is a new tab in the same window, which takes half as long.
  let window: { runDir: string; fixed: string } | undefined;
  const close = async () => {
    if (!window) return;
    await stopVscode(window.runDir);
    if (!process.env.E2E_KEEP) rmSync(window.runDir, { recursive: true, force: true });
    window = undefined;
  };
  let name = "";
  try {
    for (const [n, pic] of pictures) {
      name = n;
      const t = Date.now();
      const r = resolveVscode(scenarios, pic.scenario);
      r.steps = [...r.steps, ...(pic.steps ?? [])];
      r.size = VSCODE_SIZE;
      const fresh = async () => {
        await close();
        // Under /tmp, as the terminal's: the folder is named nowhere a person's home shows.
        window = { runDir: mkdtempSync("/tmp/s-"), fixed: fixedOf(r.start) };
        return (await reachVscode(r, window.runDir)).session;
      };
      const png = join(stage, `vscode-${name}.png`);
      const reloaded = window?.fixed === fixedOf(r.start);
      let session = reloaded ? await reloadVscode(r, window!.runDir) : await fresh();
      try {
        await session.shot(png, { panel: true });
        // A reload's tab can leave a mod's pictures undrawn for good, their alt text in their
        // place; a window of its own draws them.
        if (reloaded && (await session.undrawn()) > 0) {
          console.error(
            `site-vscode: ${plugin}/${name}: pictures not drawn, again in a new window`,
          );
          session.close();
          session = await fresh();
          await session.shot(png, { panel: true });
        }
        const left = await session.undrawn();
        if (left > 0) throw new Error(`${left} picture(s) of the panel not drawn`);
      } finally {
        session.close();
      }
      console.error(`site-vscode: ${plugin}/${name} ${((Date.now() - t) / 1000).toFixed(0)}s`);
    }
  } catch (err) {
    if (window) await failedShot(window.runDir, join(stage, `vscode-${name}@failed.png`));
    console.error(
      `site-vscode: ${plugin}/${name} failed: ${String((err as Error).message ?? err).slice(0, 1500)}`,
    );
    console.error(
      `site-vscode: ${plugin}: kept the old pictures; the failed screen is in ${stage}`,
    );
    throw new Error(`${plugin}: ${name} failed`);
  } finally {
    await close();
  }

  const files = pictures.map(([n]) => join(stage, `vscode-${n}.png`));
  optimise(files);
  const rel = (f: string) => `apps/site/media/${plugin}/${f}`;
  const stills: VscodeStill[] = pictures.map(([n, pic]) => {
    const png = join(stage, `vscode-${n}.png`);
    squeeze(png, BUDGET.png);
    return {
      png: rel(`vscode-${n}.png`),
      caption: pic.caption,
      harness: "claude",
      surface: "vscode",
      ...pngSize(png),
    };
  });
  writeFileSync(join(stage, VSCODE_MANIFEST), `${JSON.stringify({ stills }, null, 2)}\n`);

  // The terminal's media share the folder (e2e/site.ts) and stay.
  const dest = join(mediaRoot, plugin);
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(dest)) if (isVscodeFile(f)) rmSync(join(dest, f), { force: true });
  for (const f of readdirSync(stage)) {
    copyFileSync(join(stage, f), join(dest, f));
    console.error(`site-vscode: ${rel(f)} ${kb(join(dest, f))}`);
  }
  rmSync(stage, { recursive: true, force: true });
}

const only = process.argv.slice(2);
const plugins = vscodeFiles()
  .filter((f) => only.length === 0 || only.includes(f.plugin))
  .map((f) => ({ ...f, site: join(dirname(f.file), "site.scenarios.ts") }))
  .filter((f) => existsSync(f.site));
for (const name of only)
  if (!plugins.some((p) => p.plugin === name))
    throw new Error(`no vscode.scenarios.ts in ${name}'s e2e folder`);
let bad = 0;
for (const { plugin, file, site } of plugins) {
  try {
    await runPlugin(plugin, site, file);
  } catch (err) {
    bad++;
    console.error(`site-vscode: ${plugin}: ${(err as Error).message}`);
  }
}
process.exit(bad > 0 ? 1 : 0);
