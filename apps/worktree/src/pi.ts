/**
 * pi's adapter for `wt`: moves a running session into a worktree, or back to
 * the repo's primary checkout. `wt` owns the worktrees and has to be on PATH
 * (it ships with the system config, not with this plugin); this half only moves
 * the session between them. Leaving keeps the worktree open unless removal
 * was requested. Landing stays an explicit `wt land`.
 *
 * pi pins a session's cwd at startup, so a move forks the conversation into a
 * new session file whose header names the target directory and switches to it:
 * pi rebuilds the whole runtime there (tools, context files, footer, git). Only
 * a command context may switch sessions, so the `enter_worktree` and `exit_worktree`
 * tools use an internal command after the turn settles to get that context.
 */
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { existsSync, writeFileSync } from "node:fs";
import { Type } from "typebox";
import {
  type ExtensionAPI,
  type ExtensionCommandContext,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const MOVED = "worktree-moved";
const ENTER_WORKTREE_TOOL = "enter_worktree";
const EXIT_WORKTREE_TOOL = "exit_worktree";
const MOVE_COMMAND = "_worktree-move";
type Move = { path: string; close?: string };

/** Runs `wt`, resolving its stdout; a non-zero exit rejects with what it said on stderr. */
const wt = (args: string[], cwd: string) =>
  new Promise<string>((resolve, reject) =>
    execFile("wt", args, { cwd, encoding: "utf8", timeout: 120_000 }, (error, stdout, stderr) =>
      error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout.trim()),
    ),
  );

/** A worktree's path for a name: open, reopened, or created off `base` (default: the default branch). */
const resolveWorktree = (target: string, cwd: string, base?: string) => {
  // Both come from the model; one that starts with `-` would reach `wt` as an option.
  for (const [what, value] of [
    ["name", target],
    ["base", base],
  ] as const)
    if (value?.startsWith("-"))
      throw new Error(`The worktree ${what} can't start with "-": ${value}`);
  return wt(base ? ["new", target, base] : ["new", target], cwd);
};

/** Writes the active branch of the conversation to a new session file rooted at `cwd`. */
function forkInto(ctx: ExtensionCommandContext, cwd: string): string {
  const source = ctx.sessionManager.getSessionFile();
  const target = SessionManager.create(cwd, undefined, {
    parentSession: source && existsSync(source) ? source : undefined,
  });
  const file = target.getSessionFile();
  const header = target.getHeader();
  if (!file || !header) throw new Error("pi could not prepare a session for the worktree");
  const lines = [header, ...ctx.sessionManager.getBranch()].map((entry) => JSON.stringify(entry));
  writeFileSync(file, `${lines.join("\n")}\n`, { flag: "wx", mode: 0o600 });
  return file;
}

/**
 * pi pins the session's cwd in the runtime and never chdirs, so `process.cwd()`
 * and anything `wt` runs with an implicit cwd stay on the checkout the session
 * left — which, for a worktree that is then removed, is a deleted directory.
 */
const follow = (cwd: string) => {
  try {
    process.chdir(cwd);
  } catch {
    // The checkout vanished; pi's tools pass their cwd explicitly and keep working.
  }
};

