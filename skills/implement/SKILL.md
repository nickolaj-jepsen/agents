---
name: implement
description: "Implement a ticket at agreed seams and review the change."
disable-model-invocation: true
metadata:
  summary: "Implement a ticket at agreed seams and review the change."
  category: modified-public
  credit: "Adapted from [Matt Pocock’s implement](https://github.com/mattpocock/skills)."
---

Use the [workflow notes convention](../to-spec/workflow-notes.md) to resolve `.agents/workflows/<slug>/`.

Read the requested spec or ticket and state its title. Ask if the reference is ambiguous. For a workflow ticket, proceed only if its status is `ready-for-agent` and its blockers are done. Otherwise report the status or blocker; do not silently reclassify it. Capture the starting commit for review. Follow [TDD](../tdd/SKILL.md) at the pre-agreed seams. Run targeted tests and type checks as you go, then the full suite. Commit only your changes on the working branch.

Follow [code review](../code-review/SKILL.md) from the starting commit against this spec or ticket. Fix verified findings and rerun affected checks. Mark the ticket **Status: done** only once its acceptance criteria pass. Report the commit, checks and anything unresolved.
