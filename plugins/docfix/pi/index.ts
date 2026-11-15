/**
 * The pi half of docfix: the `docfix` tool, the /docfix panel, and the open
 * count in the footer. What a call does to the queue is the core's
 * (`../core/docfix.ts`), the one Claude Code's mod runs.
 */
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  applyPrompt,
  byTarget,
  dismiss,
  KINDS,
  normalizeTarget,
  openQueue,
  plan,
  statusText,
  TOOL_DESCRIPTION,
  TOOL_NAME,
  type Suggestion,
} from "../core/docfix.ts";
import { overlayOptions } from "../../../kit/pi/ui.ts";
import { DocsPanel, EMPTY_TEXT } from "./panel.ts";
import { isTracked, loadAll, remove, repoRoot, save, storeDir } from "./store.ts";

const STATUS_KEY = "docfix";

type Place = { root: string; dir: string };

async function place(cwd: string): Promise<Place | string> {
  const root = await repoRoot(cwd);
  if (!root) return "not inside a git repository, so there are no repo docs to file against";
  const dir = await storeDir(root);
  if (!dir)
    return "this checkout has no note store (.agents/store); run `agent-notes root --ensure`";
  return { root, dir };
}

export default function (pi: ExtensionAPI) {
  async function refresh(ctx: ExtensionContext) {
    if (!ctx.hasUI) return;
    const where = await place(ctx.cwd);
    const open = typeof where === "string" ? 0 : openQueue(await loadAll(where.dir)).length;
    ctx.ui.setStatus(STATUS_KEY, statusText(open));
  }

  pi.on("session_start", (_event, ctx) => refresh(ctx));
  pi.on("agent_end", (_event, ctx) => refresh(ctx));

  pi.registerTool({
    name: TOOL_NAME,
    label: "Doc fix",
    description: TOOL_DESCRIPTION,
    parameters: Type.Object({
      action: StringEnum(["suggest", "resolve"] as const),
      file: Type.Optional(Type.String({ description: "Repo-relative path of the doc (suggest)." })),
      kind: Type.Optional(StringEnum(KINDS)),
      claim: Type.Optional(
        Type.String({ description: "One line: what the doc should say, or why it is wrong." }),
      ),
      evidence: Type.Optional(
        Type.String({
          description:
            "The doc's line and what contradicts it: a code location, or a command and its output.",
        }),
      ),
      same_as: Type.Optional(
        Type.String({ description: 'Id of the listed suggestion this repeats, or "none".' }),
      ),
      id: Type.Optional(Type.String({ description: "The suggestion to resolve." })),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const fail = (text: string) => ({
        content: [{ type: "text" as const, text }],
        details: { ok: false },
        isError: true,
      });
      const where = await place(ctx.cwd);
      if (typeof where === "string") return fail(where);
      let target = params.file ? normalizeTarget(params.file, where.root) : undefined;
      if (target?.ok && !(await isTracked(where.root, target.target)))
        target = { ok: false, error: `${target.target} is not a file git tracks in this repo` };
      const outcome = plan({
        input: params,
        existing: await loadAll(where.dir),
        target,
        now: new Date().toISOString(),
        session: `pi:${ctx.sessionManager.getSessionId()}`,
      });
      if (outcome.kind === "error") return fail(outcome.text);
      if (outcome.kind === "write") await save(where.dir, outcome.suggestion);
      if (outcome.kind === "remove") await remove(where.dir, outcome.suggestion);
      await refresh(ctx);
      return {
        content: [{ type: "text" as const, text: outcome.text }],
        details: { ok: true },
      };
    },
    renderResult(result, _options, theme) {
      const first = result.content[0];
      const text = first?.type === "text" ? (first.text.split("\n")[0] ?? "") : "";
      const ok = (result.details as { ok?: boolean } | undefined)?.ok !== false;
      return new Text(theme.fg(ok ? "dim" : "warning", text), 0, 0);
    },
  });

  pi.registerCommand("docfix", {
    description: "Review the doc suggestions agents filed for this repo",
    handler: async (_args, ctx) => {
      const where = await place(ctx.cwd);
      if (typeof where === "string") return ctx.ui.notify(where, "warning");
      const load = () => loadAll(where.dir);
      if (!ctx.hasUI || ctx.mode !== "tui") {
        const queue = openQueue(await load());
        ctx.ui.notify(
          queue.length === 0
            ? "No open doc suggestions."
            : queue.map((s) => `${s.target}: ${s.claim} (${s.id})`).join("\n"),
          "info",
        );
        return;
      }
      const initial = await load();
      const empty = openQueue(initial).length === 0;
      const picked = await ctx.ui.custom<Suggestion[] | undefined>(
        (tui, theme, _keybindings, done) =>
          new DocsPanel(
            tui,
            theme,
            {
              load,
              dismiss: async (list) => {
                const now = new Date().toISOString();
                for (const s of list) await save(where.dir, dismiss(s, now));
                await refresh(ctx);
              },
            },
            initial,
            done,
          ),
        {
          overlay: true,
          // Two panes while there is a queue; the empty state is a small dialog.
          overlayOptions: empty
            ? overlayOptions("auto", EMPTY_TEXT.length + 4)
            : overlayOptions("split"),
        },
      );
      await refresh(ctx);
      if (!picked?.length) return;
      for (const [target, list] of byTarget(picked))
        pi.sendUserMessage(
          applyPrompt(target, list),
          ctx.isIdle() ? undefined : { deliverAs: "followUp" },
        );
    },
  });
}
