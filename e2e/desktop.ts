import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { message } from "./answer/fixture.ts";
import { agentBin, checkoutMods, checkoutRoot, STUB_KEY } from "./lib/harness.ts";
import { runEnv, setupContext } from "./lib/setup.ts";
import { startStub, stopStub } from "./lib/stub.ts";

const die = (msg: string): never => {
  console.error(`claude-desktop-dev: ${msg}`);
  process.exit(1);
};

if (process.platform !== "linux") die("this launcher uses the Linux claude-desktop executable");

const fixture = process.argv[2] ?? "recommended";
const mode = process.argv[3] ?? "seed";
if (mode !== "seed" && mode !== "live") die(`unknown mode ${mode}. Choose seed or live.`);
const fixtures = readdirSync(new URL("./answer/fixtures/", import.meta.url))
  .filter((file) => file.endsWith(".md"))
  .map((file) => file.slice(0, -3));
if (!fixtures.includes(fixture))
  die(`unknown answer fixture ${fixture}. Choose ${fixtures.join(", ")}.`);

const mods = checkoutMods();
if (!mods.length) die(`no Claude Code mods under ${checkoutRoot}`);

const id = createHash("sha256").update(checkoutRoot).digest("hex").slice(0, 12);
const stateDir = join(
  process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
  "agent-tools-e2e",
  `claude-desktop-${id}`,
);
const profile = join(stateDir, "desktop");
const config = join(stateDir, "claude-config");
mkdirSync(profile, { recursive: true, mode: 0o700 });
mkdirSync(config, { recursive: true, mode: 0o700 });

const runDir = mkdtempSync(join(stateDir, "run-"));
const cwd = join(runDir, "project");
const { write } = setupContext(runDir, cwd);
const answer = message(fixture);
write("answer-fixture.md", `${answer}\n`);
write(
  ".claude/settings.json",
  JSON.stringify({ model: "haiku", env: { ...runEnv(runDir), WT_NO_AUTOCLOSE: "1" } }),
);

// Claude Code accepts plugin directories in user settings, but ignores them in project settings.
const settings = join(runDir, "settings.json");
writeFileSync(settings, JSON.stringify({ env: { CLAUDE_CODE_PLUGIN_DIRS: mods.join(":") } }));
renameSync(settings, join(config, "settings.json"));

console.log(`Desktop test profile: ${profile}`);
console.log(`Test folder: ${cwd}`);

async function seedSession(): Promise<URL> {
  const id = randomUUID();
  const title = `Answer fixture: ${fixture}`;
  const args = [
    "--bare",
    "--print",
    "--strict-mcp-config",
    "--model",
    "haiku",
    "--session-id",
    id,
    "--name",
    title,
    `Show me the ${fixture} answer fixture.`,
  ];
  const port = await startStub(runDir, [{ text: answer }], process.pid);
  try {
    const reply = execFileSync(agentBin("claude"), args, {
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
    });
    if (reply.trimEnd() !== answer)
      throw new Error("the saved Claude Code reply differed from the fixture");
  } finally {
    stopStub(runDir);
  }

  const url = new URL("claude://resume");
  url.searchParams.set("session", id);
  console.log(`Seeded ${title} (${id}). Sign in to Desktop on first use.`);
  return url;
}

function draftPrompt(): URL {
  const prompt =
    "Read answer-fixture.md and reply with its exact Markdown as your entire response. Preserve the headings, choices, and line breaks. Do not use a code fence or call AskUserQuestion.";
  const url = new URL("claude://code/new");
  url.searchParams.set("folder", cwd);
  url.searchParams.set("q", prompt);
  console.log(`Select Haiku in the Code tab and send the draft when ready.\n\n${prompt}\n`);
  return url;
}

const url =
  mode === "seed"
    ? await seedSession().catch((error: unknown) =>
        die(`could not seed the session (${String(error)})`),
      )
    : draftPrompt();

const env: NodeJS.ProcessEnv = {
  ...process.env,
  XDG_CONFIG_HOME: profile,
  CLAUDE_CONFIG_DIR: config,
};
delete env.CLAUDE_CODE_PLUGIN_DIRS;
delete env.CLAUDE_USER_DATA_DIR;
const child = spawnSync("claude-desktop", [url.href], { cwd, env, stdio: "inherit" });
if (child.error) die(`could not launch claude-desktop (${child.error.message})`);
if (child.signal) die(`claude-desktop exited on ${child.signal}`);
process.exitCode = child.status ?? 1;
