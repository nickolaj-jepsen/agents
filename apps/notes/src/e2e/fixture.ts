/**
 * Checkouts and stores for notes' scenarios. Every store is in the run's own folder (`ENV` sets
 * `XDG_DATA_HOME` there), named by a fixed `agents-store-id` so a fixture can fill it before the
 * session links the checkout; Claude Code's memory is in the run's own configuration folder. An
 * Open must reach only stand-ins that write a line to `launched.log` beside the run's `bin`:
 * nothing a scenario does opens a real editor or browser.
 */
import { mkdirSync, readFileSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { SetupContext } from "@agents/drive/lib/session.ts";
import type { StartOptions } from "@agents/drive/lib/harness.ts";

/** The store's name, written where the plugin reads it: every scenario's store is this one. */
export const STORE_ID = "shop-api-1a2b3c4d";

/** What every scenario starts with: the stores under the run, not under the person's home. */
export const ENV = { XDG_DATA_HOME: "{run}/data" };

const HOUR = 3_600_000;

/** The store a run's checkout links to. */
export const storeOf = (ctx: SetupContext) => join(ctx.runDir, "data", "agents", "store", STORE_ID);

/**
 * Claude Code's memory of the checkout in a hermetic run: the folder named after the main
 * checkout under the run's configuration folder.
 */
export const memoryOf = (ctx: SetupContext) =>
  join(
    ctx.runDir,
    "claude-config",
    "projects",
    realpathSync(ctx.cwd).replace(/[^A-Za-z0-9]/g, "-"),
    "memory",
  );

/** Writes `text` to `file`, last written `hours` ago: in the middle of an age, so it stays one. */
function put(file: string, text: string, hours: number) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  const at = new Date(Date.now() - hours * HOUR);
  utimesSync(file, at, at);
}

/** A git checkout named to the fixed store, which is there and empty. */
export function checkout(ctx: SetupContext) {
  ctx.write("README.md", "# shop-api\n");
  ctx.initRepo();
  ctx.write(".git/agents-store-id", `${STORE_ID}\n`);
  mkdirSync(storeOf(ctx), { recursive: true });
}

const PLAN = `# Honour Retry-After in the sync worker

The worker retries a 429 at once, three times, and the API locks the key for a minute.

## Steps

1. Read \`Retry-After\` from the response, seconds or a date.
2. Sleep that long before the next attempt, capped at five minutes.
3. Count the wait against the job's deadline, not the attempt's.

## Open questions

- Does the bulk endpoint send the header too?
- Should a wait past the deadline fail the job or park it?
`;

/** Several folders with notes and artefacts, a folder of artefacts alone, and one loose note. */
export function withNotes(ctx: SetupContext) {
  checkout(ctx);
  const store = storeOf(ctx);
  put(join(store, "plans/retry-after.md"), PLAN, 1.5);
  put(join(store, "plans/hub/PLAN.md"), "# Hub\n\nMove the hub's queue to the worker.\n", 30);
  put(join(store, "plans/hub/history/PLAN-1.md"), "# Hub, first draft\n", 60);
  put(join(store, "plans/hub/diagram.png"), "png", 30);
  put(join(store, "reports/sync-latency.html"), "<h1>Sync latency</h1>\n", 3.5);
  put(join(store, "findings/rate-limits.md"), "# Rate limits\n\n120 a minute per key.\n", 5.5);
  put(join(store, "screens/orders@70x24.png"), "png", 2.5);
  put(join(store, "screens/orders@160x45.png"), "png", 2.5);
  put(join(store, "TODO.md"), "- [ ] Ask about the bulk endpoint\n", 60);
}

/** `withNotes`, and Claude Code's memory of the project. */
export function withMemory(ctx: SetupContext) {
  withNotes(ctx);
  const memory = memoryOf(ctx);
  put(join(memory, "MEMORY.md"), "- [Shell guard](shell-guard.md): compound git commands\n", 9.5);
  put(join(memory, "shell-guard.md"), "Compound commands naming git are refused.\n", 26);
}

