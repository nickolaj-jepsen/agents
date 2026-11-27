/**
 * The line under the editor: the model answering, and where the session is working. The parts are
 * the footer's (`../lib/footer.ts`); this finds the words and paints them, follows the pointer and
 * sends a click to the action the part names.
 *
 * The meters live on the editor's top border while it is drawn, and come here when it is not: a
 * dialog over the editor takes the border with it, and the context pressure does not stop being
 * true because a picker is open.
 */
import { homedir } from "node:os";
import {
  createLocalBashOperations,
  type ExtensionAPI,
  type ExtensionContext,
  type ReadonlyFooterDataProvider,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { TuiMouseEvent } from "@earendil-works/pi-tui";
import type { Role, Span } from "@agents/kit-core/lines.ts";
import { paintSpan } from "@agents/kit-core/paint/pi.ts";
import { nameFor, roleFor, routedModel } from "../lib/config.ts";
import type { ChromeConfig } from "../lib/config.ts";
import { formatCost, sanitizeLabel, splitPath } from "../lib/format.ts";
import { layoutFooter, type FooterInput, type Part, type Region } from "../lib/footer.ts";
import { regionAt } from "../lib/line.ts";
import { contextRole, type Meter } from "../lib/measurements.ts";
import { modelAlias, providerShortName } from "../lib/model-names.ts";
import type { ChromeAction } from "./actions.ts";
import { PR_COMMAND, type Git } from "./git.ts";
import type { StatsReader } from "./stats.ts";
import type { ChromeState } from "./state.ts";

type ActiveModel = NonNullable<ExtensionContext["model"]>;

/** What the editor's top border shows, as this session measured it. */
export type BorderInput = { percent: number | undefined; window: number; meters: Meter[] };

// Font Awesome range of the Nerd Font, present in every version of it. One space follows an icon:
// these fonts draw the glyph into its own cells, so a second one reads as a gap.
const ICON_EFFORT = "\uf0e7";
const CACHE_WARN_PCT = 90;
const CACHE_ERROR_PCT = 50;

/** pi's colour for a thinking level, as its editor border paints it; the text is left uncoloured on error. */
const thinkingBorderColour = (
  theme: Theme,
  level: Parameters<Theme["getThinkingBorderColor"]>[0],
) => {
  try {
    return theme.getThinkingBorderColor(level);
  } catch {
    return undefined;
  }
};

const providerName = (ctx: ExtensionContext, provider: string) => {
  try {
    return ctx.modelRegistry.getProviderDisplayName(provider);
  } catch {
    return undefined;
  }
};

/** The physical provider behind the session's last reply, which a router's own name hides. */
export const answeringProvider = (ctx: ExtensionContext): string | undefined => {
  const branch = ctx.sessionManager.getBranch();
  for (let i = branch.length - 1; i >= 0; i--) {
    const entry = branch[i];
    if (entry?.type !== "message" || entry.message.role !== "assistant") continue;
    if (entry.message.stopReason === "error" || entry.message.stopReason === "aborted") continue;
    return entry.message.provider;
  }
  return undefined;
};

export const createFooter = (
  pi: ExtensionAPI,
  state: ChromeState,
  git: Git,
  stats: StatsReader,
  config: ChromeConfig,
  /** What a control named on the line does, by the name the layout carries. */
  controls: Record<string, ChromeAction>,
) => {
  let regions: Region[] = [];

  /** Cost and speed as text; `undefined` when there is nothing worth showing. */
  const meterTexts = (ctx: ExtensionContext, model: ActiveModel | undefined) => {
    const s = stats.statsFor(ctx, model);
    const paid = (model?.cost.input ?? 0) > 0 || (model?.cost.output ?? 0) > 0;
    return {
      cost: s.cost > 0 || paid ? formatCost(s.cost) : undefined,
      // The speed belongs to one reply, so off-turn it is the last number that happened rather
      // than the current one — the busiest part of the border saying nothing.
      speed:
        !ctx.isIdle() && s.speed !== undefined && Number.isFinite(s.speed) && s.speed > 0
          ? `${Math.round(s.speed)} t/s`
          : undefined,
    };
  };

  /** What the editor's top border shows: the context, then the meters. */
  const measurements = (): BorderInput => {
    const ctx = state.ctx;
    if (!ctx) return { percent: undefined, window: 0, meters: [] };
    const model = ctx.model;
    const usage = stats.contextFor(ctx, model);
    const { cost, speed } = meterTexts(ctx, model);
    const meters: Meter[] = [];
    if (cost !== undefined) meters.push({ id: "cost", text: cost });
    if (speed !== undefined) meters.push({ id: "speed", text: speed });
    return {
      percent: usage?.percent ?? undefined,
      window: usage?.contextWindow || model?.contextWindow || 0,
      meters,
    };
  };

  /** The provider a router model reached, when the host named the model as a router. */
  const routedName = (ctx: ExtensionContext, model: ActiveModel): string | undefined => {
    const router = config.routed.some((entry) => {
      const name = routedModel(entry);
      return name?.provider === model.provider && name.id === model.id;
    });
    if (!router) return undefined;
    const provider = answeringProvider(ctx);
    if (!provider || provider === model.provider) return undefined;
    return providerName(ctx, provider);
  };

  /** The parts the footer asks the layout for. */
  const partsFor = (ctx: ExtensionContext, footerData: ReadonlyFooterDataProvider): FooterInput => {
    const model = ctx.model;
    const thinking = ctx.thinkingLevel ?? pi.getThinkingLevel();
    const provider = model ? providerName(ctx, model.provider) : undefined;
    const path = splitPath(ctx.cwd, homedir());
    const s = stats.statsFor(ctx, model);

    const alarms: Part[] = [];
    // A cache that is no longer holding is worth a word; a rate that is fine is not.
    if (s.cacheHit !== undefined && s.cacheHit < CACHE_WARN_PCT)
      alarms.push({
        id: "cache",
        text: `cache ${Math.round(s.cacheHit)}%`,
        role: s.cacheHit < CACHE_ERROR_PCT ? "error" : "warning",
      });
    // The border carries the measurements whenever it is drawn; this frame's answer says whether
    // it was.
    const bordered = state.borderDrawn;
    state.borderDrawn = false;
    const percent = bordered ? undefined : stats.contextFor(ctx, model)?.percent;
    if (percent != null)
      alarms.push({
        id: "context",
        text: `ctx ${Math.floor(percent)}%`,
        role: contextRole(percent),
      });

    const { cost, speed } = meterTexts(ctx, model);
    const reached = model ? routedName(ctx, model) : undefined;
    const modelText = model
      ? `${model.name || model.id}${reached ? ` (${reached})` : ""}`
      : "no model";

    const statuses = [...footerData.getExtensionStatuses()]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([, text], index) => {
        const plain = sanitizeLabel(text);
        return plain ? [{ id: `status-${index}`, text: plain, role: "dim" as const }] : [];
      });

    return {
      // One phrase, one target: the provider and the model open the picker and light together.
      provider:
        provider === undefined
          ? undefined
          : {
              id: "model",
              text: provider,
              short: providerShortName(provider),
              role: roleFor(config, "provider"),
              action: "model",
            },
      model: {
        id: "model",
        text: modelText,
        ...(model ? { short: nameFor(config, { id: model.id }, modelAlias(model)) } : {}),
        // A provider whose spend the person watches is the one word on the line in alarm colour.
        role: model && config.watched.includes(model.provider) ? "error" : roleFor(config, "model"),
        bold: true,
        action: "model",
      },
      // The effort is the editor border's own level, named. Its colour is the border's too, unless
      // the host named a role for it, and then the painter below resolves it.
      effort:
        model?.reasoning && thinking
          ? {
              id: "effort",
              text: `${ICON_EFFORT} ${thinking}`,
              ...(roleFor(config, "effort") === "thinking"
                ? {}
                : { role: roleFor(config, "effort") as Role }),
              action: "effort",
            }
          : undefined,
      statuses,
      alarms,
      cost: cost !== undefined && !bordered ? { id: "cost", text: cost } : undefined,
      speed: speed !== undefined && !bordered ? { id: "speed", text: speed } : undefined,
      path: {
        id: "path",
        text: path.parent + path.name,
        // The last segment names the worktree or checkout, so it is the part that reads, and the
        // one a narrow line keeps.
        short: path.name,
        // The checkout's own name reads in any palette, so the squeezed form is never the road's
        // dim colour.
        role: "text",
        spans: [
          { text: path.parent, role: roleFor(config, "path") },
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

  const renderLine = (
    width: number,
    theme: Theme,
    footerData: ReadonlyFooterDataProvider,
  ): string => {
    const ctx = state.ctx;
    if (!ctx) {
      regions = [];
      return "";
    }
    const layout = layoutFooter(width, partsFor(ctx, footerData), state.hover);
    regions = layout.regions;
    // The effort chip wears pi's own colour for the level, which is the colour its editor border
    // takes there, so the two read as one setting. A host that named a role for it gets that.
    const thinking = ctx.thinkingLevel ?? pi.getThinkingLevel();
    const levelColour =
      config.roles.effort === "thinking" ? thinkingBorderColour(theme, thinking) : undefined;
    const paint = (span: Span): string => {
      if (span.hit !== "effort") return paintSpan(theme, span);
      // Hover is the line's own rule — the words brighten — so it wins over the level's colour.
      if (state.hover === "effort")
        return paintSpan(theme, { text: span.text, role: "text", bold: true });
      return levelColour ? levelColour(span.text) : paintSpan(theme, span);
    };
    return layout.spans.map(paint).join("");
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
        render: (width: number) => [renderLine(width, theme, footerData)],
        invalidate: () => {},
        handleMouse: (event: TuiMouseEvent) => {
          if (event.type === "move") {
            state.setHover(regionAt(regions, event.x)?.id);
            return undefined;
          }
          const plain =
            event.type === "click" &&
            event.button === "left" &&
            !event.alt &&
            !event.shift &&
            !event.ctrl;
          const region = plain ? regionAt(regions, event.x) : undefined;
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
  const rescan = () => {
    stats.reset();
    repaint();
  };

  pi.on("model_select", repaint);
  pi.on("thinking_level_select", repaint);
  pi.on("message_start", repaint);
  pi.on("message_end", repaint);
  pi.on("agent_start", repaint);
  pi.on("session_info_changed", repaint);
  pi.on("turn_end", repaintAndGit);
  pi.on("agent_end", repaintAndGit);
  pi.on("session_compact", rescan);
  pi.on("session_tree", rescan);

  // Once the command is done: a lookup while `gh pr create` still runs finds nothing.
  pi.on("tool_result", (event) => {
    const input = event.input as { command?: unknown } | undefined;
    if (event.toolName === "bash" && typeof input?.command === "string")
      if (PR_COMMAND.test(input.command)) git.markPrDirty();
  });
  pi.on("tool_execution_end", repaintAndGit);

  // `user_bash` fires before a `!command` runs and nothing fires after it, so the refresh rides on
  // the operations that run it: git status and a pull-request lookup a keystroke later would
  // otherwise describe the checkout as it was.
  const bash = createLocalBashOperations();
  pi.on("user_bash", (event) => {
    if (!state.live) return;
    const prCommand = PR_COMMAND.test(event.command);
    return {
      operations: {
        exec: async (command, cwd, options) => {
          try {
            return await bash.exec(command, cwd, options);
          } finally {
            if (prCommand) git.markPrDirty();
            repaint();
            git.schedule(0);
          }
        },
      },
    };
  });

  pi.on("session_shutdown", () => {
    git.dispose();
    regions = [];
  });

  return { measurements };
};
