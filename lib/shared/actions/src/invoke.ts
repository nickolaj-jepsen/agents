/**
 * The checkout actions, invoked by a plugin that draws a control for one but owns none of them.
 *
 * A frame around pi's editor offers the folder, the git menu and the notes, and its controls must
 * do what the commands do: `/open`, `/git` and `/notes` are registered by the plugin that draws
 * each experience (`apps/open` and `apps/notes`), and a second registration of the same name would
 * be two owners whose rows could drift. So a frame keeps no copy: a control invokes the command the
 * owner registered, through pi's own command path, and the person gets the same sheet, the same
 * rows and the same words a typed command gives.
 *
 * Dispatch is pi's command path and not a prompt: no turn starts and the draft in the prompt is
 * left as it was, which is what a person clicking a control beside their half-written prompt
 * expects. A name that only a prompt template or a skill has is refused, since pi would expand it
 * into a prompt to the model instead.
 */

/** A command as pi's list gives it: its name, and where it came from (`extension`, `prompt`, `skill`). */
export type Command = { name: string; source: string };

/** What invoking an action asks of pi: what is registered, and the command path that runs it. */
export type ActionHost = {
  getCommands(): readonly Command[];
  sendUserMessage(text: string, options: { expandPromptTemplates: boolean }): void;
};

/** The actions of a checkout: the folder, its forge, and its notes, each with one owner. */
export const ACTIONS = ["open", "git", "notes"] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * Runs `/<action>` the way its own command does, and returns whether a plugin was there to run it:
 * false when none registered it, so the caller can say which part of its frame has nothing behind
 * it.
 */
export const invokeAction = (host: ActionHost, action: Action): boolean => {
  const owned = host.getCommands().some((c) => c.name === action && c.source === "extension");
  if (!owned) return false;
  host.sendUserMessage(`/${action}`, { expandPromptTemplates: true });
  return true;
};
