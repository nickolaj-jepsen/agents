import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reach, type Resolved } from "./scenario.ts";
import type { Session } from "./session.ts";
import { stopStub } from "./stub.ts";
import { DaemonTerm } from "./term.ts";

export async function live(r: Resolved) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Run live mode in a terminal to interact with the scenario.");

  const runDir = mkdtempSync(join(tmpdir(), "e2e-live-"));
  const controller = new AbortController();
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const interrupt = () => controller.abort();
  for (const signal of signals) process.on(signal, interrupt);
  let session: Session | undefined;

  try {
    console.log(`Replaying ${r.plugin}/${r.harness}/${r.name}. Press Ctrl+] to leave live mode.`);
    session = await reach(r, "daemon", `e2e-live-${process.pid}`, runDir);
    if (controller.signal.aborted) return;
    if (!(session.term instanceof DaemonTerm))
      throw new Error("Live mode requires the terminal daemon.");
    await session.term.interact(controller.signal);
  } finally {
    try {
      if (session) await session.close();
      else stopStub(runDir);
    } finally {
      for (const signal of signals) process.off(signal, interrupt);
      if (!process.env.E2E_KEEP) rmSync(runDir, { recursive: true, force: true });
    }
  }
}
