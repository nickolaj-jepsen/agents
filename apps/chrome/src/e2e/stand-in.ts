/**
 * The stand-ins the frame's scenarios load beside it, so a screen can be reached without a paid
 * model, a real server or a person: another extension's footer statuses, and a tool whose run asks
 * the person something.
 *
 * It is a scenario asset, not part of the plugin: the driver loads it with `-e`, and nothing ships
 * from it.
 */
import type { ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

// What another extension may put in pi's footer. The first carries a terminal colour, a newline and
// a tab: the frame draws it as one plain line, never trusting it to keep the row's shape. The
// second is wide, so the row's measure is in cells rather than characters.
const STATUSES = {
  "a-lint": "lint \u001b[32mok\u001b[0m",
  "b-build": "build\tone\ntwo  一斉",
};

export default function standIn(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    for (const [key, text] of Object.entries(STATUSES)) ctx.ui.setStatus(key, text);
  });

  /**
   * A tool that asks the person to confirm in an overlay, so the frame underneath is still drawn:
   * `ui_prompt_start` fires while the call is in flight, which is the frame's `waiting` state. Its
   * parameters are a plain JSON schema, so no TypeBox import is needed in a scenario asset.
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
      ctx: ExtensionToolContext,
    ) {
      const question = params.question ?? "Continue?";
      const yes = await ctx.ui.custom<boolean>(
        (tui, theme, _keys, done) => {
          const view = new Text(
            `${theme.fg("accent", question)} ${theme.fg("dim", "· enter sends, escape cancels")}`,
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
      return { content: [{ type: "text" as const, text: yes ? "confirmed" : "declined" }] };
    },
  } as never);
}
