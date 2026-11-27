---
tagline: "The frame around pi's prompt: a title, the editor's top border with its readings, and the footer with the model and the checkout."
featured: false
requires:
  - "`git`, for the branch and its status"
  - "`gh`, for a branch's pull request"
order: 1
---

pi only. The session you started draws it; subagents don't, and neither does a headless run.

- **The top border** names the session (`/name`), carries pi's `↑3` hint when the draft is scrolled and pi's working spinner in front of the label, and says `failed` when the last turn ended on an error. It keeps pi's retry, compaction and branch-summary message in the label's place.
- **The border's readings**, on the right: the share of the model's window the session has used and the window itself, what the session was priced at, how fast the model answered, and the two chips that condense the transcript (tools, then thinking). The context pill opens pi's session tree, which is where a full window gets navigated.
- **The footer** answers what is running and where: the provider and the model, the effort when the model reasons, another extension's statuses, a cache that stopped holding, the checkout as `~/…/worktree`, and git — the branch, its dirty mark, an in-progress merge, untracked files, conflicts, and how far it is from its upstream.
- **The terminal title** is the label, the folder, how long the session has been going and, when it wants you, the state word.

Nothing here is a new command. The session's own name, pi's model picker, pi's thinking cycle and pi's session tree are reached through pi's own keybindings, and the checkout and the branch belong to the plugins that draw those experiences: a click invokes `/open` and `/git` through [`@agents/actions`](../../lib/shared/actions/README.md), so a click and a typed command open the same sheet and a draft in the prompt is left as it was. A click on a chip is one more press of ctrl+o or ctrl+t.

## Narrow terminals

The model and the checkout it is working in are what the footer is for, so they are the last things to give way. As the row narrows it drops, in this order: the provider's long name, another extension's statuses, the speed, the cost, the effort, the provider, the model's configured long name, the road to the checkout (keeping its own name), the branch's name (keeping its glyph), the alarms; then it truncates the model, and only at the very edge do the branch's glyph and the checkout go too. At 70 columns a session in a deep run folder still shows its model, its folder and its branch.

## What it needs

Only pi. It draws without any other plugin, and the controls that have no owner say so (`chrome: no /open plugin is installed`) instead of doing nothing. Beside [`open`](../open/), [`notes`](../notes/) and [`spellfix`](../spellfix/) it is the frame a session is written in:

- **open** owns `/open` and `/git`, which the footer's path and branch invoke.
- **notes** owns the checkout's notes; the frame draws no second entry point for them.
- **spellfix** underlines the draft's misspellings through the editor's bridge, whichever of the two plugins loads first.

No Agent Hub, no daemon and no desktop service is involved. Herdr is not needed either: the frame draws in an ordinary terminal, and inside a Herdr terminal nothing about it changes.

## Configuration

Nothing personal ships. The frame borrows pi's own theme, names no preferred model and assumes nothing about anyone's account, so it is installable with no configuration at all. What belongs to a machine is read from the JSON file `$PI_CHROME_CONFIG` names, and validated at that boundary: a field that does not parse is reported in the transcript (`chrome: <file> roles.effort: expected one of …`) and the neutral value stands in for it, so a typo costs a notification rather than the frame.

```json
{
  "roles": { "provider": "dim", "model": "dim", "effort": "thinking", "path": "dim" },
  "watched": ["anthropic"],
  "routed": ["auto/deepseek-v4.1-flash"],
  "names": { "deepseek-v4.1-flash": "DS Flash" }
}
```

| Key       | What it says                                                                                                                                                                                                                                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roles`   | Which of pi's colour roles each secondary word wears: `provider`, `model`, the `effort` chip, and the `path`'s road (the checkout's own name is always `text`). The effort chip defaults to `thinking`, pi's own colour for the level, which is what its editor border takes there; name a role to fix it instead. The others default to `dim`. |
| `watched` | Providers whose spend you watch. A model of theirs is drawn in `error`, so the one word that costs money is the one that reads as an alarm. Default: none.                                                                                                                                                                                      |
| `routed`  | Router models, as `provider/id`, whose physical provider is worth naming beside them. Default: none.                                                                                                                                                                                                                                            |
| `names`   | A short name for a model, by model id, used when the row is too narrow for the catalogue's name. Default: the catalogue name with lab names collapsed (`DeepSeek` → `DS`).                                                                                                                                                                      |

The palette itself, the models pi may use and what a session does with them stay pi's own settings; this file only says how the frame draws what pi reports.

## Missing is absent

A reading the host cannot give is left out: no context before pi measures one, no cost for a model that is free, no speed until a reply took long enough to measure, no cache rate from a provider that does not report caching, and no `0` standing in for any of them. What the frame shows as a cost is pi's own estimate from the model's published prices (`usage.cost`), not a statement about an account.

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

## What it leaves out

The Agent Hub registry, its waiting counts and its `/agents` control are not part of this app, and nothing here needs them. Neither are the personal prompts, delegation profiles, usage collection or telemetry of the configuration this was extracted from.
