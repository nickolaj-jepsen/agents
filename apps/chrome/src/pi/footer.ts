/**
 * The line under the editor: the model answering, and where the session is working. The parts are
 * the footer's (`../lib/footer.ts`); this finds the words and paints them, follows the pointer and
 * sends a click to the action the part names.
 */
import { homedir } from "node:os";
import type {
  ExtensionAPI,
  ExtensionContext,
  ReadonlyFooterDataProvider,
  Theme,
} from "@earendil-works/pi-coding-agent";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import { paintSpans } from "@agents/kit-core/paint/pi.ts";
import { layoutFooter, type FooterInput, type Region } from "../lib/footer.ts";
import { splitPath } from "../lib/format.ts";
import { modelAlias, providerShortName } from "../lib/model-names.ts";
import type { Actions, ChromeAction } from "./actions.ts";
import { PR_COMMAND, type Git } from "./git.ts";
import type { ChromeState } from "./state.ts";

type ActiveModel = NonNullable<ExtensionContext["model"]>;

const providerName = (ctx: ExtensionContext, model: ActiveModel) => {
  try {
    return ctx.modelRegistry.getProviderDisplayName(model.provider);
  } catch {
    return undefined;
  }
};

export const createFooter = (pi: ExtensionAPI, state: ChromeState, actions: Actions, git: Git) => {
  let regions: Region[] = [];

  /** Which control a part is: the action map, by the name the layout carries. */
  const controls: Record<string, ChromeAction> = {
    model: actions.model,
    effort: actions.effort,
    open: actions.folder,
    git: actions.git,
  };

  /** The parts the footer asks the layout for. */
  const partsFor = (ctx: ExtensionContext): FooterInput => {
    const model = ctx.model;
    const thinking = ctx.thinkingLevel ?? pi.getThinkingLevel();
    const provider = model ? providerName(ctx, model) : undefined;
    const path = splitPath(ctx.cwd, homedir());
    return {
      // One phrase, one target: the provider and the model open the picker and light together.
      provider:
        provider === undefined
          ? undefined
          : {
              id: "model",
              text: provider,
              short: providerShortName(provider),
              role: "dim",
              action: "model",
            },
      model: {
        id: "model",
        text: model ? model.name || model.id : "no model",
        ...(model ? { short: modelAlias(model) } : {}),
        role: "dim",
        bold: true,
        action: "model",
      },
      // The effort is the editor border's own level, named.
      effort:
        model?.reasoning && thinking
          ? { id: "effort", text: `\uf0e7 ${thinking}`, role: "dim", action: "effort" }
          : undefined,
      path: {
        id: "path",
        text: path.parent + path.name,
        // The last segment names the worktree or checkout, so it is the part that reads.
        spans: [
          { text: path.parent, role: "dim" },
          { text: path.name, role: "text" },
        ],
        action: "open",
      },
      git: (mode) => {
        const part = git.view(mode);
        // One target for the whole block: a click anywhere on the branch, its status or the pull
        // request glyph invokes /git.
        return part ? { ...part, action: "git" } : null;
      },
    };
  };

  const renderLine = (width: number, theme: Theme): string => {
    const ctx = state.ctx;
    if (!ctx) {
      regions = [];
      return "";
    }
    const layout = layoutFooter(width, partsFor(ctx), state.hover);
    regions = layout.regions;
    return paintSpans(theme, layout.spans);
  };

  const mount = (ctx: ExtensionContext) => {
    ctx.ui.setFooter((tui, theme, footerData: ReadonlyFooterDataProvider) => {
      state.tui = tui;
      const unsubscribe = footerData.onBranchChange(() => {
        git.schedule(0);
        tui.requestRender();
      });
      git.schedule(0);
      git.startPolling();
      return {
        render: (width: number) => [renderLine(width, theme)],
        invalidate: () => {},
        handleMouse: (event: TuiMouseEvent) => {
          if (event.type === "move") {
            state.setHover(regions.find((r) => event.x >= r.x0 && event.x < r.x1)?.id);
            return undefined;
          }
          const plain =
            event.type === "click" &&
            event.button === "left" &&
            !event.alt &&
            !event.shift &&
            !event.ctrl;
          const region = plain ? regions.find((r) => event.x >= r.x0 && event.x < r.x1) : undefined;
          const action = region ? controls[region.action] : undefined;
          if (!action) return undefined;
          void Promise.resolve()
            .then(() => action(ctx))
            .catch((error: unknown) => ctx.ui.notify(`chrome: ${String(error)}`, "error"));
          return { handled: true };
        },
        dispose: () => {
          unsubscribe();
          git.dispose();
        },
      };
    });
  };

  pi.on("session_start", (_event, ctx) => {
    if (!state.live) return;
    git.start(ctx.cwd);
    mount(ctx);
  });

  const repaint = () => {
    if (!state.live) return;
    state.tui?.requestRender();
  };
  const repaintAndGit = () => {
    repaint();
    git.schedule();
  };

  pi.on("model_select", repaint);
  pi.on("thinking_level_select", repaint);
  pi.on("message_start", repaint);
  pi.on("message_end", repaint);
  pi.on("agent_start", repaint);
  pi.on("session_info_changed", repaint);
  pi.on("turn_end", repaintAndGit);
  pi.on("agent_end", repaintAndGit);
  pi.on("session_compact", repaint);
  pi.on("session_tree", repaint);

  // Once the command is done: a lookup while `gh pr create` still runs finds nothing.
  pi.on("tool_result", (event) => {
    const input = event.input as { command?: unknown } | undefined;
    if (event.toolName === "bash" && typeof input?.command === "string")
      if (PR_COMMAND.test(input.command)) git.markPrDirty();
  });
  pi.on("tool_execution_end", repaintAndGit);
  pi.on("session_shutdown", () => {
    git.dispose();
    regions = [];
  });
};
