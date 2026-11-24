import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("publishes one complete font home when two processes start with a cold cache", async () => {
  const root = mkdtempSync(join(tmpdir(), "drive-fonts-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  for (const font of ["one.ttf", "two.otf"]) writeFileSync(join(root, font), "font");
  // Both builders reach font discovery before either can finish building its home.
  writeFileSync(
    join(bin, "fc-list"),
    `#!/bin/sh
set -eu
if [ ! -e "$XDG_CACHE_HOME/$BUILDER" ]; then
  touch "$XDG_CACHE_HOME/$BUILDER"
  i=0
  until [ -e "$XDG_CACHE_HOME/other" ] && [ -e "$XDG_CACHE_HOME/self" ]; do
    i=$((i+1)); [ "$i" -lt 100 ] || exit 1
    sleep 0.02
  done
fi
printf '%s\\n' "$XDG_CACHE_HOME/one.ttf" "$XDG_CACHE_HOME/two.otf"
`,
    { mode: 0o755 },
  );
  const module = new URL("./fonts.ts", import.meta.url).href;
  try {
    const results = await Promise.allSettled(
      ["self", "other"].map((BUILDER) =>
        promisify(execFile)(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `import { fakeFontHome } from ${JSON.stringify(module)}; console.log(fakeFontHome());`,
          ],
          {
            env: {
              ...process.env,
              BUILDER,
              XDG_CACHE_HOME: root,
              PATH: `${bin}:${process.env.PATH}`,
            },
            timeout: 5000,
          },
        ),
      ),
    );
    const home = join(root, "agent-tools-e2e", "fonthome-v3");
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
      expect(result.value.stdout.trim()).toBe(home);
    }
    expect(readdirSync(join(home, ".local", "share", "fonts")).sort()).toEqual([
      "one.ttf",
      "two.otf",
    ]);
    expect(readdirSync(join(root, "agent-tools-e2e"))).toEqual(["fonthome-v3"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
