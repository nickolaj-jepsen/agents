// @ts-nocheck — jiti strips types and no tsconfig reaches this asset.
/**
 * Replay provider: canned assistant turns, so an extension's tool and error paths run
 * deterministically without a model and without spending tokens.
 *
 * Usage:
 *   FIXTURE=$PWD/turns.json pi \
 *     --extension lib/tools/drive/assets/fixture-provider.ts \
 *     --provider fixture --model replay
 *
 * turns.json holds one entry per assistant turn, consumed in order; each carries any of
 * `text`, `thinking`, `toolCall` or `error`. Running past the end of the list is an error that
 * says so, rather than a silent empty reply.
 */

import {
  type Api,
  type AssistantMessage,
  type AssistantMessageEventStream,
  createAssistantMessageEventStream,
  type Model,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { fixedToolDuration } from "./fixed-tool-duration.ts";

interface TurnUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  /** What pi would price this reply at, in dollars; a session's cost adds these up. */
  cost?: number;
}

interface Turn {
  text?: string;
  thinking?: string;
  toolCall?: { name: string; arguments: unknown };
  error?: string;
  /** What the reply reports it used, so a plugin that reads cost, context or cache can be checked. */
  usage?: TurnUsage;
  /** Milliseconds to hold the stream open, so pi measures a reply long enough to have a speed. */
  delayMs?: number;
}

/** The model's own numbers, when a scenario needs one that reasons, prices or has a small window. */
function modelOverrides(): Partial<Model<Api>> {
  const raw = process.env.FIXTURE_MODEL;
  if (!raw) return {};
  return JSON.parse(raw) as Partial<Model<Api>>;
}

/** A second, third... model of the same provider, so a scenario can switch between them. */
function extraModels(): Partial<Model<Api>>[] {
  const raw = process.env.FIXTURE_MODELS;
  if (!raw) return [];
  return JSON.parse(raw) as Partial<Model<Api>>[];
}

// Pi reloads extensions when the session moves. Keep the replay position for this process.
const cursorKey = Symbol.for("agents.e2e.fixture-provider.cursor");

function loadTurns(): Turn[] {
  const path = process.env.FIXTURE;
  if (!path) throw new Error("fixture-provider: set FIXTURE to a JSON file of turns");
  const turns = JSON.parse(readFileSync(path, "utf8")) as Turn[];
  if (!Array.isArray(turns) || turns.length === 0)
    throw new Error(`fixture-provider: ${path} holds no turns`);
  return turns;
}

function streamFixture(model: Model<Api>): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

  (async () => {
    const turns = loadTurns();
    const index = globalThis[cursorKey] ?? 0;
    globalThis[cursorKey] = index + 1;
    const turn = turns[index];
    const output: AssistantMessage = {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "pending",
      timestamp: Date.now(),
    };

    try {
      if (!turn)
        throw new Error(`fixture-provider: turn ${index} requested but ${turns.length} exist`);
      if (turn.error) throw new Error(turn.error);

      stream.push({ type: "start", partial: output });

      if (turn.thinking) {
        const at = output.content.length;
        stream.push({ type: "thinking_start", contentIndex: at, partial: output });
        stream.push({
          type: "thinking_delta",
          contentIndex: at,
          delta: turn.thinking,
          partial: output,
        });
        output.content.push({ type: "thinking", thinking: turn.thinking });
        stream.push({
          type: "thinking_end",
          contentIndex: at,
          content: turn.thinking,
          partial: output,
        });
      }

      if (turn.text) {
        const at = output.content.length;
        stream.push({ type: "text_start", contentIndex: at, partial: output });
        stream.push({ type: "text_delta", contentIndex: at, delta: turn.text, partial: output });
        output.content.push({ type: "text", text: turn.text });
        stream.push({ type: "text_end", contentIndex: at, content: turn.text, partial: output });
      }

      if (turn.toolCall) {
        const at = output.content.length;
        const toolCall = {
          type: "toolCall" as const,
          id: `fixture-${index}`,
          name: turn.toolCall.name,
          arguments: turn.toolCall.arguments,
        };
        stream.push({ type: "toolcall_start", contentIndex: at, partial: output });
        stream.push({
          type: "toolcall_delta",
          contentIndex: at,
          delta: JSON.stringify(toolCall.arguments),
          partial: output,
        });
        output.content.push(toolCall);
        stream.push({ type: "toolcall_end", contentIndex: at, toolCall, partial: output });
      }

      if (turn.usage) {
        const usage = turn.usage;
        output.usage.input = usage.input ?? 0;
        output.usage.output = usage.output ?? 0;
        output.usage.cacheRead = usage.cacheRead ?? 0;
        output.usage.cacheWrite = usage.cacheWrite ?? 0;
        output.usage.totalTokens =
          output.usage.input +
          output.usage.output +
          output.usage.cacheRead +
          output.usage.cacheWrite;
        output.usage.cost.total = usage.cost ?? 0;
      }

      // pi measures a reply's duration on the stream it saw, so a hold here is what gives a
      // finished reply a measurable speed.
      if (turn.delayMs) await new Promise((resolve) => setTimeout(resolve, turn.delayMs));

      output.stopReason = turn.toolCall ? "toolUse" : "stop";
      stream.push({ type: "done", reason: output.stopReason, message: output });
      stream.end();
    } catch (error) {
      output.stopReason = "error";
      output.errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      stream.push({ type: "error", reason: "error", error: output });
      stream.end();
    }
  })();

  return stream;
}

export default function (pi: ExtensionAPI) {
  const duration = process.env.FIXTURE_TOOL_DURATION_MS;
  if (duration !== undefined) fixedToolDuration(pi, Number(duration));
  pi.registerProvider("fixture", {
    baseUrl: "http://fixture.invalid",
    apiKey: "fixture",
    api: "fixture-api",
    models: [
      {
        id: "replay",
        name: "Replay (fixture)",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
        ...modelOverrides(),
      },
      ...extraModels().map((model) => ({
        id: "replay",
        name: "Replay (fixture)",
        reasoning: false,
        input: ["text"] as const,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200000,
        maxTokens: 8192,
        ...model,
      })),
    ],
    streamSimple: streamFixture,
  });
}
