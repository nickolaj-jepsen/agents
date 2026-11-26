// The libc a native binding is loaded from. `pnpm install` picks the one the running Node is linked
// against, and the loaders napi-rs generates for `rolldown`, `satteri` and `@astrojs/compiler-binding`
// read `/usr/bin/ldd`, which describes the rootfs instead. A docs VM has an Alpine rootfs, whose ldd
// is musl's, and Nix's glibc Node: the install took the gnu builds and each loader asked for the musl
// ones, which nothing installed. `patches/<name>@<version>.patch` makes the process's own report
// answer first; this holds the set in place, and a patched loader must really load under that ldd.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parse, parseAllDocuments } from "yaml";
import { repoRoot } from "./content.ts";

/** The file each patched package's loader is, past its store dir. */
const LOADERS: Record<string, string> = {
  rolldown: "dist/index.mjs",
  satteri: "index.js",
  "@astrojs/compiler-binding": "index.js",
};

const text = (file: string): string => readFileSync(join(repoRoot, file), "utf8");
const patched = ((
  parse(text("pnpm-workspace.yaml")) as { patchedDependencies?: Record<string, string> }
).patchedDependencies ?? {}) as Record<string, string>;

// pnpm 12 writes the lockfile as two documents: the pnpm the project pins, then the graph, and
// either could hold a dependency.
const documents = parseAllDocuments(text("pnpm-lock.yaml")).map(
  (document) =>
    (document.toJS() ?? {}) as {
      patchedDependencies?: Record<string, string>;
      snapshots?: Record<string, unknown>;
    },
);
const snapshots = documents.flatMap((document) => Object.keys(document.snapshots ?? {}));
/** The hash of each patch, as the lockfile records it and as the name of the store dir pnpm installs into. */
const hashes = Object.assign(
  {},
  ...documents.map((document) => document.patchedDependencies ?? {}),
) as Record<string, string>;

/** A `name@version` patched-dependency key, split at the last `@` so a scope stays in the name. */
const split = (key: string): { name: string; version: string } => ({
  name: key.slice(0, key.lastIndexOf("@")),
  version: key.slice(key.lastIndexOf("@") + 1),
});

/** Every version of `name` the lockfile installs, from its snapshot keys: `rolldown@1.3.3` or `rolldown@1.3.3(patch_hash=…)`. */
const installed = (name: string): string[] => [
  ...new Set(
    snapshots.flatMap((key) => {
      const version = new RegExp(
        `^${name.replace(/[/.]/g, "\\$&")}@(\\d+\\.\\d+\\.\\d+)(?:\\(|$)`,
      ).exec(key)?.[1];
      return version ? [version] : [];
    }),
  ),
];

/** Where pnpm installs a patched copy: a scoped name becomes one `@scope+name` folder. */
const storeDir = (key: string) => {
  const { name, version } = split(key);
  return join(
    repoRoot,
    "node_modules",
    ".pnpm",
    `${name.replace("/", "+")}@${version}_patch_hash=${hashes[key]}`,
  );
};

/** Whether this Node is the glibc one: the answer the patches decide with, and the one the fixture asks about. */
const glibc = Boolean(
  (process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined)?.header
    ?.glibcVersionRuntime,
);

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** A directory holding what the probe reads: a fake Alpine `/usr/bin/ldd`, a module to bundle, and the runner. */
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "agents-libc-"));
  dirs.push(dir);
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src", "entry.js"), "export const x = 1;\n");
  // A preload, so the patched `readFileSync` is in place before the loader's own module reads it.
  writeFileSync(
    join(dir, "ldd.cjs"),
    `const fs = require("node:fs");
const real = fs.readFileSync;
fs.readFileSync = function (path, ...rest) {
  if (path === "/usr/bin/ldd") return "musl libc (x86_64)\\nVersion 1.2.5\\n";
  return real.call(this, path, ...rest);
};
`,
  );
  // The loaders load their binding as the module is evaluated; `rolldown` does it at its first call.
  writeFileSync(
    join(dir, "probe.mjs"),
    `import { readFileSync } from "node:fs";
if (!readFileSync("/usr/bin/ldd", "utf8").includes("musl")) throw new Error("the fixture ldd is not in place");
const loader = await import(process.argv[2]);
if (typeof loader.rolldown === "function") {
  const bundle = await loader.rolldown({ input: process.argv[3] });
  const { output } = await bundle.generate({ format: "esm" });
  await bundle.close();
  if (!output[0].code.includes("const x = 1;")) throw new Error("the bundle says nothing");
}
console.log("loaded");
`,
  );
  return dir;
}

describe("the native bindings' libc", () => {
  it("patches every version of a patched package the lockfile installs", () => {
    expect(Object.keys(patched).length).toBeGreaterThan(0);
    for (const key of Object.keys(patched)) {
      const { name } = split(key);
      const file = join(repoRoot, patched[key]!);
      expect(existsSync(file), `${patched[key]}: run pnpm install`).toBe(true);
      expect(
        LOADERS[name],
        `${name} is patched, and the spec does not say where its loader is`,
      ).toBeTruthy();
      // A bump to a version without its own patch would be caught by the install, and not by what it
      // leaves behind: say it here, where the answer is how to make the patch.
      for (const version of installed(name)) {
        expect(
          patched[`${name}@${version}`],
          `${name}@${version} has no patchedDependencies entry: write patches/${name.replace("/", "__")}@${version}.patch, whose loader decides libc from the process's report`,
        ).toBeTruthy();
      }
    }
  });

  // A musl Node answers `musl` from either source, so the question these patches answer is the glibc
  // process's, and the fixture that asks it is only meaningful under one.
  it.skipIf(!glibc)("loads what a glibc Node installed, though /usr/bin/ldd says musl", () => {
    const dir = fixture();
    for (const key of Object.keys(patched)) {
      const { name } = split(key);
      const loader = join(storeDir(key), "node_modules", name, LOADERS[name]!);
      expect(existsSync(loader), `${loader}: run pnpm install`).toBe(true);
      const run = spawnSync(
        process.execPath,
        [
          "--require",
          join(dir, "ldd.cjs"),
          join(dir, "probe.mjs"),
          loader,
          join(dir, "src", "entry.js"),
        ],
        { encoding: "utf8" },
      );
      expect(run.stderr, key).toBe("");
      expect(run.status, key).toBe(0);
      expect(run.stdout.trim(), key).toBe("loaded");
    }
  });
});
