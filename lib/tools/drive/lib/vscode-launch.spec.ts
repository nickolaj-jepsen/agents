import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { launchVscode } from "./vscode.ts";

const scratch: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true });
});

test.skipIf(process.platform !== "linux")(
  "headless startup reports an exited compositor and keeps its log",
  async () => {
    const run = mkdtempSync(join(tmpdir(), "drive-vscode-test-"));
    scratch.push(run);
    const cwd = join(run, "cwd");
    mkdirSync(cwd);
    const code = join(run, "code");
    const cage = join(run, "cage");
    writeFileSync(code, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    writeFileSync(
      cage,
      '#!/bin/sh\nprintf "runtime=%s display=%s socket=%s\\n" "$XDG_RUNTIME_DIR" "$WAYLAND_DISPLAY" "$WAYLAND_SOCKET"\nexit 37\n',
      { mode: 0o700 },
    );
    vi.stubEnv("E2E_VSCODE_CODE", code);
    vi.stubEnv("E2E_VSCODE_CAGE", cage);
    vi.stubEnv("XDG_RUNTIME_DIR", join(run, "inherited"));
    const failure = await launchVscode(run, cwd, {
      plugins: [],
      env: { WAYLAND_DISPLAY: "inherited", WAYLAND_SOCKET: "42" },
    }).then(
      () => undefined,
      (error: Error) => error,
    );
    const log = failure?.message.match(/startup log: (.+)$/)?.[1];
    if (log) scratch.push(dirname(log));
    expect(failure?.message).toContain("headless launcher stopped before startup (exit 37)");
    expect(log).toBeDefined();
    const runtime = join(run, "wl");
    expect(statSync(runtime).mode & 0o777).toBe(0o700);
    rmSync(run, { recursive: true, force: true });
    expect(readFileSync(log!, "utf8")).toContain(`runtime=${runtime} display= socket=`);
  },
  10_000,
);
