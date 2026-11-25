# Agent plugins

Plugins and skills for coding-agent harnesses. These are the words for what an agent leaves behind in a project, outside its code.

## Language

**Store**:
The per-repository directory, outside git and shared by all the repository's worktrees, where skills and agents write their files.
_Avoid_: Skill store, notes folder, agent-notes

**Note**:
A Markdown or HTML document in the store.
_Avoid_: Plan (a plan is one kind of note), doc

**Artefact**:
Any file in the store that is not a note, such as a screenshot.
_Avoid_: Attachment, asset

**Memory**:
What a harness itself saves about a project between sessions. It sits beside the store and only the harness writes it.
_Avoid_: Notes (for harness memory)
