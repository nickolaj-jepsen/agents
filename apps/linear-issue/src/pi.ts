/**
 * /linear in pi: drafts a Linear issue from a note or the recent conversation, shows it in a
 * sheet over the transcript to review, and files it. The draft and what a key does are the
 * shared core's; this half gives it pi's model, Linear's MCP tools and the sheet.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { contentText } from "@earendil-works/pi-ai";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { line, span, truncate, type Line } from "../../../kit/lines.ts";
import { draw as paint } from "../../../kit/paint/pi.ts";
import { tokens } from "../../../kit/tokens.ts";
import {
  drafter,
  errorText,
  repoName,
  type Filed,
  type Form,
  type Host,
  type Last,
  type Origin,
  type TeamCache,
} from "../core/draft.ts";
import { CHIP } from "../core/chip.ts";
import { act, startView, type Drawn, type Effect, type Intent, type View } from "../core/screen.ts";
import { DraftChip, rowsFromPrompt } from "./chip.ts";
import { linearBridge } from "./linear.ts";
import { DONE_MARK, DraftSheet, sheetOptions } from "./sheet.ts";

const WIDGET = "linear-issue";
const FILED = "linear-issue-filed";
const GAP = " ".repeat(tokens.gutter);
/** How long a first press on the line's Discard waits for the second, which discards. */
const DISCARD_ARM_MS = 5000;

/** What the last filed issue used, kept beside pi's own settings. */
const lastFile = () => join(getAgentDir(), "linear-issue.json");

const readLast = (): Last | undefined => {
  try {
    return JSON.parse(readFileSync(lastFile(), "utf8")) as Last;
  } catch {
    return undefined;
  }
};

/** One message's words, whatever blocks it is made of. */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block: { type?: string; text?: string }) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n");
}

/** An issue filed, as a row of the transcript: its key, its title and where it is. */
const filedLines = (f: Filed, width: number): Line[] => [
  line([
    span(`${DONE_MARK} `, { role: "success" }),
    span(f.key, { role: "text", bold: true }),
    span(GAP),
    span(truncate(f.title, Math.max(4, width - f.key.length - 2 - GAP.length)), { role: "text" }),
  ]),
  ...(f.url
    ? [line([span(`  ${truncate(f.url, Math.max(4, width - 2))}`, { role: "link" })])]
    : []),
];

