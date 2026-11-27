/**
 * A stand-in for a plugin that draws controls for the checkout but registers no command of its own
 * (the extracted chrome): a key invokes the canonical owner's `/open`, `/git` or `/notes`, the way
 * a click on that frame will.
 *
 * `INVOKED_ACTION` names which action (the first when unset); `INVOKED_LOG` gets one line per
 * session start with how many plugins registered each action, so a scenario can count the owners.
 */
import { appendFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ACTIONS, invokeAction } from "@agents/actions/invoke.ts";

const KEY = "alt+c";

export default function (pi: ExtensionAPI) {
  const action = ACTIONS.find((name) => name === process.env.INVOKED_ACTION) ?? ACTIONS[0];
  const log = process.env.INVOKED_LOG;

  pi.on("session_start", () => {
    if (!log) return;
    const commands = pi.getCommands();
    const owners = ACTIONS.map(
      (name) =>
        `${name}=${commands.filter((c) => c.name === name && c.source === "extension").length}`,
    );
    appendFileSync(log, `${owners.join(" ")}\n`);
  });

  pi.registerShortcut(KEY, {
    description: `Invoke /${action}, as the frame's control does`,
    handler: (ctx) => {
      // What a frame says when the plugin that owns the control's action is not installed.
      if (!invokeAction(pi, action)) ctx.ui.notify(`no /${action} action is installed`, "warning");
    },
  });
}