export default function (pi: ExtensionAPI) {
  let pending: Move | undefined;
  let settled: Move | undefined;

  const moveTo = async ({ path, close }: Move, ctx: ExtensionCommandContext) => {
    if (path === ctx.cwd) {
      ctx.ui.notify(`Already in ${path}`, "info");
      return;
    }
    let file: string;
    try {
      file = forkInto(ctx, path);
    } catch (error) {
      ctx.ui.notify(`Could not move session: ${(error as Error).message}`, "error");
      return;
    }
    const from = ctx.cwd;
    await ctx.switchSession(file, {
      withSession: async (next) => {
        follow(path);
        next.ui.notify(`Moved session to ${path}`, "info");
        let outcome = "";
        if (close) {
          try {
            await wt(["close", close], path);
            outcome = ` Closed ${close} with wt close.`;
          } catch (error) {
            outcome = ` Could not close ${close}: ${(error as Error).message}`;
            next.ui.notify(outcome.trim(), "warning");
          }
        }
        await next.sendMessage(
          {
            customType: MOVED,
            content:
              `This session moved from ${from} to ${path}; that is now your cwd and workspace. ` +
              `Paths under ${from} belong to the old checkout: don't edit them.${outcome} Continue the task here.`,
            display: true,
            details: { from, to: path },
          },
          { triggerTurn: true },
        );
      },
    });
  };

  // Once, before the first request: a later tool-set change can cost a cache-invalidating
  // re-read. The move needs a UI.
  pi.on("session_start", (_event, ctx) => {
    const active = pi.getActiveTools();
    if (!ctx.hasUI || active.includes(ENTER_WORKTREE_TOOL)) return;
    pi.setActiveTools([...active, ENTER_WORKTREE_TOOL, EXIT_WORKTREE_TOOL]);
  });

  // Anything run between the worktree tool and the move would still act on the old checkout.
  pi.on("tool_call", () => {
    if (pending)
      return {
        block: true,
        reason: `This session moves to ${pending.path} when the turn ends; end your turn now and continue there.`,
      };
  });

  pi.on("agent_settled", (event, ctx) => {
    const target = pending;
    pending = undefined;
    if (!target) return;
    if (event.aborted) {
      ctx.ui.notify("Worktree move cancelled.", "info");
      return;
    }
    settled = target;
    pi.sendUserMessage(`/${MOVE_COMMAND}`, { expandPromptTemplates: true });
  });

  pi.registerCommand(MOVE_COMMAND, {
    description: "Internal: finish a move requested by a worktree tool",
    handler: async (_args, ctx) => {
      const target = settled;
      settled = undefined;
      if (!target) return;
      await ctx.waitForIdle();
      await moveTo(target, ctx);
    },
  });

  pi.registerTool({
    name: ENTER_WORKTREE_TOOL,
    label: "Enter worktree",
    description:
      "Create a git worktree (or pick an existing one) and move this session into it, keeping the conversation. " +
      "A new worktree starts from `base`, by default the default branch, so uncommitted changes in the current checkout don't come along. " +
      "Calling it ends your turn; the session then continues in the worktree on its own.",
    promptSnippet: "Move this session into a git worktree of its own",
    promptGuidelines: [
      "Use enter_worktree when the user asks for a worktree, or for more than a quick edit while a peer session works in this checkout (make a quick one in place and tell that peer). Otherwise edit the checkout you are in.",
      "Move with enter_worktree (`wt list` shows existing worktrees), not `wt new`/`wt cd` in bash, which leave this session where it is.",
      "Stay in the worktree after finishing the task so the user can test and request follow-ups. Only exit when the user asks to leave, land, close, or drop it. To land, exit with action keep first, then run `wt land` from the primary checkout; it closes the worktree on success.",
    ],
    parameters: Type.Object({
      name: Type.Optional(
        Type.String({
          description: "Short kebab-case name for a new or existing worktree; generated if omitted",
        }),
      ),
      path: Type.Optional(
        Type.String({
          description: "Path to an open worktree of this repository, instead of name",
        }),
      ),
      base: Type.Optional(
        Type.String({
          description: "Ref a new worktree branches from; ignored for an existing one",
        }),
      ),
    }),
    exposure: "model-only",
    // Activated at session_start, only where the move can run.
    defaultActive: false,
    executionMode: "sequential",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) throw new Error("enter_worktree needs an interactive session");
      if (params.path !== undefined && (params.name !== undefined || params.base !== undefined)) {
        throw new Error("Use path for an open worktree, or name and base to create or reopen one");
      }
      const path =
        params.path === undefined
          ? await resolveWorktree(
              params.name ?? `worktree-${randomBytes(4).toString("hex")}`,
              ctx.cwd,
              params.base,
            )
          : await wt(["cd", resolve(ctx.cwd, params.path)], ctx.cwd);
      if (path === ctx.cwd) throw new Error(`Already working in ${path}`);
      pending = { path };
      return {
        content: [
          {
            type: "text",
            text: `Worktree ready at ${path}. This session moves there when this turn ends; stop now and you will be prompted to continue.`,
          },
        ],
        details: { path },
        terminate: true,
      };
    },
  });

  pi.registerTool({
    name: EXIT_WORKTREE_TOOL,
    label: "Exit worktree",
    description:
      "Return to the repo's primary checkout, keeping the conversation. The worktree stays open by default. " +
      "Use remove only if the user asks to close it: wt close saves uncommitted work on the branch rather than discarding it. " +
      "The session moves when the turn ends.",
    promptSnippet: "Return to the primary checkout, keeping the worktree open by default",
    parameters: Type.Object({
      action: Type.Optional(Type.Union([Type.Literal("keep"), Type.Literal("remove")])),
      discard_changes: Type.Optional(
        Type.Boolean({
          description:
            "Required with remove as confirmation. wt close preserves work on the branch.",
        }),
      ),
    }),
    exposure: "model-only",
    // Activated at session_start, only where the move can run.
    defaultActive: false,
    executionMode: "sequential",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) throw new Error("exit_worktree needs an interactive session");
      const remove = params.action === "remove";
      if (remove && params.discard_changes !== true) {
        throw new Error(
          "Use action keep, or confirm an explicit request to close with discard_changes: true",
        );
      }
      const from = await wt(["cd", "."], ctx.cwd);
      const path = await wt(["cd", "--main"], ctx.cwd);
      pending = { path, close: remove ? from : undefined };
      return {
        content: [
          {
            type: "text",
            text: `This session moves to ${path} when this turn ends. ${remove ? "It will then try to close the worktree." : "The worktree stays open."} Stop now and you will be prompted to continue.`,
          },
        ],
        details: { path },
        terminate: true,
      };
    },
  });
}