export default function linearIssue(pi: ExtensionAPI) {
  const linear = linearBridge(pi);
  const teams: TeamCache = new Map();
  let form: Form | null = null;
  let isSending = false;
  let view: View = startView();
  /** The open sheet's way to close it. */
  let open: { close: () => void } | undefined;
  /** The widget above the prompt and the surface it is on, once a session has mounted it. */
  let chip: { tui: TUI; widget: DraftChip } | undefined;
  /** The line's Discard was pressed once, and the timer that forgets it. */
  let isArmed = false;
  let disarm: ReturnType<typeof setTimeout> | undefined;

  const redraw = () => chip?.tui.requestRender();

  const arm = (armed: boolean) => {
    clearTimeout(disarm);
    disarm = armed ? setTimeout(() => arm(false), DISCARD_ARM_MS) : undefined;
    isArmed = armed;
    redraw();
  };

  const discard = () => {
    form = null;
    view = startView(view.opens);
    arm(false);
    close();
  };

  /**
   * Mounts the line above the prompt for a draft that is not on screen. It stays for the
   * session and draws no row while there is nothing to show.
   */
  const mount = (ctx: ExtensionContext) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget(WIDGET, (tui, theme) => {
      const widget = new DraftChip(
        theme,
        () => (form && !open ? { form, isArmed } : undefined),
        (hit) => {
          if (hit === CHIP.open) {
            arm(false);
            show(ctx);
          } else if (hit === CHIP.discard) {
            // A press that lands on it by mistake cannot undo a draft: the second one discards.
            if (isArmed) discard();
            else arm(true);
          }
        },
      );
      chip = { tui, widget };
      return widget;
    });
  };

  const origin = async (ctx: ExtensionContext): Promise<Origin> => {
    const git = async (...args: string[]) => {
      try {
        const r = await pi.exec("git", ["-C", ctx.cwd, ...args], { timeout: 2000 });
        return r.code === 0 ? r.stdout.trim() : "";
      } catch {
        return "";
      }
    };
    const [remote, branch] = await Promise.all([
      git("remote", "get-url", "origin"),
      git("branch", "--show-current"),
    ]);
    const messages = ctx.sessionManager.getBranch().flatMap((entry) => {
      const message = (entry as { type: string; message?: { role?: string; content?: unknown } })
        .message;
      if (entry.type !== "message" || !message?.role) return [];
      if (message.role !== "user" && message.role !== "assistant") return [];
      return [{ role: message.role, text: textOf(message.content) }];
    });
    return {
      cwd: ctx.cwd,
      repo: remote ? repoName(remote) : undefined,
      branch: branch || "(none)",
      sessionId: ctx.sessionManager.getSessionId(),
      messages,
    };
  };

  const hostFor = (ctx: ExtensionContext): Host => ({
    now: () => Date.now(),
    linear: (tool, args) => linear.call(ctx, tool, args),
    async complete({ system, prompt, maxTokens }) {
      const model = ctx.model;
      if (!model) return { error: "no model is selected" };
      try {
        const reply = await ctx.modelRegistry
          .streamSimple(
            model,
            {
              systemPrompt: system,
              messages: [
                { role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() },
              ],
            },
            { maxTokens, sessionId: ctx.sessionManager.getSessionId() },
          )
          .result();
        if (reply.stopReason === "error" || reply.stopReason === "aborted")
          return { error: reply.errorMessage ?? reply.stopReason };
        return { text: contentText(reply.content) };
      } catch (error) {
        return { error: errorText(error) };
      }
    },
    origin: () => origin(ctx),
    last: async () => readLast(),
    async remember(last) {
      const file = lastFile();
      if (!existsSync(dirname(file))) mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(last)}\n`);
    },
    read: () => form,
    update(change) {
      form = change(form);
      redraw();
    },
    log: () => undefined,
  });

  const close = () => {
    const sheet = open;
    open = undefined;
    sheet?.close();
    redraw();
  };

  const openUrl = async (ctx: ExtensionContext, url: string) => {
    for (const opener of ["xdg-open", "open"]) {
      try {
        if ((await pi.exec(opener, [url], { timeout: 5000 })).code === 0) return;
      } catch {}
    }
    ctx.ui.notify(`Couldn't open ${url}`, "warning");
  };

  /** What a key or a click asked for, beyond the view's own change. */
  const run = async (ctx: ExtensionContext, effect: Effect) => {
    const d = drafter(hostFor(ctx), teams);
    switch (effect.do) {
      case "hide":
        return close();
      case "discard":
        return discard();
      case "retry":
        return d.retry();
      case "team":
        return d.switchTeam(effect.team);
      case "set":
        form = form && { ...form, ...effect.patch };
        return redraw();
      case "create":
      case "comment": {
        // Two presses in a row both find the draft ready before either marks it as sent.
        if (isSending) return;
        isSending = true;
        const filed = await d
          .submit({ asComment: effect.do === "comment", open: effect.open })
          .finally(() => {
            isSending = false;
          });
        // Not filed: the page it was sent from says why, over its buttons.
        if (!filed) return redraw();
        form = null;
        view = startView(effect.open);
        close();
        pi.appendEntry<Filed>(FILED, filed);
        if (effect.open && filed.url) await openUrl(ctx, filed.url);
      }
    }
  };

  function show(ctx: ExtensionContext) {
    if (open) return;
    if (!chip) mount(ctx);
    let surface: TUI | undefined;
    // The prompt and what is under it are measured once for a render, which asks several times.
    let measured: number | undefined;
    const below = () => {
      if (measured === undefined) {
        measured = (surface && chip && rowsFromPrompt(surface, chip.widget)) || 0;
        queueMicrotask(() => {
          measured = undefined;
        });
      }
      return measured;
    };
    void ctx.ui
      .custom<void>(
        (tui, theme, _keys, done) => {
          surface = tui;
          open = { close: () => done() };
          return new DraftSheet(
            tui,
            theme,
            () => ({ form, view }),
            (intent: Intent, drawn: Drawn | undefined) => {
              const acted = act(form, view, intent, drawn, Date.now());
              view = acted.view;
              for (const effect of acted.effects)
                void run(ctx, effect).catch((error) =>
                  ctx.ui.notify(`linear-issue: ${errorText(error)}`, "error"),
                );
            },
            below,
          );
        },
        { overlay: true, overlayOptions: () => sheetOptions(surface!, below) },
      )
      .finally(() => {
        open = undefined;
        redraw();
      });
  }

  pi.registerCommand("linear", {
    description:
      "Draft a Linear issue from the text after it (or the recent conversation) for approval",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/linear needs pi's terminal UI to show the draft", "warning");
        return;
      }
      arm(false);
      if (form && form.phase !== "failed") {
        // One draft at a time: the one put aside comes back.
        show(ctx);
        if (args.trim()) ctx.ui.notify("Reopened your Linear draft; discard it to start another");
        return;
      }
      if (!linear.isConfigured(ctx)) {
        ctx.ui.notify(
          "No Linear MCP server is configured: pi mcp add linear --url https://mcp.linear.app/mcp",
          "warning",
        );
        return;
      }
      view = startView(readLast()?.open);
      await drafter(hostFor(ctx), teams).start({ kind: "note", text: args.trim() });
      show(ctx);
    },
  });

  pi.registerEntryRenderer<Filed>(FILED, (entry, _options, theme) => {
    const filed = entry.data;
    if (!filed?.key) return undefined;
    return {
      render: (width: number) => paint(theme, filedLines(filed, width), width),
      invalidate() {},
    };
  });

  pi.on("session_start", (_event, ctx) => {
    mount(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    // The draft is this session's; a new one starts without it.
    form = null;
    view = startView();
    arm(false);
    close();
    chip = undefined;
    await linear.close(ctx);
  });
}
