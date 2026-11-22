/**
 * The stand-in Linear server signed out: it lists only the `authenticate` stub a real one shows
 * before sign-in, so linear-issue finds a Linear server but none that can file. The draft waits
 * for one to connect (drafting), then fails with the mod's own message.
 */
import { createInterface } from "node:readline";

import { handle } from "../lib/linear-mcp.ts";

const AUTH = {
  name: "authenticate",
  description: "Sign in to Linear.",
  inputSchema: { type: "object" },
};

createInterface({ input: process.stdin }).on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.method === "tools/list" && msg.id !== undefined)
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [AUTH] } })}\n`,
      );
    else handle(msg);
  } catch {
    /* not JSON: ignore */
  }
});
