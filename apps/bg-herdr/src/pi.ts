/**
 * bg tasks as read-only Herdr child terminals: one per task, showing its
 * lifecycle and the tail of its log, so a long build is visible beside the
 * session instead of only in a wake message.
 *
 * This is a separate package on purpose: it needs the Herdr core CLI (`hc`) and
 * a Herdr terminal, and pi itself must work without either. It draws nothing of
 * its own in pi; the monitors are Herdr's terminals.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBgHerdrBridge } from "./pi/bridge.ts";
import { monitorMain } from "./pi/monitor.ts";
import { writeMonitorScript } from "./pi/script.ts";

const exec = promisify(execFile);
/** bg's replayable snapshot, and the request that makes it answer with one. */
const STATE_EVENT = "bg:state";
const STATE_REQUEST_EVENT = "bg:state:request";
// Recover killed monitors and failed launches even when no bg task changes.
const REFRESH_MS = 5_000;

export default function bgHerdr(pi: ExtensionAPI) {
  let bridge: Awaited<ReturnType<typeof createBgHerdrBridge>> | undefined;
  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  // bg answers a request by emitting the snapshot on the same bus.
  const request = () => pi.events.emit(STATE_REQUEST_EVENT, { protocol: 1 });

  const close = async () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    unsubscribe?.();
    unsubscribe = undefined;
    const old = bridge;
    bridge = undefined;
    await old?.dispose();
  };

  pi.on("session_start", async (_event, ctx) => {
    // A reloaded session starts again without a shutdown on every path.
    await close();
    const parent = process.env.HC_TERMINAL_ID;
    // HC_TERMINAL_ID is the gate: outside Herdr there is no parent to start a
    // child under, and no window to show it in.
    if (!parent || ctx.mode !== "tui") return;
    const hc = process.env.PI_BG_HERDR_HC || "hc";
    // Availability is local: don't start a permanent retry loop when an SSH or
    // container inherited the marker but has no core client installed.
    try {
      await exec(hc, ["--version"], { timeout: 5_000 });
    } catch {
      ctx.ui.notify(
        "Herdr bg monitors disabled: hc is unavailable. Install the Herdr core, then /reload.",
        "warning",
      );
      return;
    }
    let warned = false;
    bridge = await createBgHerdrBridge({
      parent,
      sessionId: ctx.sessionManager.getSessionId(),
      cwd: ctx.cwd,
      script: (dir) => writeMonitorScript(dir, monitorMain),
      run: async (args) => (await exec(hc, args, { timeout: 5_000, maxBuffer: 1_048_576 })).stdout,
      onError: () => {
        if (warned) return;
        warned = true;
        ctx.ui.notify(
          "Herdr bg monitors temporarily unavailable; the tasks keep running. Retrying automatically.",
          "warning",
        );
      },
    });
    unsubscribe = pi.events.on(STATE_EVENT, (value) => bridge?.accept(value));
    request();
    // Never allow overlapping health checks to pile up on a slow core.
    let checking = false;
    timer = setInterval(() => {
      if (checking || !bridge) return;
      checking = true;
      request();
      void bridge.refresh().finally(() => {
        checking = false;
      });
    }, REFRESH_MS);
    timer.unref();
  });

  pi.on("session_shutdown", close);
}
