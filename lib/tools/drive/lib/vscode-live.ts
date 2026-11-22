/** `live` for VS Code: a visible window replays the scenario and stays until it is closed. */
import { rmSync } from "node:fs";
import { options } from "./options.ts";
import { newRunDir } from "./sessions.ts";
import { reachVscode, type VscodeResolved } from "./vscode-scenario.ts";
import { stopVscode, waitForVscodeClose } from "./vscode.ts";

export async function liveVscode(r: VscodeResolved) {
  const runDir = newRunDir("vlive");
  const controller = new AbortController();
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const interrupt = () => controller.abort();
  for (const signal of signals) process.on(signal, interrupt);
  try {
    console.log(`Replaying ${r.plugin}/vscode/${r.name} in VS Code.`);
    const { session, state } = await reachVscode(r, runDir, {
      visible: true,
      signal: controller.signal,
    });
    try {
      await session.useWindowSize();
    } finally {
      session.close();
    }
    console.log("Ready. Close the VS Code window to end the replay.");
    await waitForVscodeClose(state.port, controller.signal);
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    try {
      await stopVscode(runDir);
    } finally {
      for (const signal of signals) process.off(signal, interrupt);
      if (!options.keep) rmSync(runDir, { recursive: true, force: true });
    }
  }
}
