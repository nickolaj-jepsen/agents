/**
 * The dialog open on the agent's behalf, as the one-line label the registry carries in
 * `waitingFor`. pi reports every prompt it raises, so this needs nothing of the host beyond
 * `ui_prompt_start` and `ui_prompt_end`; a finished run closes whatever is left.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { clip, oneLine } from "./format.ts";

// The cap on a label, which the registry carries as `waitingFor`.
const LABEL_MAX = 200;

export const createDialogs = (pi: ExtensionAPI) => {
  // The label of the prompt open now; pi nests them under one start/end pair.
  let label: string | undefined;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };
  const clear = () => {
    if (label === undefined) return;
    label = undefined;
    notify();
  };

  pi.on("ui_prompt_start", (event) => {
    label = clip(oneLine(event.title ?? `${event.kind} prompt`), LABEL_MAX);
    notify();
  });
  pi.on("ui_prompt_end", clear);
  pi.on("agent_settled", clear);
  pi.on("session_shutdown", clear);

  return {
    /** The label of the dialog the session waits on, or undefined when none is open. */
    current: (): string | undefined => label,
    /** Calls `listener` whenever a dialog opens or closes. */
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type Dialogs = ReturnType<typeof createDialogs>;
