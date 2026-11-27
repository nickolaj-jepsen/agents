/**
 * The stand-ins the frame's scenarios load beside it, so a screen can be reached without a paid
 * model, a real server or a person: another extension's footer statuses, a tool whose run asks the
 * person something, and the two dialogs a frame must tell apart.
 *
 * It is a scenario asset, not part of the plugin: the driver loads it with `-e`, and nothing ships
 * from it.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

// What another extension may put in pi's footer. The first carries a terminal colour, a newline and
// a tab: the frame draws it as one plain line, never trusting it to keep the row's shape. The
// second is wide, so the row's measure is in cells rather than characters.
const STATUSES = {
  "a-lint": "lint \u001b[32mok\u001b[0m",
  "b-build": "build\tone\ntwo  一斉",
};

/** `apps/claude-peers`' notification around an inbound approval, as its README states it. */
const APPROVAL_STATE = "agents:claude-peers:approval-state";

/** An overlay asking one question, drawn over the frame so the frame stays on screen. */
const ask = (ctx: ExtensionContext, question: string) =>
  ctx.ui.custom<boolean>(
    (tui, theme, _keys, done) => {
      const view = new Text(
        `${theme.fg("accent", question)} ${theme.fg("dim", "· enter approves, escape declines")}`,
        1,
        0,
      );
      return {
        render: (width: number) => view.render(width),
        invalidate: () => view.invalidate?.(),
        handleInput: (data: string) => {
          if (data === "\r") done(true);
          else if (data === "\x1b") done(false);
        },
      };
    },
    { overlay: true, blocked: { kind: "question", message: question } },
  );

export default function standIn(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    for (const [key, text] of Object.entries(STATUSES)) ctx.ui.setStatus(key, text);
  });

  /**
   * A tool that asks the person to confirm while it runs: `ui_prompt_start` fires while the call is
   * in flight, which is the frame's `waiting` state. Its parameters are a plain JSON schema, so no
   * TypeBox import is needed in a scenario asset.
   */
  pi.registerTool({
    name: "ask_user",
    label: "Ask the user",
    description: "Asks the person to confirm before anything is sent.",
    parameters: { type: "object", properties: { question: { type: "string" } }, required: [] },
    async execute(
      _id: string,
      params: { question?: string },
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: ExtensionContext,
    ) {
      const yes = await ask(ctx, params.question ?? "Continue?");
      return { content: [{ type: "text" as const, text: yes ? "confirmed" : "declined" }] };
    },
  } as never);

  /**
   * A peer's inbound approval: a dialog another plugin opens on the agent's behalf while no tool
   * call runs, announced on the channel the peers plugin publishes. Only this one says the agent is
   * waiting; the same dialog without the announcement is the person being asked to decide
   * something, which is not the agent waiting.
   */
  pi.registerCommand("stand-in-approval", {
    description: "Stand-in: a peer's inbound approval, opened outside any tool call",
    handler: async (_args, ctx) => {
      pi.events.emit(APPROVAL_STATE, { protocol: 1, waiting: true });
      try {
        await ask(ctx, "Approve the peer's message?");
      } finally {
        pi.events.emit(APPROVAL_STATE, { protocol: 1, waiting: false });
      }
    },
  });

  /** The same dialog, opened by nobody's agent: what the frame must not report as waiting. */
  pi.registerCommand("stand-in-dialog", {
    description: "Stand-in: an overlay another plugin opens on the person's behalf",
    handler: (_args, ctx) => ask(ctx, "Choose a destination?").then(() => undefined),
  });
}
