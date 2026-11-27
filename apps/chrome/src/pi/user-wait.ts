/**
 * Whether the agent is blocked on the user. Two things count: a dialog open while a tool call of
 * the session is in flight, as with a tool's own ask; and a dialog another plugin opened on the
 * agent's behalf while no tool call ran, which is what the peers plugin's inbound approval is.
 * A dialog opened between runs, such as a menu the person called up, counts as neither.
 *
 * The second case is a signal from whoever draws the dialog, because only they know it is the
 * agent's and not the person's: `apps/claude-peers` emits `agents:claude-peers:approval-state`
 * around an inbound approval ({ protocol: 1, waiting: boolean }, `true` when the first approval
 * opens and `false` when the last closes). The channel and the shape are its contract; a package
 * that draws a frame restates them rather than importing another plugin, as the editor bridge
 * does. Before this was extracted, the personal `peer-registry` feature relayed the same event into
 * the chrome's wait state; a frame that listens for it needs no host feature beside it.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** `apps/claude-peers`' notification around an inbound approval; a frame only listens. */
export const APPROVAL_STATE = "agents:claude-peers:approval-state";
/** The version of the payload this listens for; another one is ignored rather than misread. */
const APPROVAL_PROTOCOL = 1;

type SessionWait = {
  prompting: boolean;
  tools: Set<string>;
  /** A dialog another plugin opened for the agent, outside any tool call. */
  approval: boolean;
};

/**
 * Registers the handlers that keep the per-session state current; create it before any
 * `ui_prompt_start` handler that reads `waitingOnUser`.
 */
export const createUserWait = (pi: ExtensionAPI) => {
  const sessions = new Map<string, SessionWait>();
  /** The session the approval notification is about: the one pi told us started last. */
  let current: ExtensionContext | undefined;

  const state = (ctx: ExtensionContext): SessionWait => {
    const id = ctx.sessionManager.getSessionId();
    let wait = sessions.get(id);
    if (!wait) sessions.set(id, (wait = { prompting: false, tools: new Set(), approval: false }));
    return wait;
  };

  // `tool_execution_start` fires before `tool_call` hooks, so an ask raised from one counts as in
  // flight.
  pi.on("tool_execution_start", (event, ctx) => {
    state(ctx).tools.add(event.toolCallId);
  });
  pi.on("tool_execution_end", (event, ctx) => {
    state(ctx).tools.delete(event.toolCallId);
  });
  pi.on("agent_settled", (_event, ctx) => {
    state(ctx).tools.clear();
  });
  pi.on("ui_prompt_start", (_event, ctx) => {
    state(ctx).prompting = true;
  });
  pi.on("ui_prompt_end", (_event, ctx) => {
    state(ctx).prompting = false;
  });
  pi.on("session_start", (_event, ctx) => {
    current = ctx;
  });
  pi.on("session_shutdown", (_event, ctx) => {
    sessions.delete(ctx.sessionManager.getSessionId());
    if (current === ctx) current = undefined;
  });

  // The listener goes with the extension's runtime at the end of its session, as the editor-hooks
  // offer does, so nothing has to take it down.
  pi.events.on(APPROVAL_STATE, (event) => {
    const payload = event as { protocol?: unknown; waiting?: unknown } | undefined;
    if (payload?.protocol !== APPROVAL_PROTOCOL || typeof payload.waiting !== "boolean") return;
    if (current) state(current).approval = payload.waiting;
  });

  return {
    /** True while `ctx`'s session has the agent blocked on the person. */
    waitingOnUser(ctx: ExtensionContext): boolean {
      const wait = sessions.get(ctx.sessionManager.getSessionId());
      return !!wait?.prompting && (wait.tools.size > 0 || wait.approval);
    },
  };
};

export type UserWait = ReturnType<typeof createUserWait>;
