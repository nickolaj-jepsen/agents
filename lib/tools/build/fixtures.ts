// Temporary repositories for the release specs: a checkout with plugins and skills in it, and a
// bare remote to publish to. Nothing of the person's git reaches a fixture: no config, hooks or
// signing.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { firstChangelog } from "./changelog.ts";

// Set for the whole spec process, so the code under test and a spawned CLI run git the same way. A
// repository's own `core.hooksPath` is not enough: a hook named in a person's config (`hook.<name>.
// command`) runs whatever that path says, and one on `post-checkout` would run in every fixture.
process.env.GIT_CONFIG_GLOBAL = "/dev/null";
process.env.GIT_CONFIG_SYSTEM = "/dev/null";
process.env.GIT_CONFIG_NOSYSTEM = "1";

const made: string[] = [];

/** Removes every repository the spec made; call from `afterEach`. */
export function cleanup(): void {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
}

const CONFIG = [
  ["user.email", "release@example.invalid"],
  ["user.name", "Release Spec"],
  ["commit.gpgsign", "false"],
  ["tag.gpgsign", "false"],
  ["core.hooksPath", "/dev/null"],
  ["core.excludesFile", "/dev/null"],
] as const;

/** An empty repository on `main`. */
export function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "release-spec-"));
  made.push(root);
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  for (const [key, value] of CONFIG) execFileSync("git", ["-C", root, "config", key, value]);
  return root;
}

/** An empty bare repository: the remote a publish pushes to. */
export function bare(): string {
  const root = mkdtempSync(join(tmpdir(), "release-remote-"));
  made.push(root);
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", root]);
  return root;
}

/** A folder outside any repository, such as the one holding the plugins' builds. */
export function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), "release-built-"));
  made.push(dir);
  return dir;
}

export function write(root: string, file: string, text: string): void {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
}

export function commit(root: string, message: string): string {
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "commit", "-q", "-m", message]);
  return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

/** A plugin's package.json at a version, with a changelog whose newest section is that version. */
export function plugin(
  root: string,
  name: string,
  version: string,
  extra: Record<string, unknown> = {},
): void {
  write(
    root,
    `apps/${name}/package.json`,
    JSON.stringify(
      {
        name: `@nickolaj-jepsen/${name}`,
        version,
        claude: { name, description: "A test plugin" },
        pi: { extensions: ["./src/pi.ts"] },
        ...extra,
      },
      null,
      2,
    ) + "\n",
  );
  write(root, `apps/${name}/CHANGELOG.md`, firstChangelog(version, "2026-11-01", ["First."]));
}

/** A skill's SKILL.md at a version, with its changelog. Returns the SKILL.md text. */
export function skill(root: string, name: string, version: string): string {
  const text = `---
name: ${name}
description: A test skill.
metadata:
  version: ${version}
  summary: "a test skill"
  category: utilities
---

Do the thing.
`;
  write(root, `skills/${name}/SKILL.md`, text);
  write(root, `skills/${name}/CHANGELOG.md`, firstChangelog(version, "2026-11-01", ["First."]));
  return text;
}

/** A bundle that names its skills. */
export function bundle(root: string, name: string, skills: string[]): void {
  write(
    root,
    `bundles/${name}/README.md`,
    `---\ntitle: ${name}\ntagline: "The ${name} bundle."\nskills: [${skills.join(", ")}]\n---\n\nWhat it is for.\n`,
  );
}

/** Adds a line under a unit's `[Unreleased]` section. */
export function note(root: string, file: string, text: string, line: string): void {
  write(root, file, text.replace("## [Unreleased]\n", `## [Unreleased]\n\n- ${line}\n`));
}
