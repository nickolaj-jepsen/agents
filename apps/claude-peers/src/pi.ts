/**
 * Makes this pi session a peer in Claude Code's cross-session messaging: it joins Claude's session
 * registry and inbox sockets, and gives the model `list_agents` and `send_message` to reach the
 * Claude Code and other pi sessions on this machine.
 *
 * The session owns everything it publishes; an optional adapter can add the handful of fields a
 * host knows and a registry cannot (`src/pi/peers/metadata.ts`).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import claudePeers from "./pi/peers/session.ts";

export default function (pi: ExtensionAPI) {
  claudePeers(pi);
}
