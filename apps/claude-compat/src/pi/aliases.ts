/**
 * Claude Code's slash habits in pi, which matches built-in slash commands by
 * exact name, so muscle memory from other agents would land as a prompt.
 */
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// A name standing alone, so paths like /tmp/x never match; the separator after it is consumed.
const SKILL_TOKEN = /(?<=^|\s)\/(?:skill:)?([a-z0-9-]+)(?:$|[\s.,;:!?)])/g;

type Selection = {
  provider: string;
  model: string;
  thinking: ReturnType<ExtensionAPI["getThinkingLevel"]>;
};
const SELECTIONS = Symbol.for("agents.claude-compat.new-session-selections");
// Pi reloads extension modules on /new: a module-local variable would be lost.
// Keep only plain data, keyed by destination, never the outgoing pi/ctx objects.
const handoffs = globalThis as typeof globalThis & { [SELECTIONS]?: Map<string, Selection> };

export default function (pi: ExtensionAPI) {
  pi.on("session_shutdown", (event, ctx) => {
    if (event.reason !== "new" || !ctx.model) return;
    const selections = (handoffs[SELECTIONS] ??= new Map());
    selections.set(event.targetSessionFile ?? ctx.cwd, {
      provider: ctx.model.provider,
      model: ctx.model.id,
      thinking: pi.getThinkingLevel(),
    });
  });

  pi.on("session_start", async (event, ctx) => {
    const key = ctx.sessionManager.getSessionFile() ?? ctx.cwd;
    const selection = handoffs[SELECTIONS]?.get(key);
    handoffs[SELECTIONS]?.delete(key);
    if (event.reason !== "new" || !selection) return;
    const model = ctx.modelRegistry.find(selection.provider, selection.model);
    if (!model || !(await pi.setModel(model))) {
      ctx.ui.notify(
        "Could not retain the previous model; using the new session default",
        "warning",
      );
      return;
    }
    pi.setThinkingLevel(selection.thinking);
  });

  pi.registerCommand("clear", {
    description: "Start a new session (alias for /new)",
    handler: async (_args, ctx) => {
      await ctx.newSession();
    },
  });

  pi.registerCommand("effort", {
    description:
      "Set the thinking level: /effort <level>. Without one, show it and the allowed levels",
    handler: async (args, ctx) => {
      if (!ctx.model) {
        ctx.ui.notify("No model selected", "warning");
        return;
      }
      const allowed = getSupportedThinkingLevels(ctx.model);
      const wanted = args.trim().toLowerCase();
      const level = allowed.find((l) => l === wanted);
      if (!level) {
        const refused = wanted ? `No "${wanted}" effort on this model. ` : "";
        ctx.ui.notify(
          `${refused}Effort: ${pi.getThinkingLevel()} (allowed: ${allowed.join(", ")})`,
          refused ? "warning" : "info",
        );
        return;
      }
      pi.setThinkingLevel(level);
      ctx.ui.notify(`Effort: ${level}`, "info");
    },
  });

  // `/<skill>` anywhere invokes it: pi expands only a leading `/skill:<name>`, so hand it one with
  // the prompt as its arguments. The name must end at a space, which pi splits on.
  // A leading prompt template is left alone: pi expands it only while it starts the text.
  pi.on("input", (event) => {
    if (event.source === "extension" || event.text.startsWith("/skill:")) return;
    const commands = pi.getCommands();
    const first = event.text.match(/^\/(\S+)/)?.[1];
    if (commands.some((c) => c.source === "prompt" && c.name === first)) return;
    const skills = new Set(
      commands.filter((c) => c.source === "skill").map((c) => c.name.slice("skill:".length)),
    );
    const token = [...event.text.matchAll(SKILL_TOKEN)].find((m) => skills.has(m[1] ?? ""));
    if (!token) return;
    const text =
      token.index === 0
        ? `/skill:${token[1]} ${event.text.slice(token[0].length)}`
        : `/skill:${token[1]} ${event.text}`;
    return { action: "transform", text };
  });
}
