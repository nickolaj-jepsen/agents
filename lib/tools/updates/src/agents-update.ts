import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { writeJsonAtomic } from "./core/json.ts";
import {
  requestFilePath,
  requestsDir,
  sessionFilePath,
  sessionsDir,
  stateDir,
} from "./core/paths.ts";
import { type ReloadRequest, parseReloadRequest, sessionRecord } from "./core/protocol.ts";

const run = promisify(execFile);
const pendingKey = "AGENTS_PENDING_RELOAD";

/** Private, opt-in control channel; peer messages must never execute reload commands. */
export default function (pi: ExtensionAPI) {
  const refresh = process.env.AGENTS_REFRESH;
  if (process.env.AGENTS_UPDATES_ENABLED !== "1" || !refresh) return;
  const state = stateDir(process.env);
  const token = process.env.AGENTS_BRIDGE_TOKEN ?? randomUUID();
  process.env.AGENTS_BRIDGE_TOKEN = token;
  const registry = sessionFilePath(state, process.pid, token);
  const requestPath = requestFilePath(state, process.pid, token);
  const ackPath = `${requestPath}.ack`;
  const command = `agents-apply-update-${token}`;
  let timer: ReturnType<typeof setInterval> | undefined;
  let queued = false;
  let queuedAt = 0;
  let applying = false;
  let context: ExtensionContext | undefined;

  // The same files the CLI and the refresh helper read: atomic rename, 0600, JSON.
  function put(path: string, value: unknown) {
    writeJsonAtomic(path, value, { mode: 0o600, sync: false });
  }
  function advertise(ctx: ExtensionContext) {
    put(
      registry,
      sessionRecord(process.pid, ctx.sessionManager.getSessionId(), ctx.isIdle(), requestPath),
    );
  }
  function poll() {
    if (!context || applying || !context.isIdle()) return;
    // Interrupted input can drop a dispatch without throwing; retry it when idle.
    if (queued && Date.now() - queuedAt < 10_000) return;
    if (!existsSync(requestPath)) return;
    queued = true;
    queuedAt = Date.now();
    try {
      pi.sendUserMessage(`/${command}`, { expandPromptTemplates: true });
    } catch {
      queued = false;
    } // Dispatch failure must not wedge subsequent requests.
  }

  pi.registerCommand(command, {
    description: "Apply an explicit local plugin update when idle",
    handler: async (_args, ctx) => {
      if (applying) return;
      if (!ctx.isIdle()) {
        queued = false;
        return;
      }
      // Claim before reading: never unlink a newer request published concurrently.
      const claimed = `${requestPath}.processing`;
      try {
        renameSync(requestPath, claimed);
      } catch {
        queued = false;
        return;
      }
      let request: ReloadRequest;
      try {
        request = parseReloadRequest(JSON.parse(readFileSync(claimed, "utf8")));
      } catch (error) {
        put(ackPath, {
          id: null,
          status: "failed",
          message: `Malformed reload request: ${String(error)}`,
        });
        rmSync(claimed, { force: true });
        queued = false;
        return;
      }
      applying = true;
      try {
        await run(refresh, [], { timeout: 120_000 });
        if (!ctx.isIdle()) throw new Error("Session became busy before reload; retry when idle");
        // Only the replacement runtime may acknowledge a completed reload.
        process.env[pendingKey] = JSON.stringify({ id: request.id, ackPath });
        await ctx.reload();
        return;
      } catch (error) {
        delete process.env[pendingKey];
        const stderr =
          error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
        put(ackPath, {
          id: request.id,
          status: "failed",
          message: `${String(error)}${stderr ? `\n${stderr}` : ""}`,
        });
      } finally {
        applying = false;
        queued = false;
        rmSync(claimed, { force: true });
      }
    },
  });

  pi.on("session_start", (event, ctx) => {
    if (!ctx.hasUI) {
      const pending = process.env[pendingKey];
      if (pending) {
        const ack = JSON.parse(pending);
        put(ack.ackPath, {
          id: ack.id,
          status: "failed",
          message: "Replacement runtime has no interactive reload bridge",
        });
        delete process.env[pendingKey];
      }
      return;
    }
    mkdirSync(sessionsDir(state), { recursive: true, mode: 0o700 });
    mkdirSync(requestsDir(state), { recursive: true, mode: 0o700 });
    const pending = process.env[pendingKey];
    if (pending) {
      const ack = JSON.parse(pending);
      put(ack.ackPath, {
        id: ack.id,
        status: event.reason === "reload" ? "applied" : "failed",
        message:
          event.reason === "reload"
            ? "Runtime reloaded; inspect extension errors separately"
            : "Session replaced before reload completed",
      });
      delete process.env[pendingKey];
    }
    context = ctx;
    advertise(ctx);
    timer = setInterval(poll, 500).unref();
  });
  pi.on("agent_start", (_event, ctx) => {
    if (context) advertise(ctx);
  });
  pi.on("agent_settled", (_event, ctx) => {
    if (context) {
      advertise(ctx);
      poll();
    }
  });
  pi.on("session_shutdown", (event) => {
    clearInterval(timer);
    context = undefined;
    if (event.reason !== "reload") {
      rmSync(registry, { force: true });
      rmSync(requestPath, { force: true });
    }
  });
}
