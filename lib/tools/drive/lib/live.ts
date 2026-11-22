import { execFile } from "node:child_process";
import { options } from "./options.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { driveRoot, reach, type Resolved } from "./scenario.ts";
import { Session } from "./session.ts";
import { stopStub } from "./stub.ts";
import { DaemonTerm } from "./term.ts";
import { fileList, watchScenario, withInPlaceReload, type WatchFlags } from "./watch.ts";

const run = promisify(execFile);

const removeRun = (dir: string) => {
  if (!options.keep) rmSync(dir, { recursive: true, force: true });
};

/**
 * The scenario played in a process of its own, so it reads every source as it is now, onto a
 * daemon session of `name`, left there for this one to show.
 */
async function freshSession(
  r: Resolved,
  name: string,
  runDir: string,
  inPlace: boolean,
): Promise<Session> {
  try {
    const { stdout } = await run(
      process.execPath,
      [
        join(driveRoot, "drive.ts"),
        "_reach",
        r.plugin,
        r.name,
        "--harness",
        r.harness,
        "--daemon",
        name,
        "--run",
        runDir,
        "--size",
        `${r.size[0]}x${r.size[1]}`,
        ...(inPlace ? ["--in-place"] : []),
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    const { session } = JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}") as {
      session?: string;
    };
    return Session.attach(session ?? name, r.harness, runDir);
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    throw new Error((e.stderr || e.message).trim(), { cause: err });
  }
}

export async function live(r: Resolved, o: WatchFlags = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error("Run live mode in a terminal to interact with the scenario.");

  const runDir = mkdtempSync(join(tmpdir(), "e2e-live-"));
  const controller = new AbortController();
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
  const interrupt = () => controller.abort();
  for (const signal of signals) process.on(signal, interrupt);
  let session: Session | undefined;
  let stopWatching = async () => {};
  let starting: Promise<Session> | undefined;

  try {
    console.log(`Replaying ${r.plugin}/${r.harness}/${r.name}. Press Ctrl+] to leave live mode.`);
    const inPlace = !!o.watch && !!o.inPlace;
    session = await reach(
      inPlace ? withInPlaceReload(r, runDir) : r,
      "daemon",
      `e2e-live-${process.pid}`,
      runDir,
    );
    if (controller.signal.aborted) return;
    if (!(session.term instanceof DaemonTerm))
      throw new Error("Live mode requires the terminal daemon.");
    if (!o.watch) return await session.term.interact(controller.signal);

    // What takes the screen's place once a reload is done, and the loop's wake-up when none shows.
    let next: Session | Error | undefined;
    let wake = () => {};
    let n = 0;
    const replace = async (outcome: Session | Error) => {
      next = outcome;
      const old = session;
      session = undefined;
      wake();
      // Closing the session ends its monitor cleanly (a signal would leave the terminal raw).
      if (old) {
        await old.close();
        removeRun(old.runDir);
      }
    };
    const watcher = watchScenario(r, r.harness, {
      inPlaceRunDir: () => (inPlace && !controller.signal.aborted ? session?.runDir : undefined),
      onSave: (files) => {
        if (controller.signal.aborted) return false;
        if (!session) console.log(`\nSaved ${fileList(files)}: reloading…`);
      },
      replay: async () => {
        try {
          const dir = mkdtempSync(join(tmpdir(), "e2e-live-"));
          starting = freshSession(r, `e2e-live-${process.pid}-${++n}`, dir, inPlace).catch(
            (err: unknown) => {
              removeRun(dir);
              throw err;
            },
          );
          const fresh = await starting;
          starting = undefined;
          if (controller.signal.aborted) {
            await fresh.close();
            removeRun(fresh.runDir);
            return;
          }
          await replace(fresh);
        } catch (err) {
          starting = undefined;
          if (!controller.signal.aborted)
            await replace(err instanceof Error ? err : new Error(String(err)));
        }
      },
      onError: (err) => console.error(err instanceof Error ? err.message : String(err)),
    });
    stopWatching = () => watcher.close();

    for (;;) {
      if (session) {
        const term = session.term as DaemonTerm;
        try {
          await term.interact(controller.signal);
        } catch (err) {
          if (next === undefined) throw err;
        }
        // Ctrl+] or a signal; else a reload closed the session under the monitor.
        if (controller.signal.aborted || next === undefined) break;
      } else {
        await new Promise<void>((resolve) => {
          wake = resolve;
          controller.signal.addEventListener("abort", () => resolve(), { once: true });
        });
        if (controller.signal.aborted) break;
      }
      const outcome = next;
      next = undefined;
      if (outcome instanceof Error)
        console.error(
          `\nReload of ${r.plugin}/${r.harness}/${r.name} failed:\n${outcome.message}\n\nSave again to retry; Ctrl+C stops.`,
        );
      else if (outcome) session = outcome;
    }
  } finally {
    // No save starts work after this point, and the batch already in flight settles before the
    // sessions it can replace are closed: a replay cannot take the screen after the person left.
    await stopWatching();
    try {
      const late = await starting?.catch(() => undefined);
      if (late) {
        await late.close();
        removeRun(late.runDir);
      }
      if (session) await session.close();
      else stopStub(runDir);
    } finally {
      for (const signal of signals) process.off(signal, interrupt);
      if (session) removeRun(session.runDir);
      removeRun(runDir);
    }
  }
}
