/**
 * The session's identity, which the frame's top border and the terminal title paint: the label
 * pi's `/name` gives the session, whether a turn is running, whether its last one failed, and
 * whether a dialog has the person waiting.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { oneLine } from "../lib/format.ts";
import type { UserWait } from "./user-wait.ts";

export type Label = { text: string };

export type Identity = ReturnType<typeof createIdentity>;

/**
 * Registers the identity's handlers. Create it before any feature whose handlers read it on the
 * same event.
 */
export const createIdentity = (pi: ExtensionAPI, userWait: UserWait) => {
  let working = false;
  /** Why the run ended on an error, "" when it did not. */
  let failed = "";
  const listeners = new Set<() => void>();

  const paint = () => {
    for (const listener of listeners) listener();
  };

  pi.on("session_start", () => {
    working = false;
    failed = "";
  });

  pi.on("before_agent_start", () => {
    failed = "";
  });

  pi.on("agent_start", () => {
    working = true;
    paint();
  });

  pi.on("message_end", (event) => {
    if (event.message.role !== "assistant") return;
    if (event.message.stopReason === "error")
      failed = oneLine(event.message.errorMessage ?? "") || "API error";
  });

  pi.on("agent_settled", () => {
    working = false;
    paint();
  });

  return {
    current: (): Label | undefined => {
      const name = pi.getSessionName();
      return name ? { text: name } : undefined;
    },
    // Sub-agent widgets already own `●`, `○`, `⟳` and `▸`, so states that need you are words and
    // "working" is either pi's spinner or a frozen frame of one.
    stateWord: (ctx: ExtensionContext) => {
      if (userWait.waitingOnUser(ctx)) return "waiting";
      if (working) return "";
      return failed ? "failed" : "";
    },
    working: () => working,
    /** Calls `listener` whenever what the label or the state word shows may have changed. */
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};
