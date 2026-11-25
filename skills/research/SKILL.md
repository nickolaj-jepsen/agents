---
name: research
description: "Save findings from primary sources to the workflow notes."
disable-model-invocation: true
metadata:
  version: 0.1.0
  summary: "Save findings from primary sources to the workflow notes."
  category: modified-public
  credit: "Adapted from [Matt Pocock’s research](https://github.com/mattpocock/skills)."
---

Use the [workflow notes convention](../to-spec/workflow-notes.md) to resolve `.agents/workflows/<slug>/`.

Spin up a **background agent** to do the research, so you keep working while it reads. Start it with a fresh context window.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it as `research.md` in the workflow folder. Pass the researcher the resolved absolute path and report it when the findings are ready.
