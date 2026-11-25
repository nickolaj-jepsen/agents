---
tagline: "Make a pi session a peer in Claude Code's cross-session messaging, on this machine."
featured: false
requires:
  - "Claude Code, for the sessions on the other end of a message"
order: 11
---

pi only. The session you started has it; subagents don't.

- The session joins Claude Code's session registry and binds its own inbox socket, so a Claude Code
  session's `SendMessage` and `/list-agents` reach it, and a message from another session arrives in
  this transcript.
- `list_agents` and `send_message` let the agent reach the Claude Code and pi sessions on this
  machine: by name, `name [shortid]`, session id or reply address. `notify_when_idle` asks for one
  notice when the target next goes idle or exits.
- A message from a session that skips permission prompts is held: pi asks you before it is
  delivered, and a sender that does not say which mode it is in is held the same way. Nothing a peer
  sends can approve anything or change configuration.
- A message that arrives while the agent is idle waits for your next prompt rather than spending a
  turn; a busy session is steered with it. Repeated and burst messages from one sender are dropped
  with a receipt, and so is a message past what this session can hold (50 waiting for your prompt,
  four approvals on screen).

Same machine only. Unix sockets only, so not on Windows. The session registers in every Claude
profile on the machine — `CLAUDE_CONFIG_DIR` when it is set, `~/.claude`, and each `~/.claude-*`
profile that already has a registry — so a login signed in to any of them sees it. It never reads a
hub's environment variables, and writes nothing but its own registry entry.

## What is documented, and what was read off a binary

[Claude Code's cross-session messaging docs](https://code.claude.com/docs/en/cross-session-messaging)
describe what the two ends mean: a session registry, `SendMessage`, `/list-agents`, permission
classes. The wire is not documented, so everything here — the registry file and its fields, the
`cc-socks` socket directory, the newline-delimited JSON frames and the `<cross-session-message>`
envelope — was read out of Claude Code 2.1.331. A future release may change any of it, and this
plugin has no way to notice.

This repository tests the protocol against itself, not against a running Claude Code: the specs
cover frames, byte caps, addressing and the registry, and a pi session with nothing but this plugin
is driven to show it starting, registering and answering `list_agents`. A real exchange with a live
Claude Code session is worth doing before trusting it, and is not claimed here.

## What a host adapter can add

The plugin owns its registry entry: pid, session id, socket, status (`busy`, `waiting`, `idle`), the
dialog a waiting session waits on, and the idle queue. A host can add a few fields of its own and
hear when the session is waiting on you, through pi's event bus, and nothing else:

| Event                                   | Direction        | Payload                                      |
| --------------------------------------- | ---------------- | -------------------------------------------- |
| `agents:claude-peers:registry-request`  | plugin → adapter | `{ protocol: 1 }`, once the entry is written |
| `agents:claude-peers:registry-metadata` | adapter → plugin | `{ protocol: 1, metadata: { ... } }`         |
| `agents:claude-peers:approval-state`    | plugin → adapter | `{ protocol: 1, waiting: boolean }`          |

`metadata` is the whole of what the adapter knows, not a patch: the keys are `hubFailed` (why the
last turn failed), `hubPeer` (a peer woke the running turn), `hubHidden` (keep the session off the
agent hub's bar) and `tmux` (the pane it runs in). A key the adapter leaves out — or sets to
undefined, null, `false` or blank — is cleared, so stale hub fields go away. Everything else in the
entry belongs to the plugin, and a repeated core field in the metadata is ignored.

`approval-state` is a notification, not a hook: it is `waiting: true` once the first inbound approval
opens and `false` once the last closes (or the session shuts down), so a host can say the session
waits on you while the dialog is up. The dialog, its timeout and its answer stay the plugin's.

With no adapter the entry carries core fields only, and there is no other difference.
