---
status: accepted
---

# The notes plugin links the store; there is no CLI

A checkout sees its store through one link, `.agents/store`, and the `notes` plugin creates it: at session start and whenever the session's checkout changes. The store's name is written once to `agents-store-id` in the repository's common git directory, so every worktree reads the same name and a moved repository keeps its store. We chose this over a command-line tool so that the plugin works for anyone who installs it, with no git hook, wrapper or timer to set up beside it.

## Considered Options

- **A CLI in this flake, shared with the plugin.** It would keep the git hook, so a worktree is linked the moment it is created, and it could give a harness its scratch and memory directories before it starts. Rejected: it is a second thing to install and wire, and everything it did before a session starts was given up instead (see Consequences).
- **Recomputing the name from the checkout's path.** No file to write, but moving the repository orphans its store.
- **Naming the store after the git remote.** Survives a move, but forks collide and a repository without a remote has no name.

## Consequences

- A worktree nobody has opened a session in has no link. A skill that writes there first makes a real `.agents/store` directory; the plugin moves an untracked one into the store and links it, and leaves a tracked one alone with a notice.
- Skills write under `.agents/store/` and create it if it is missing, so without the plugin the files land in the checkout.
- The plugin writes its own ignore rule to the common git directory's `info/exclude`.
- Scratch is not the store's concern: harnesses use the system's temporary directory, and nothing is reaped per repository.
- Memory stays where each harness keeps it. `notes` reads it there and never moves it, so a project used under two Claude configuration directories has two memories.
