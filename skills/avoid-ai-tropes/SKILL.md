---
name: avoid-ai-tropes
description: >-
  Review human-facing prose (docs, READMEs, PR and commit descriptions, comments, release notes, a draft reply) against a catalog of recognizable AI writing tells, such as "delve", "it's not X -- it's Y", em-dash addiction, bold-first bullets and signposted conclusions, and rewrite it so it reads like a human wrote it. Optional target arg: diff (default), branch, or a path.
disable-model-invocation: true
argument-hint: "[diff|branch|<path>]"
arguments: target
metadata:
  summary: "finds AI writing tells in prose and rewrites them."
  category: modified-public
  credit: "Its catalog comes from [tropes.fyi](https://tropes.fyi) by [ossama.is](https://ossama.is)."
---

# Avoid AI tropes

The catalog of tells in [references/catalog.md](references/catalog.md) comes from [tropes.fyi](https://tropes.fyi) by [ossama.is](https://ossama.is).

## Target

`$target` selects the prose to review (default `diff` when empty):

- `diff` (default): prose added or changed in the uncommitted diff (`git diff HEAD`). With a clean tree, the last draft you wrote in this conversation, such as a PR description or a reply meant to be published.
- `branch`: prose changed on this branch vs the default branch.
- a path: that file or directory.

Prose means documentation, READMEs, blog posts, PR and commit descriptions, comments, release notes. Leave code, generated and vendored files alone.

## How to review

1. Read [references/catalog.md](references/catalog.md) and check the draft against every trope in it.
2. Read the passage as someone trying to use it. A bold command name can help them find an entry. A bold label on each line of a three-line recipe can make it harder to copy and run.
3. Keep useful local names and formats. Rewrite the parts that obscure the meaning, even when nearby entries use the same phrasing. Give independent facts their own sentences. When the user asks for replacement copy, return the copy without a defense of the edit.
