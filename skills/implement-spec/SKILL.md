---
name: implement-spec
description: "Implement a workflow’s ticket graph on an integration branch."
disable-model-invocation: true
metadata:
  summary: "Implement a workflow’s ticket graph on an integration branch."
  category: modified-public
  credit: "Adapted from [Matt Pocock’s implement-spec](https://github.com/mattpocock/skills)."
---

Use the [workflow notes convention](../to-spec/workflow-notes.md) to resolve `.agents/workflows/<slug>/`.

Read `spec.md` and `tickets/*.md`. Treat blockers as a graph: stop and report cycles or missing tickets. Skip tickets marked done. Capture the starting commit and use a dedicated integration branch. Confirm the test seams with the user if the spec leaves them open.

Work only `ready-for-agent` tickets whose blockers are satisfied. Leave other statuses alone. If no more tickets can run and the spec is incomplete, report the outstanding decisions or blockers instead of declaring the spec done. Give each implementer a fresh context and isolated worktree based on the integration tip. Pass absolute paths to the spec, ticket, research notes and [TDD procedure](../tdd/SKILL.md). Parallelize independent tickets only when authorized. Have workers test and commit their own changes. Rebase each completed branch onto the integration tip, run the affected checks, and fast-forward it into the integration branch. Release dependent tickets only after their blockers are integrated. On failure leave the ticket open and keep the worktree for inspection.

When all work is integrated, follow [code review](../code-review/SKILL.md) against the starting commit and spec. Resolve findings, run the full suite and mark verified tickets **Status: done**. Report the branch and checks. Remove only clean worker worktrees created for this run; leave the integration branch for the user. Do not push or open a PR unless asked.
