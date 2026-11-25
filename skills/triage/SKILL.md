---
name: triage
description: Review local workflow tickets, resolve open questions, and decide who can take each one.
disable-model-invocation: true
metadata:
  version: 0.1.0
  summary: Review workflow tickets and prepare them for an agent or a human.
  category: modified-public
  credit: "Adapted from [Matt Pocock’s triage](https://github.com/mattpocock/skills)."
---

# Triage

Use the [workflow notes convention](../to-spec/workflow-notes.md). Work on `tickets/*.md` in the selected workflow. The ticket file is the record: no GitHub labels, comments, PRs or setup command.

## Show the queue

Without a ticket number, list what needs attention: tickets with no status, `needs-triage` tickets, and `needs-info` tickets with a new answer to an outstanding question. Show the number, title, and why each needs attention. If the user asks what an agent can pick up, list only `ready-for-agent` tickets whose blockers are done. Listing is read-only.

## Decide a ticket

1. Read the ticket, spec, and prior triage notes. Check whether the behavior already exists and whether a similar request was rejected; surface the evidence rather than assuming the old decision still holds. For a bug, verify the reported behavior if feasible, and distinguish what you observed from what was reported.
2. Recommend a category (`bug` or `enhancement`) and one status from the table. Explain why. If the request is ambiguous, ask only the questions that would change the decision. For a longer design interview, use [grill-with-docs](../grill-with-docs/SKILL.md).
3. Wait for the maintainer’s decision before editing. An explicit “move ticket 03 to needs-info” is already a decision; don’t start another interview. If status fields conflict, the target is unclear, or the ticket is already done, ask before changing it.

| Status            | When to use it                                                      | What to record                                                                                                   |
| ----------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `needs-triage`    | New request or fresh information to evaluate                        | What still needs a decision.                                                                                     |
| `needs-info`      | A decision depends on an answer from the reporter                   | Facts already established and specific unanswered questions. When answered, return to triage.                    |
| `ready-for-agent` | An agent can implement the request without further decisions        | Current and desired behavior, testable acceptance criteria, and scope limits. Reuse a sufficient existing brief. |
| `ready-for-human` | Implementation needs a human                                        | The same brief, plus what needs human judgment, access, or manual testing.                                       |
| `wontfix`         | The maintainer declines the request, or the behavior already exists | The reason for rejection, or where to find the existing behavior. Keep the ticket for future searches.           |

Keep exactly one `**Category:**` and one `**Status:**` field per triaged ticket. Preserve its number, blockers, acceptance criteria, and prior decisions; put new findings under **Triage notes**. A ready status is an assignment decision, not proof the blockers are done. `done` records completed implementation, not a sixth triage choice. Report the ticket path and the status change.
