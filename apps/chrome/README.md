---
tagline: "The frame around pi's prompt: a title, the editor's top border and the footer with the model and the checkout."
featured: false
requires:
  - "`git`, for the branch and its status"
  - "`gh`, for a branch's pull request"
order: 1
---

pi only. The session you started draws it; subagents don't, and neither does a headless run.

- **The top border** names the session (`/name`), carries pi's `↑3` hint when the draft is scrolled, says `waiting` while a dialog holds a run and `failed` when the last turn ended on an error, and keeps pi's working spinner in front of it.
- **The footer** answers what is running and where: the provider and the model, the checkout as `~/…/worktree`, and git — the branch, its dirty mark, an in-progress rebase or merge, untracked files, and how far it is from its upstream.
- **The terminal title** is the label, the folder, how long the session has been going and, when it wants you, the state word.

Nothing here is a new command. The session's own name, pi's model picker and pi's thinking cycle are reached through pi's own keybindings, and the checkout and the branch belong to the plugins that draw those experiences: a click invokes `/open` and `/git` through [`@agents/actions`](../../lib/shared/actions/README.md), so a click and a typed command open the same sheet and a draft in the prompt is left as it was.

## What it needs

Only pi. It draws without any other plugin, and the controls that have no owner say so (`chrome: no /open plugin is installed`) instead of doing nothing. Beside [`open`](../open/), [`notes`](../notes/) and [`spellfix`](../spellfix/) it is the frame a session is written in:

- **open** owns `/open` and `/git`, which the footer's path and branch invoke.
- **notes** owns the checkout's notes; the frame draws no second entry point for them.
- **spellfix** underlines the draft's misspellings through the editor's bridge, whichever of the two plugins loads first.

No Agent Hub, no daemon and no desktop service is involved. Herdr is not needed either.

## The editor's bridge

Live underlining needs a hook on every drawn line and the draft when it changes, which pi's editor API does not offer. Publishing a frame publishes that pair on pi's event bus (`fireproof:editor-hooks:offer`), and a listener asks for one at session start (`fireproof:editor-hooks:request`), so load order alone decides nothing. A frame that publishes it offers:

```ts
type Bridge = {
  add(decorator: { decorateLine?(line: string): string; onEdit?(draft: Draft): void }): void;
  /** The editor on screen now; a frame builds a fresh one for every session. */
  current(): Draft | undefined;
};
```

The editor a decorator is handed is never one whose session has ended: a session's end detaches it, so a decorator that survives a `/reload` falls back to pi's own editor text rather than reaching through a dead one.

## Not yet

Unfinished, and listed last for it. The editor's border today carries the session's name and state and nothing else: the context, cost and speed readings, the two condense chips and the session-tree control, the alarms, the personal palette and the optional Herdr integration are still in the personal configuration this was extracted from, and arrive with the configuration contract that replaces it.
