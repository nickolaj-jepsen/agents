/**
 * What one profile loads, from the same fixture shapes the CLI publishes. No real profile is
 * touched: every path is under a temporary directory.
 */
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import type { Environment } from "./core/paths.ts";
import { UpdatesError } from "./core/errors.ts";
import { parseBaseline } from "./core/protocol.ts";
import { flockHelperForTests } from "./test/flock.ts";
import { type RefreshConsole, rewrite, run, syncPiSkills, syncSkills } from "./refresh.ts";

const quiet: RefreshConsole = { say: () => undefined, out: () => undefined };

const scratch: string[] = [];
const scratchDir = (): string => {
  const directory = fs.mkdtempSync(join(os.tmpdir(), "agents-refresh-test-"));
  scratch.push(directory);
  return directory;
};
afterEach(() => {
  for (const directory of scratch.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const MANIFEST = ".agents-updates.json";

type Plugins = Record<string, { pi: string | null; claude: string | null }>;

class RefreshFixture {
  readonly root: string;
  readonly profile: string;
  readonly baseline: Record<string, unknown>;
  readonly basefile: string;
  readonly settings: string;
  readonly env: Environment;

  constructor() {
    this.root = scratchDir();
    this.profile = join(this.root, "profile");
    fs.mkdirSync(this.profile);
    this.baseline = {
      revision: "pin",
      plugins: {
        exa: { pi: "/nix/store/exa-pin", claude: null },
        answer: { pi: "/nix/store/answer-pin", claude: "/nix/store/answer-claude" },
      },
      skills: {},
    };
    this.basefile = join(this.root, "baseline.json");
    fs.writeFileSync(this.basefile, JSON.stringify(this.baseline));
    this.settings = join(this.profile, "settings.json");
    fs.writeFileSync(
      this.settings,
      JSON.stringify({
        packages: ["user-package", "/nix/store/exa-pin", "/nix/store/answer-pin", "core"],
        piAgents: { twinExtensions: ["/nix/store/exa-pin"], maxWorkingAgents: 6 },
        model: "keep-me",
      }),
    );
    this.env = {
      AGENTS_HARNESS: "pi",
      AGENTS_PROFILE: this.profile,
      AGENTS_BASELINE: this.basefile,
      HOME: join(this.root, "home"),
      AGENTS_FLOCK: flockHelperForTests(),
    };
  }

  async runRefresh(plugins: Plugins): Promise<Record<string, any>> {
    const code = await run(this.env, {
      resolve: () => ({ plugins, skills: {}, ui: {} }),
      console: quiet,
    });
    assert.equal(code, 0);
    return JSON.parse(fs.readFileSync(this.settings, "utf8"));
  }
}

const set = (): RefreshFixture => new RefreshFixture();

test("refresh preserves unmanaged prototype-like package and twin entries", async () => {
  const f = set();
  const entries = ["constructor", "toString", "hasOwnProperty", "__proto__"];
  fs.writeFileSync(
    f.settings,
    JSON.stringify({
      packages: entries,
      piAgents: { twinExtensions: entries },
    }),
  );
  const result = await f.runRefresh(f.baseline.plugins as Plugins);
  for (const entry of entries) assert.ok(result.packages.includes(entry), entry);
  assert.deepEqual(result.piAgents.twinExtensions, entries);
});

test("a removed managed plugin cannot fall back to inherited paths", () => {
  assert.deepEqual(
    rewrite(["/nix/store/old"], { "/nix/store/old": "constructor" }, {}, {}, "packages"),
    { entries: [], wrote: {} },
  );
});

test("stale prototype-like skill names are removed, but desired ones remain", () => {
  const f = set();
  const names = ["constructor", "toString", "hasOwnProperty"];
  const directory = join(f.profile, "skills");
  fs.mkdirSync(directory);
  for (const name of names) fs.symlinkSync(`/nix/store/old-${name}`, join(directory, name));
  const desired = { constructor: "/nix/store/new-constructor" };
  syncSkills(f.profile, desired, new Set(names), ["/nix/store/"], { say: quiet.say });
  assert.deepEqual(fs.readdirSync(directory), ["constructor"]);
  assert.equal(fs.readlinkSync(join(directory, "constructor")), desired.constructor);
});

test("only existing twins are updated", async () => {
  const f = set();
  const plugins: Plugins = {
    ...(f.baseline.plugins as Plugins),
    "brand-new": { pi: "/nix/store/new", claude: null },
    exa: { pi: "/nix/store/exa-new", claude: null },
  };
  const result = await f.runRefresh(plugins);
  assert.deepEqual(result.piAgents.twinExtensions, ["/nix/store/exa-new"]);
  assert.equal(result.piAgents.maxWorkingAgents, 6);
  assert.equal(result.model, "keep-me");
  assert.ok(result.packages.includes("user-package"));
  assert.ok(result.packages.includes("core"));
  assert.ok(result.packages.includes("/nix/store/new"));
});

test("a reset replaces the previous override instead of keeping a duplicate", async () => {
  const f = set();
  const plugins: Plugins = { ...(f.baseline.plugins as Plugins) };
  plugins.exa = { pi: "/nix/store/exa-local", claude: null };
  await f.runRefresh(plugins);
  const manifest = JSON.parse(fs.readFileSync(join(f.profile, MANIFEST), "utf8"));
  assert.equal(manifest.packages.exa, "/nix/store/exa-local");
  const result = await f.runRefresh(f.baseline.plugins as Plugins);
  assert.equal(result.packages.includes("/nix/store/exa-local"), false);
  assert.equal(result.packages.filter((entry: string) => entry === "/nix/store/exa-pin").length, 1);
  assert.deepEqual(result.piAgents.twinExtensions, ["/nix/store/exa-pin"]);
});

test("a claude refresh preserves native synced data and user skills", () => {
  const f = set();
  const skills = join(f.profile, "skills");
  const synced = join(skills, "synced");
  fs.mkdirSync(synced, { recursive: true });
  fs.writeFileSync(join(synced, "bucket"), "native state");
  const custom = join(skills, "custom");
  fs.mkdirSync(custom);
  fs.writeFileSync(join(custom, "SKILL.md"), "user content");
  const managed = join(skills, "demo");
  fs.mkdirSync(managed);
  fs.symlinkSync("/nix/store/old/SKILL.md", join(managed, "SKILL.md"));

  syncSkills(f.profile, { demo: "/nix/store/new-demo" }, new Set(), ["/nix/store/"], {
    say: quiet.say,
  });
  assert.equal(fs.readFileSync(join(synced, "bucket"), "utf8"), "native state");
  assert.equal(fs.readFileSync(join(custom, "SKILL.md"), "utf8"), "user content");
  assert.equal(fs.readlinkSync(managed), "/nix/store/new-demo");
  assert.ok((fs.statSync(skills).mode & 0o200) !== 0, "the native skill directory stays writable");
});

test("a failed claude refresh keeps the journal for a later reset", async () => {
  const f = set();
  const env = { ...f.env, AGENTS_HARNESS: "claude" };
  const desired = { plugins: {}, skills: { a: "/nix/store/a", b: "/nix/store/b" }, ui: {} };
  await assert.rejects(
    run(env, {
      resolve: () => desired,
      console: quiet,
      link: (target, path) => {
        if (path.endsWith("/b")) throw new Error("simulated failure");
        fs.symlinkSync(target, path);
      },
    }),
    UpdatesError,
  );
  assert.ok(fs.lstatSync(join(f.profile, "skills", "a")).isSymbolicLink());
  await run(env, { resolve: () => ({ plugins: {}, skills: {}, ui: {} }), console: quiet });
  assert.equal(fs.existsSync(join(f.profile, "skills", "a")), false);
});

test("pi skill refresh uses immutable paths and preserves user entries", () => {
  const settings: Record<string, unknown> = { skills: ["/user/skill", "!project-ignore/**"] };
  const manifest: Record<string, unknown> = {};
  const baseline = parseBaseline(
    { revision: "pin", plugins: {}, skills: { demo: "/nix/store/pinned-demo" } },
    "baseline",
  );
  syncPiSkills(settings, { demo: "/nix/store/local-demo" }, baseline, manifest, "/home/test");
  assert.ok((settings.skills as string[]).includes("/nix/store/local-demo"));
  assert.ok((settings.skills as string[]).includes("-/home/test/.agents/skills/demo"));
  syncPiSkills(settings, { demo: "/nix/store/pinned-demo" }, baseline, manifest, "/home/test");
  assert.equal((settings.skills as string[]).includes("/nix/store/local-demo"), false);
  assert.ok((settings.skills as string[]).includes("/user/skill"));
  assert.ok((settings.skills as string[]).includes("!project-ignore/**"));
});

test("a local-only plugin disappears on reset", async () => {
  const f = set();
  const plugins: Plugins = {
    ...(f.baseline.plugins as Plugins),
    "brand-new": { pi: "/nix/store/new", claude: null },
  };
  await f.runRefresh(plugins);
  const result = await f.runRefresh(f.baseline.plugins as Plugins);
  assert.equal(result.packages.includes("/nix/store/new"), false);
});
