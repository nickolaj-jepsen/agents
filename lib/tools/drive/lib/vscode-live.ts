/** `live` for VS Code: a visible window replays the scenario and stays until it is closed. */
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { options } from "./options.ts";
import { driveRoot } from "./scenario.ts";
import { newRunDir } from "./sessions.ts";
import { reachVscode, type VscodeResolved } from "./vscode-scenario.ts";
import { stopVscode, waitForVscodeClose } from "./vscode.ts";
import { fileList, watchScenario, type Watch, type WatchFlags } from "./watch.ts";

export async function liveVscode(r: VscodeResolved, o: WatchFlags = {}) {
  const runDir = newRunDir("vlive");
  const controller = new AbortController();
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const interrupt = () => controller.abort();
  for (const signal of signals) process.on(signal, interrupt);
  let watcher: Watch | undefined;
  try {
    console.log(`Replaying ${r.plugin}/vscode/${r.name} in VS Code.`);
    const { session, state } = await reachVscode(r, runDir, {
      visible: true,
      watchPlugins: o.watch && o.inPlace,
      signal: controller.signal,
    });
    try {
      await session.useWindowSize();
    } finally {
      session.close();
    }
    if (o.watch) {
      watcher = watchScenario(r, "vscode", {
        onSave: (files) => {
          if (controller.signal.aborted) return false;
          console.log(`Saved ${fileList(files)}`);
        },
        inPlaceRunDir: () => (o.inPlace && !controller.signal.aborted ? runDir : undefined),
        onBuild: (lines) => {
          for (const line of lines) console.log(line);
        },
        replay: async () => {
          // Load the scenario and its imports from disk rather than from this process's cache.
          const code = await new Promise<number | null>((resolve, reject) =>
            spawn(
              process.execPath,
              [
                join(driveRoot, "drive.ts"),
                "_replay-vscode",
                r.plugin,
                r.name,
                "--run",
                runDir,
                ...(r.size ? ["--size", `${r.size[0]}x${r.size[1]}`] : []),
              ],
              { stdio: "inherit", signal: controller.signal },
            )
              .once("exit", resolve)
              .once("error", reject),
          );
          if (code !== 0 && !controller.signal.aborted) console.log("Waiting for the next save.");
        },
        onError: (err) => {
          if (!controller.signal.aborted) console.error(err instanceof Error ? err.message : err);
        },
      });
      console.log(
        o.inPlace
          ? "Watching sources; plugin edits reload in place."
          : "Watching sources; saves replay the scenario in this window.",
      );
    }
    console.log("Ready. Close the VS Code window to end the replay.");
    await waitForVscodeClose(state.port, controller.signal);
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    controller.abort();
    watcher?.close();
    try {
      await stopVscode(runDir);
    } finally {
      for (const signal of signals) process.off(signal, interrupt);
      if (!options.keep) rmSync(runDir, { recursive: true, force: true });
    }
  }
}