/** A long Markdown note, the only one, for the reader. */
export function withLongNote(ctx: SetupContext) {
  checkout(ctx);
  const sections = Array.from(
    { length: 12 },
    (_, i) =>
      `## Step ${i + 1}\n\nThe worker reads the header, waits, and tries again; step ${i + 1} of the plan covers one more case of the API's answers, so the paragraph runs over a line or two.\n\n- One case.\n- Another case.`,
  ).join("\n\n");
  put(join(storeOf(ctx), "plans/retry-after.md"), `${PLAN}\n${sections}\n`, 1.5);
}

/** A note larger than the reader takes, beside a small one. */
export function withLargeNote(ctx: SetupContext) {
  checkout(ctx);
  put(
    join(storeOf(ctx), "logs/sync-run.md"),
    `# Sync run\n\n${"A line of the log.\n".repeat(20_000)}`,
    1.5,
  );
  put(join(storeOf(ctx), "logs/summary.md"), "# Summary\n", 3.5);
}

/** `.agents/store` committed to the repository: the plugin leaves it alone and says so. */
export function tracked(ctx: SetupContext) {
  ctx.write("README.md", "# shop-api\n");
  ctx.write(".agents/store/plans/kept.md", "# Kept in git\n");
  ctx.initRepo();
  ctx.git("add", ".agents/store/plans/kept.md");
  ctx.git("commit", "-q", "-m", "keep a note in git");
  const at = new Date(Date.now() - 1.5 * HOUR);
  utimesSync(join(ctx.cwd, ".agents/store/plans/kept.md"), at, at);
}

/** A folder in no repository. */
export function outside(ctx: SetupContext) {
  ctx.write("README.md", "# scratch\n");
}

const LONG = "a-very-long-folder-name-for-the-quarterly-planning-documents";

/** More notes than any screen holds: long paths, wide characters, many folders. */
export function extreme(ctx: SetupContext) {
  checkout(ctx);
  const store = storeOf(ctx);
  put(
    join(store, `plans/${LONG}/and/several/nested/levels/the-plan-with-the-longest-name-yet.md`),
    "# Long\n",
    1.5,
  );
  put(
    join(store, "調査/日本語のファイル名がとても長いノート.md"),
    "# 日本語\n\n全角文字の本文。\n",
    2.5,
  );
  put(join(store, "調査/図.png"), "png", 2.5);
  for (let i = 0; i < 24; i++)
    put(
      join(store, `findings/finding-${String(i + 1).padStart(2, "0")}.md`),
      `# Finding ${i + 1}\n`,
      4.5 + i * 24,
    );
  put(
    join(store, "reports/sync-latency-under-load-for-the-eu-region.html"),
    "<h1>Load</h1>\n",
    3.5,
  );
  for (let i = 0; i < 40; i++) put(join(store, `screens/shot-${i}.png`), "png", 2.5);
}

/** The stand-ins a session finds first: each writes its name and arguments to `launched.log`. */
const log = (name: string) =>
  `#!/bin/sh\necho "${name} $*" >> "$(dirname "$0")/../launched.log"\nexit 0\n`;

/** A machine with VS Code and a browser, and no Zed: an Open lands in a stand-in. */
export const APPS: Pick<StartOptions, "bin" | "hide"> = {
  bin: { code: log("code"), "xdg-open": log("xdg-open") },
  hide: ["zed", "zeditor"],
};

/** What the stand-ins were started with, once they were: waits a few seconds for the first line. */
export async function launched(runDir: string, pattern: RegExp): Promise<void> {
  const file = join(runDir, "launched.log");
  for (let i = 0; i < 50; i++) {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      // Not started yet.
    }
    if (pattern.test(text)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`nothing matching ${pattern} in ${file}`);
}

/** The note the turn writes: what the band then names. */
export const WRITTEN = {
  path: ".agents/store/plans/backoff.md",
  text: `${PLAN.replace("Honour Retry-After", "Back off")}`,
};

/**
 * A checkout whose store has a note stamped a few minutes ahead: the walk after the next turn
 * counts it as written during the session, as if the turn had written it.
 */
export function writtenDuringTurn(ctx: SetupContext) {
  checkout(ctx);
  put(join(storeOf(ctx), "plans/backoff.md"), WRITTEN.text, -0.1);
}
