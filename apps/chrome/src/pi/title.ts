/**
 * The terminal title: the only surface visible from a desktop's window overview, so it stays
 * terse. Task label, directory, age, and a state word only when the session wants you.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { formatAge } from "../lib/format.ts";
import { titleText } from "../lib/title.ts";
import type { Identity } from "./identity.ts";
import type { ChromeState } from "./state.ts";
import type { UserWait } from "./user-wait.ts";

const TICK_MS = 60_000;

export const createTitle = (
  pi: ExtensionAPI,
  state: ChromeState,
  label: Identity,
  userWait: UserWait,
) => {
  let timer: ReturnType<typeof setInterval> | undefined;
  let repaintTimer: ReturnType<typeof setTimeout> | undefined;
  let since = Date.now();
  let waited = false;
  let painted = "";

  const render = (ctx: ExtensionContext) =>
    titleText({
      label: label.current()?.text,
      cwd: ctx.cwd,
      home: homedir(),
      age: formatAge(Date.now() - since, "now"),
      word: label.stateWord(ctx) || undefined,
      working: label.working(),
    });

  const paint = () => {
    const ctx = state.ctx;
    if (!ctx || !state.live) return;
    // Every tool call repaints; only rewrite the title when it changed, so the titlebar does not
    // flicker for a session that merely got older.
    const title = render(ctx);
    if (title !== painted) {
      painted = title;
      ctx.ui.setTitle(title);
    }
    state.tui?.requestRender();
  };

  /**
   * Pi owns the title too (`π - <name> - <cwd>`). It writes it before any extension hears of a
   * rename, but at startup only after session_start.
   */
  const repaintOver = () => {
    painted = "";
    paint();
  };
  const repaintSoon = () => {
    if (repaintTimer) clearTimeout(repaintTimer);
    repaintTimer = setTimeout(() => {
      repaintTimer = undefined;
      repaintOver();
    }, 250);
    repaintTimer.unref?.();
  };

  label.onChange(paint);

  pi.on("session_start", () => {
    if (!state.live) return;
    timer = setInterval(paint, TICK_MS);
    timer.unref?.();
    paint();
    repaintSoon();
  });

  const restart = () => {
    since = Date.now();
    paint();
  };
  pi.on("agent_start", restart);
  pi.on("agent_settled", restart);

  // Only a dialog the run is blocked on says "waiting"; the phase underneath is untouched, so the
  // spinner stays and a run that settles meanwhile shows it.
  const promptChanged = (ctx: ExtensionContext) => {
    const waiting = userWait.waitingOnUser(ctx);
    if (waiting !== waited) {
      waited = waiting;
      since = Date.now();
    }
    paint();
  };
  pi.on("ui_prompt_start", (_event, ctx) => promptChanged(ctx));
  pi.on("ui_prompt_end", (_event, ctx) => promptChanged(ctx));

  pi.on("message_end", paint);
  pi.on("tool_execution_end", paint);
  pi.on("session_compact", paint);
  pi.on("session_info_changed", repaintOver);

  pi.on("session_shutdown", () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (repaintTimer) clearTimeout(repaintTimer);
    repaintTimer = undefined;
    if (state.ctx && state.live) {
      // Leave an honest title for the shell prompt that follows; the fish title takes over from
      // here, but a crash-free exit should not show a stale run.
      state.ctx.ui.setTitle(
        titleText({ label: label.current()?.text, cwd: state.ctx.cwd, home: homedir(), age: "" }),
      );
    }
  });
};
