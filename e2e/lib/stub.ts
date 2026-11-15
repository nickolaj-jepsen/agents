/**
 * A replay stub of the Anthropic Messages API, so a Claude scenario gets canned assistant
 * turns instead of a real model. Run as `node stub.ts <turns.json>` it listens on a free
 * port of 127.0.0.1 and prints the port; `startStub` spawns it detached, so a parked
 * `goto` session keeps its model between invocations.
 *
 * Rules: localhost only, headers (the sign-in's token among them) are never read, logged
 * or forwarded, and nothing leaves the machine.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ServerResponse } from "node:http";
import type { Turn } from "./harness.ts";

type Block =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

let counter = 0;
const uid = () => (++counter).toString(36).padStart(6, "0");

const blocksOf = (turn: Turn): Block[] => [
  ...(turn.thinking ? [{ type: "thinking" as const, thinking: turn.thinking }] : []),
  ...(turn.text ? [{ type: "text" as const, text: turn.text }] : []),
  ...(turn.toolCall
    ? [
        {
          type: "tool_use" as const,
          id: `toolu_stub${uid()}`,
          name: turn.toolCall.name,
          input: turn.toolCall.arguments ?? {},
        },
      ]
    : []),
];

const event = (res: ServerResponse, name: string, data: unknown) =>
  res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

function reply(res: ServerResponse, model: string, content: Block[], stream: boolean) {
  const usage = { input_tokens: 10, output_tokens: 5 };
  const stop = content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
  const message = {
    id: `msg_stub${uid()}`,
    type: "message",
    role: "assistant",
    model,
    content: [] as Block[],
    stop_reason: null as string | null,
    stop_sequence: null,
    usage,
  };
  if (!stream) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ...message, content: content.map(withSignature), stop_reason: stop }));
    return;
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  event(res, "message_start", { type: "message_start", message });
  content.forEach((b, index) => {
    const start =
      b.type === "text"
        ? { type: "text", text: "" }
        : b.type === "thinking"
          ? { type: "thinking", thinking: "", signature: "" }
          : { ...b, input: {} };
    event(res, "content_block_start", { type: "content_block_start", index, content_block: start });
    const delta =
      b.type === "text"
        ? { type: "text_delta", text: b.text }
        : b.type === "thinking"
          ? { type: "thinking_delta", thinking: b.thinking }
          : { type: "input_json_delta", partial_json: JSON.stringify(b.input) };
    event(res, "content_block_delta", { type: "content_block_delta", index, delta });
    if (b.type === "thinking")
      event(res, "content_block_delta", {
        type: "content_block_delta",
        index,
        delta: { type: "signature_delta", signature: "stub" },
      });
    event(res, "content_block_stop", { type: "content_block_stop", index });
  });
  event(res, "message_delta", {
    type: "message_delta",
    delta: { stop_reason: stop, stop_sequence: null },
    usage: { output_tokens: 5 },
  });
  event(res, "message_stop", { type: "message_stop" });
  res.end();
}

const withSignature = (b: Block) => (b.type === "thinking" ? { ...b, signature: "stub" } : b);

function serve(turns: Turn[]) {
  let next = 0;
  return createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      let body: { model?: string; stream?: boolean; tools?: unknown[]; max_tokens?: number } = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
      } catch {
        /* not JSON: a probe */
      }
      const path = (req.url ?? "").split("?")[0] ?? "";
      const model = body.model ?? "stub";
      const json = (code: number, text: string) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(text);
      };
      if (req.method === "POST" && path.endsWith("/messages/count_tokens"))
        return json(200, '{"input_tokens":10}');
      if (req.method === "POST" && path.endsWith("/messages")) {
        // A side call (the startup probe, a title): no tools or a tiny budget. Not a scripted turn.
        if (!body.tools?.length || (body.max_tokens ?? Infinity) <= 64)
          return reply(res, model, [{ type: "text", text: "Stub" }], !!body.stream);
        const turn = turns[next++];
        if (!turn)
          return reply(
            res,
            model,
            [{ type: "text", text: "(stub: no more turns)" }],
            !!body.stream,
          );
        // Claude Code retries a 5xx, which then takes the next turn; a 4xx is shown.
        if (turn.error)
          return json(
            400,
            JSON.stringify({
              type: "error",
              error: { type: "invalid_request_error", message: turn.error },
            }),
          );
        return reply(res, model, blocksOf(turn), !!body.stream);
      }
      json(404, '{"type":"error","error":{"type":"not_found_error","message":"stub"}}');
    });
  });
}

if (process.argv[1]?.endsWith("stub.ts")) {
  const file = process.argv[2];
  if (!file) throw new Error("usage: node stub.ts <turns.json> [pid to outlive]");
  // A test run that is killed can't stop its stubs, so each one watches the run and goes with it.
  const owner = Number(process.argv[3]);
  if (owner)
    setInterval(() => {
      try {
        process.kill(owner, 0);
      } catch {
        process.exit(0);
      }
    }, 2000).unref();
  const server = serve(JSON.parse(readFileSync(file, "utf8")) as Turn[]);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    console.log(typeof address === "object" && address ? address.port : 0);
  });
}

const PID = "stub.pid";

/**
 * Starts the stub for a run folder and returns its port. `stopStub` ends it. With `owner`, a
 * process id, it also ends when that process does; without, it outlives this one, as a parked
 * `goto` session needs.
 */
export async function startStub(runDir: string, turns: Turn[], owner?: number): Promise<number> {
  const file = join(runDir, "stub-turns.json");
  writeFileSync(file, JSON.stringify(turns));
  const args = [import.meta.filename, file, ...(owner ? [String(owner)] : [])];
  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  writeFileSync(join(runDir, PID), String(child.pid));
  const port = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", () => reject(new Error("the stub exited before it listened")));
    child.stdout.once("data", (d: Buffer) => resolve(Number(d.toString().trim())));
  });
  child.stdout.destroy();
  child.unref();
  return port;
}

/** Ends the stub a run folder started, if it did. */
export function stopStub(runDir: string) {
  try {
    if (!readdirSync(runDir).includes(PID)) return;
    process.kill(Number(readFileSync(join(runDir, PID), "utf8")), "SIGTERM");
  } catch {
    /* already gone */
  }
}
