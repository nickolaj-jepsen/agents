/**
 * Claude Desktop (Linux): opens a scenario's folder or seeded session in the app and leaves the
 * rest to the person. There is no way in to read or drive it, so this is all it does.
 *
 * The test profile is per checkout and kept between runs (sign in once); the Claude config the
 * session uses is beside it. Run folders are the sessions' own (`lib/sessions.ts`).
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DesktopResolved } from "./desktop-scenario.ts";
import { agentBin, checkoutMods, checkoutRoot, STUB_KEY } from "./harness.ts";
import { stateRoot } from "./sessions.ts";
import { runEnv, setupContext } from "./setup.ts";
import { startStub, stopStub } from "./stub.ts";

export const DESKTOP_VERBS = "live and goto";

/** The Desktop launch failed or cannot be tried here. */
export function requireDesktop() {
  if (process.platform !== "linux")
    throw new Error("Claude Desktop scenarios use the Linux claude-desktop executable");
}

export type DesktopLaunch = {
  /** A prefilled draft for a real model, not the seeded session. */
  draft?: boolean;
  /** Wait for the app to exit (`live`), or leave it running (`goto`). */
  wait: boolean;
};

/**
 * Sets up `runDir` for `r` and opens Desktop on it. Returns the launcher's pid when it was left
 * running.
 */
export async function launchDesktop(
  r: DesktopResolved,
  runDir: string,
  o: DesktopLaunch,
): Promise<number | undefined> {
  requireDesktop();
  const mods = checkoutMods(r.start.plugins);
  if (!mods.length) throw new Error(`no Claude Code mods under ${checkoutRoot}`);

  const id = createHash("sha256").update(checkoutRoot).digest("hex").slice(0, 12);
  const profileRoot = join(stateRoot, `claude-desktop-${id}`);
  const profile = join(profileRoot, "desktop");
  const config = join(profileRoot, "claude-config");
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  mkdirSync(config, { recursive: true, mode: 0o700 });

  const cwd = join(runDir, "project");
  mkdirSync(cwd, { recursive: true });
  const ctx = setupContext(runDir, cwd);
  await r.setup?.(ctx);
  ctx.write(
    ".claude/settings.json",
    JSON.stringify({ model: "haiku", env: { ...runEnv(runDir), WT_NO_AUTOCLOSE: "1" } }),
  );
  // Claude Code accepts plugin directories in user settings, but ignores them in project settings.
  const settings = join(runDir, "settings.json");
  writeFileSync(settings, JSON.stringify({ env: { CLAUDE_CODE_PLUGIN_DIRS: mods.join(":") } }));
  renameSync(settings, join(config, "settings.json"));

  console.log(`Desktop test profile: ${profile}`);
  console.log(`Test folder: ${cwd}`);

  const url = o.draft ? draftUrl(r, cwd) : await seedUrl(r, runDir, cwd, config);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    XDG_CONFIG_HOME: profile,
    CLAUDE_CONFIG_DIR: config,
  };
  delete env.CLAUDE_CODE_PLUGIN_DIRS;
  delete env.CLAUDE_USER_DATA_DIR;
  if (!o.wait) {
    const child = spawn("claude-desktop", [url.href], {
      cwd,
      env,
      stdio: "ignore",
      detached: true,
    });
    const failed = await new Promise<Error | undefined>((resolve) => {
      child.once("error", resolve);
      setTimeout(resolve, 1500, undefined);
    });
    if (failed) throw new Error(`could not launch claude-desktop (${failed.message})`);
    child.unref();
    return child.pid;
  }
  const child = spawnSync("claude-desktop", [url.href], { cwd, env, stdio: "inherit" });
  if (child.error) throw new Error(`could not launch claude-desktop (${child.error.message})`);
  if (child.signal) throw new Error(`claude-desktop exited on ${child.signal}`);
  if (child.status) throw new Error(`claude-desktop exited with ${child.status}`);
  return undefined;
}

/** A session Claude Code has already had, replayed through the stub: Desktop resumes it. */
async function seedUrl(r: DesktopResolved, runDir: string, cwd: string, config: string) {
  const turns = r.start.turns;
  if (!turns?.length)
    throw new Error(
      `${r.plugin}/desktop/${r.name} has no turns to seed a session from; try --draft`,
    );
  const id = randomUUID();
  const title = `${r.plugin}: ${r.name}`;
  const port = await startStub(runDir, turns, process.pid);
  try {
    execFileSync(
      agentBin("claude"),
      [
        "--bare",
        "--print",
        "--strict-mcp-config",
        "--model",
        "haiku",
        "--session-id",
        id,
        "--name",
        title,
        r.prompt,
      ],
      {
        cwd,
        env: {
          PATH: process.env.PATH,
          CLAUDE_CONFIG_DIR: config,
          ANTHROPIC_API_KEY: STUB_KEY,
          ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
          ...runEnv(runDir),
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      },
    );
  } catch (err) {
    throw new Error(`could not seed the session (${String(err)})`, { cause: err });
  } finally {
    stopStub(runDir);
  }
  const url = new URL("claude://resume");
  url.searchParams.set("session", id);
  console.log(`Seeded ${title} (${id}). Sign in to Desktop on first use.`);
  return url;
}

function draftUrl(r: DesktopResolved, cwd: string) {
  if (!r.draft) throw new Error(`${r.plugin}/desktop/${r.name} has no draft prompt`);
  const url = new URL("claude://code/new");
  url.searchParams.set("folder", cwd);
  url.searchParams.set("q", r.draft);
  console.log(`Select Haiku in the Code tab and send the draft when ready.\n\n${r.draft}\n`);
  return url;
}
