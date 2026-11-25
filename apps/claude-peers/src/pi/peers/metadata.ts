/**
 * How a host adapter adds what only it knows to this session's registry entry.
 *
 * The plugin owns the entry's core: the pid, the session id, the socket, the status and the idle
 * queue. Anything about the machine it is hosted in (why a turn failed, whether a peer woke it,
 * whether to hide it, which tmux pane it runs in) is the adapter's, and reaches the entry through
 * two events on pi's shared bus:
 *
 * 1. Once the registry is initialized, the plugin emits `registry-request` with `{ protocol: 1 }`.
 *    An adapter answers with `registry-metadata`; it also emits that on session start, `agent_start`
 *    and `agent_settled`, so a plugin that loaded after it hears the current state either way.
 * 2. `registry-metadata` carries `{ protocol: 1, metadata: { ... } }`. The metadata is the whole of
 *    it, not a patch: a key the adapter leaves out is cleared, which is how stale hub fields go
 *    away. Only the keys below are read; a payload cannot touch the plugin's own fields.
 *
 * With no adapter the entry carries core fields only, and there is no other difference.
 */
import { clip, oneLine } from "./format.ts";

/** Emitted by this plugin once its registry entry is written; an adapter answers with metadata. */
export const REGISTRY_REQUEST = "agents:claude-peers:registry-request";
/** Emitted by an adapter with the whole metadata; this plugin listens. */
export const REGISTRY_METADATA = "agents:claude-peers:registry-metadata";
/**
 * Emitted by this plugin when an inbound message is waiting for the person's approval, so a host
 * can say the session is waiting rather than working. One transition per state, not one per dialog:
 * `waiting: true` when the first approval opens, `false` when the last closes, and `false` at
 * shutdown. It is a notification only; the dialog and its answer stay this plugin's.
 */
export const APPROVAL_STATE = "agents:claude-peers:approval-state";
/** The version of both, so a half that speaks another one is ignored rather than misread. */
export const REGISTRY_PROTOCOL = 1;

/** What an adapter may say about the session, all of it optional. */
export type RegistryMetadata = {
  /** Why the last turn failed, until the next one starts. */
  hubFailed?: string;
  /** A peer's message woke the running turn. */
  hubPeer?: boolean;
  /** Keep this session off the agent hub's bar. */
  hubHidden?: boolean;
  /** The tmux pane the session runs in. */
  tmux?: string;
};

/** The only keys an adapter can reach the entry with. */
export const METADATA_KEYS = ["hubFailed", "hubPeer", "hubHidden", "tmux"] as const;

// Long enough for an error message, short enough that a registry entry stays readable.
const TEXT_MAX = 200;

const text = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const clean = clip(oneLine(value), TEXT_MAX);
  return clean || undefined;
};

/**
 * The metadata a `registry-metadata` payload carries, or undefined for a payload this plugin does
 * not speak (another protocol, or not an object at all). An allowed key that is missing, undefined,
 * null, false or blank is absent from the result, and the entry loses that field.
 */
export function readRegistryMetadata(payload: unknown): RegistryMetadata | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const { protocol, metadata } = payload as { protocol?: unknown; metadata?: unknown };
  if (protocol !== REGISTRY_PROTOCOL) return undefined;
  if (!metadata || typeof metadata !== "object") return {};
  const source = metadata as Record<string, unknown>;
  const out: RegistryMetadata = {};
  const failed = text(source.hubFailed);
  if (failed) out.hubFailed = failed;
  if (source.hubPeer === true) out.hubPeer = true;
  if (source.hubHidden === true) out.hubHidden = true;
  const tmux = text(source.tmux);
  if (tmux) out.tmux = tmux;
  return out;
}

/** The payload this plugin emits to ask for metadata. */
export const registryRequest = (): { protocol: number } => ({ protocol: REGISTRY_PROTOCOL });

/** The payload this plugin emits around an inbound approval. */
export const approvalState = (waiting: boolean): { protocol: number; waiting: boolean } => ({
  protocol: REGISTRY_PROTOCOL,
  waiting,
});
