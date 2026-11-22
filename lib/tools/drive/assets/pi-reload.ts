import { existsSync, rmSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** A private file in the run folder, written only after a successful rebuild. */
export const RELOAD_REQUEST = "DRIVE_PI_RELOAD_REQUEST";

const command = "drive-reload-extensions";

export default function (pi: ExtensionAPI) {
  const request = process.env[RELOAD_REQUEST];
  if (!request) return;

  pi.registerCommand(command, {
    description: "Apply a pending rebuild from pnpm drive",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle() || !existsSync(request)) return;
      // A save during reload can leave a new request for the next runtime.
      rmSync(request, { force: true });
      await ctx.reload();
    },
  });

  let poll: ReturnType<typeof setInterval> | undefined;
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;
    poll = setInterval(() => {
      if (ctx.isIdle() && existsSync(request))
        pi.sendUserMessage(`/${command}`, { expandPromptTemplates: true });
    }, 250).unref();
  });
  pi.on("session_shutdown", () => clearInterval(poll));
}
