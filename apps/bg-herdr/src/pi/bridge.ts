import { createHash, randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { monitorStateOf, parseSnapshot, type BgTask } from "../lib/state.ts";

type Run = (args: string[]) => Promise<string>;

/** A bg task as the bridge keeps it: what bg emitted, and when we last saw it. */
export type MonitorRecord = BgTask & { observedAt: number };

type Terminal = {
  address: string;
  parent?: string;
  state?: string;
  labels?: Record<string, string>;
};

/** `hc` addresses a terminal as `t7`, or `machine/t7` through another machine. */
const ADDRESS = /^t[a-z0-9]+$/;
const PARENT = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)?$/;
const LABEL = "bg-herdr";
const OWNER = `${LABEL}.owner`;

/** Untrusted text as one bounded label value: no controls, no line breaks. */
const cleanLabel = (value: string): string =>
  value
    .replace(/[\x00-\x1f\x7f-\x9f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

/** hc's "no such terminal": a removed one is not an error to report again. */
function alreadyRemoved(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("stderr" in error)) return false;
  try {
    return JSON.parse(String(error.stderr)).error?.kind === "not_found";
  } catch {
    return false;
  }
}

/** An existing directory for `--cwd`, or the session's own. */
function directoryOf(cwd: string, fallback: string): string {
  if (typeof cwd !== "string" || !cwd.startsWith("/")) return fallback;
  try {
    if (statSync(cwd).isDirectory()) return cwd;
  } catch {
    // A task's directory can be removed while it runs; hc would refuse it.
  }
  return fallback;
}

/**
 * One read-only Herdr child terminal per bg task. It never starts a program of
 * its own beyond the monitor, never forwards input, and never kills a terminal
 * it cannot prove it owns: a replacement Herdr core gives old addresses to other
 * programs.
 */
export async function createBgHerdrBridge(options: {
  /** This pi session's Herdr terminal; `hc` will not start a child without it. */
  parent: string;
  sessionId: string;
  cwd: string;
  /** Writes, or returns the path of, the monitor script inside the private folder. */
  script: (dir: string) => Promise<string>;
  run: Run;
  onError: (error: unknown) => void;
  now?: () => number;
}) {
  // A monitor without its parent outlives the session that wanted it, so a
  // missing id is a wiring mistake: refuse it instead of starting terminals.
  if (typeof options.parent !== "string" || !PARENT.test(options.parent))
    throw new Error("bg-herdr: a Herdr parent terminal id is required");

  const now = options.now ?? (() => Date.now());
  const dir = await mkdtemp(join(tmpdir(), "bg-herdr-"));
  const owner = randomUUID();
  const desired = new Map<string, MonitorRecord>();
  const children = new Map<
    string,
    { address: string; file: string; content?: string; labels?: string }
  >();
  let instance: string | undefined;
  let sequence = -1;
  let script: Promise<string> | undefined;
  let queue = Promise.resolve();
  let closed = false;
  let lastError: string | undefined;

  const report = (error: unknown) => {
    lastError = error instanceof Error ? error.message : String(error);
    options.onError(error);
  };
  const monitorScript = () => (script ??= options.script(dir));
  // One file per task id: an id is a number, and the name is not a filename.
  const fileFor = (id: string) =>
    join(dir, `${createHash("sha256").update(id).digest("hex").slice(0, 16)}.json`);

  const labelsOf = (record: MonitorRecord): string[] => {
    const name = cleanLabel(record.name) || `bg task ${record.id}`;
    const state = monitorStateOf(record);
    return [
      `${LABEL}=true`,
      `${OWNER}=${owner}`,
      `${LABEL}.task=${record.id}`,
      `${LABEL}.session=${cleanLabel(options.sessionId)}`,
      `${LABEL}.state=${record.state}`,
      `${LABEL}.name=${name}`,
      // herdr-ui draws its monitor rows from these three labels
      // (mods/nested-spaces/monitor-row.js). Without them the terminal falls
      // through to a duplicate Git checkout row instead of its task's name.
      "fireproof.pi-agent-monitor=true",
      `fireproof.pi-agent-name=${name}`,
      ...(state === undefined ? [] : [`fireproof.pi-agent-state=${state}`]),
    ];
  };

  const kill = async (address: string) => {
    try {
      // An old address is not permission to kill a terminal on a replaced core.
      const terminal = JSON.parse(await options.run(["get", address, "--json"])) as Terminal;
      if (terminal?.parent !== options.parent || terminal.labels?.[OWNER] !== owner) return;
      await options.run(["kill", address]);
    } catch (error) {
      if (!alreadyRemoved(error)) throw error;
    }
  };

  const remove = async (id: string) => {
    const child = children.get(id);
    if (!child) return;
    children.delete(id);
    try {
      await kill(child.address);
    } catch (error) {
      report(error);
    } finally {
      await rm(child.file, { force: true });
    }
  };

  const launch = async (record: MonitorRecord, file: string): Promise<string> => {
    const monitor = await monitorScript();
    const output = await options.run([
      "run",
      "--bg",
      "--json",
      "--no-notify",
      "--rm",
      "--parent",
      options.parent,
      "--cwd",
      directoryOf(record.cwd, options.cwd),
      ...labelsOf(record).flatMap((label) => ["--label", label]),
      "--",
      // Never a shell: the program, the script and its two arguments, as argv.
      process.execPath,
      monitor,
      file,
      String(process.pid),
    ]);
    const address: unknown = JSON.parse(output).address;
    if (typeof address !== "string" || !ADDRESS.test(address))
      throw new Error("hc returned an invalid monitor address");
    return address;
  };

  const sync = async () => {
    if (closed) return;
    for (const id of [...children.keys()].filter((id) => !desired.has(id))) await remove(id);
    for (const [id, record] of desired) {
      if (closed) return;
      try {
        const child = children.get(id);
        const file = child?.file ?? fileFor(id);
        const content = JSON.stringify(record);
        if (content !== child?.content) {
          await writeFile(`${file}.tmp`, content, { mode: 0o600 });
          await rename(`${file}.tmp`, file);
        }
        const labels = labelsOf(record);
        if (child) {
          if (child.labels !== labels.join("\n"))
            await options.run(["label", child.address, ...labels]);
          child.labels = labels.join("\n");
          child.content = content;
          continue;
        }
        const address = await launch(record, file);
        children.set(id, { address, file, content, labels: labels.join("\n") });
      } catch (error) {
        report(error);
      }
    }
  };

  const enqueue = (work: () => Promise<void>) => {
    queue = queue.then(work).catch(report);
    return queue;
  };

  return {
    accept(value: unknown) {
      const snapshot = parseSnapshot(value);
      if (closed || !snapshot || snapshot.sessionId !== options.sessionId) return;
      // A resend or a stale message: one instance counts up, and a new one resets.
      if (snapshot.instanceId === instance) {
        if (snapshot.sequence <= sequence) return;
      } else {
        instance = snapshot.instanceId;
      }
      sequence = snapshot.sequence;
      const seen = new Set<string>();
      for (const task of snapshot.tasks) {
        const id = String(task.id);
        seen.add(id);
        const old = desired.get(id);
        // bg owns the lifecycle; we only add when we last saw it.
        desired.set(id, {
          ...task,
          observedAt: task.state === old?.state ? old.observedAt : now(),
        });
      }
      for (const id of [...desired.keys()].filter((id) => !seen.has(id))) desired.delete(id);
      void enqueue(sync);
    },
    /** Reconcile live ownership, including launches whose CLI reply was lost. */
    refresh() {
      return enqueue(async () => {
        if (closed) return;
        const list: unknown = JSON.parse(
          await options.run(["ls", "--json", "--label", `${OWNER}=${owner}`]),
        );
        if (
          !list ||
          typeof list !== "object" ||
          !("terminals" in list) ||
          !Array.isArray(list.terminals)
        )
          throw new Error("Invalid hc terminal list");
        // `hc ls` is a compact summary even with --json: it omits labels.
        // Fetch full records before deciding ownership or adopting a lost reply.
        const records: Terminal[] = [];
        for (const summary of list.terminals as Terminal[]) {
          if (!summary || !/^t[a-z0-9]+$/.test(summary.address)) continue;
          try {
            records.push(JSON.parse(await options.run(["get", summary.address, "--json"])));
          } catch (error) {
            if (!alreadyRemoved(error)) throw error;
          }
        }
        const live = records.filter(
          (t) =>
            ADDRESS.test(t.address) &&
            t.parent === options.parent &&
            t.state === "live" &&
            t.labels?.[OWNER] === owner,
        );
        const addresses = new Set(live.map((t) => t.address));
        for (const [id, child] of children) {
          if (addresses.has(child.address)) continue;
          // A partial list during core recovery is not proof a monitor died.
          try {
            const terminal = JSON.parse(
              await options.run(["get", child.address, "--json"]),
            ) as Terminal;
            if (
              terminal?.state === "live" &&
              terminal.parent === options.parent &&
              terminal.labels?.[OWNER] === owner
            ) {
              live.push(terminal);
              addresses.add(terminal.address);
              continue;
            }
          } catch (error) {
            if (!alreadyRemoved(error)) throw error;
          }
          children.delete(id);
        }
        for (const terminal of live) {
          const id = terminal.labels?.[`${LABEL}.task`];
          if (!id || !desired.has(id)) {
            await kill(terminal.address);
            continue;
          }
          if (!children.has(id)) children.set(id, { address: terminal.address, file: fileFor(id) });
          else if (children.get(id)!.address !== terminal.address) await kill(terminal.address);
        }
        lastError = undefined;
        await sync();
      });
    },
    flush: () => queue,
    status: () => ({ tasks: desired.size, monitors: children.size, lastError }),
    async dispose() {
      closed = true;
      await queue;
      for (const id of children.keys()) {
        try {
          await remove(id);
        } catch (error) {
          report(error);
        }
      }
      await rm(dir, { recursive: true, force: true });
    },
  };
}
