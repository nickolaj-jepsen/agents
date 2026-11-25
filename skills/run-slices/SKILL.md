---
name: run-slices
description: Build a plan written by /slices, unattended, on one branch — work its slices in order with one writer at a time, give each slice to a fresh worker, re-run its check yourself, escalate instead of retrying, and review the first slice and the whole branch once each. Stops only for an owner decision or an irreversible step. Use when the user asks to run, build, execute or resume a sliced plan.
disable-model-invocation: true
argument-hint: "[plan-dir]"
metadata:
  version: 0.1.0
  summary: "builds a sliced plan one slice at a time on one branch, re-checking each and escalating instead of retrying."
  category: plan-build-ship
---

# run-slices

- You are the lead. You decide who builds each slice, check the result yourself, and keep the run moving until the plan's "Done when" passes.
- `SLICES.md` is the plan. Revise its Slices, Later and Interfaces as the build teaches you. Its Goal, Scope and Owner decisions change only on the owner's word, recorded there with the date.
- `PROGRESS.md` is your state, and how you resume after a context reset.
- The run is unattended from start to finish.

## Start or resume

1. **Resolve the directory.** If none is given, take the most recently modified `plans/<slug>/` holding a `SLICES.md` in the project's store, skipping `plans/history/`, and confirm it before starting. The store is `.agents/store/` at the checkout's root, shared by all its checkouts when the notes plugin is installed.
2. **Read `SLICES.md` in full.** Read `notes/` files only when a slice needs them.
3. **Resume** if `PROGRESS.md` exists. Resolve the recorded worktree, branch and base in Git. Compare its tip, diff and working tree with the handoff before changing anything; keep uncommitted work. Reuse checks only for the verified tree. Recover unfinished work from Git, logs and the handoff, not from worker IDs, which can expire on reset. Continue from "Now".
4. **First run.**
   - Running a plan is the user asking for a worktree. Create one, branch `<slug>`, off the base in Context, with the user's worktree tooling. Never build in the primary checkout.
   - Run the worktree preflight below. Create `PROGRESS.md` from the template, with the worktree, branch, starting commit and the plan's Open questions under "For the owner".
   - Apply Context's setup (submodules, dependencies, builds), then run its checks once. Record their durations and anything that differs from the plan's baseline.

### Worktree preflight

Before dispatch, run [preflight.sh](preflight.sh) from this skill's directory:

```sh
sh preflight.sh "$worktree" "$branch" "$base_commit" "$skill_file"
```

Pass the expected starting commit and zero or more absolute skill paths from the brief. The command checks the clean branch and commit, the readable skill files, and creates the project store folder if it is missing. If a skill moved, resolve its installed path or give the worker the applicable procedure. If the store cannot be created, stop writing notes and report the path. Retain the worktree tool's diagnostics.

## Loop

Take the slices in order. For each one:

1. **Brief a fresh worker** with the brief below, on the model its `hard` or `routine` mark calls for (see Models). Build it yourself only when the change is smaller than its brief would be.
2. **Wait.** Record the dispatch, exact diff scope and next check in `PROGRESS.md` before ending your turn. In pi the report arrives as a message that starts a turn; `agent_wait` with a short `timeout` only when a turn must combine results, and a result it returns doesn't arrive as a message as well. Don't poll, sleep, arm watchers or post status: `PROGRESS.md` is the status.
3. **Check it yourself** on the branch tip: the slice's check, then the repo's standard checks. Never take the worker's "it passes" as the result.
   - Run them in the background with output to a file, and grep the file for failures instead of reading it.
   - One full suite at a time on the machine. Overlapping suites fail on timeouts that look like bugs.
   - Read `git diff --stat` for the slice and look for deleted, skipped or weakened tests.
   - A failure that only shows under load is a defect until a cause is found.
4. **Green:** record the slice in `PROGRESS.md`, add any interface it settled to the plan's Interfaces, and take the next slice.
5. **Red, or the worker stopped short:** Record the last commit, dirty paths, failed command/log or missing verdict, and next repair before dispatching again.
   - Give one repair to a fresh worker, with the failing output and what is already on the branch. Continue the same worker only if its run was short, since a long worker re-reads its whole history on every turn (pi: `agent_send` to the same name).
   - If it is still red, escalate. Never send the same brief to the same model twice. In this order: ask the strong model one narrow question, with the failing output and the diff (which condition fails, and why); give the slice to the strong model; or split the slice at what is green, land that, and add the rest to the plan as a new slice. In pi the strong model is the lead or a `worker`; an `expert` is the last resort in Models, and its budget is tracked in the conversation.
   - Log the route you took. A blocked slice is not a stopped run.
6. **Answer every concern** a worker reports before the next slice: fix it now, add it to the plan as a named slice, or reject it with a reason in Decisions. Concerns carried as prose all land on the last slice.

After slice 1, which is the thread or the plan's riskiest change:

- Run one review of it (see Reviews). Later slices build on it.
- Reread the remaining slices against what it taught you. Reorder, split or drop them, and log each change in Decisions.

When the detailed slices run out, turn the next `Later` lines into slices: an outcome, a check you ran now, and a `hard` or `routine` mark.

A **batch** is the only place workers run in parallel:

- Give each member its own worktree off the branch tip, prepared as Context says, never copied from another checkout. Run at most three at once, fewer if Context says suites contend. In pi, one `agent_spawn` call with one entry per member, each with its own `name` and `cwd`, is the batch; the group reports once, with each member's final message.
- Members run focused tests only. When all have returned, stack their commits on the branch and run the checks once on the combined tree.
- Repair a member that conflicts or fails on the combined tree, alone.

A check that needs a device or a person: land the part you can check, record the open check under "For the owner", and run it when it can run. The final checks can't pass while one is open.

## Worker brief

Paste what the worker needs. Don't send it to read the plan: a worker carries everything it reads through every later turn.

- **Where:** the worktree path and branch. Work and commit only there, in logical commits matching the repo's style; a repair is a `--fixup` of the commit it repairs. No push, and no external services beyond what the plan allows.
- **The slice:** its text from the plan, verbatim, plus only the Owner decisions, Defaults, Interfaces, Rules and Gotchas that bear on it, and the path of its notes file if it has one.
- **What exists:** a line or two on what earlier slices built, with paths.
- **Checks:** the slice's check, and the focused tests to run while working. Outside a batch, it runs the full check once before reporting.
- **When it is bigger than it looks:** if the work outgrows the slice, or the same fix has failed twice, commit what is green and report `PARTIAL` with exactly what remains. A clean partial is a good result. Commit each green step, so a turn cap or a usage limit loses nothing.
- **Limits:** it never edits `SLICES.md` or `PROGRESS.md`, and sends no progress messages. A plan decision that blocks it is reported, not worked around.
- **Report:** its final message, at most 15 lines. First line exactly `DONE`, `PARTIAL` or `BLOCKED`. Then the commits, the check command and the last lines of its output, what remains, concerns, and anything that contradicts the plan. Logs stay in files and the report gives their paths.

Set the harness's turn cap where it has one: in Claude Code, about 250 for a builder and 60 for a reviewer or a narrow question. In pi the profile's `maxTurns` decides, and a spawn can't set it. A capped worker that returns nothing is a `PARTIAL`; read git to see what it left.

## Models

- **Cheap** (Claude Code `sonnet`; pi `worker`, `reviewer`, `verifier` and `researcher`, all `auto/deepseek-v4.1-flash`): routine slices, repairs to them, research, and the security review.
- **Strong** (Claude Code your own model; pi the lead): hard slices, escalations, and the two reviews. If the harness can't give a worker the strong model, build that slice yourself. In pi, a hard slice can also go to a `worker`, and the reviews stay on `reviewer`.
- **Expert** (pi only: the `expert` profile, `openai-codex/gpt-6.1-sol`): a last resort for a demonstrated hard blocker or a high-risk uncertainty that needs independent reasoning. A run gets at most two expert subagents in total, not per slice. State the blocker and why a cheap answer can't settle it, and reuse an expert already running with `agent_send` instead of spawning another.
  - Track the two in the conversation: no ledger file, and no PROGRESS budget field. If you can't tell whether an expert was already used, ask the user; never assume the budget reset.
- The owner's word on models overrides this. Record it in `PROGRESS.md` so a resumed lead keeps to it.
- In Claude Code, request the model on every spawn, since a subagent otherwise inherits yours, and record what actually ran when the worker reports. In pi, profiles carry their own model, and an explicit `model` on a spawn overrides it; name the profile on every spawn, because an agent otherwise runs on the lead's own model. An unavailable model fails the spawn instead of inheriting, and a profile whose model doesn't resolve isn't offered.
- Treat a provider rate limit as a failed dispatch, not a review verdict. Reduce concurrency or use an available independent route rather than repeating the same throttled batch.
- In pi, delegate only bounded work: one slice, one repair, one check run, one research area. A task you can finish in a few tool calls stays yours.

## Reviews

- Two by default: slice 1, and the whole branch against its base at the end. Add a security review after any slice that touches a trust boundary in the plan's Risks.
- A reviewer is a fresh, read-only subagent (pi: `reviewer`). Give it the exact diff range, the paths and acceptance criteria it owns, and the behaviour to verify, not the workers' reports. Record each verdict and actionable finding when it arrives. A capped or missing report is not approval.
- Ask it for defects, checks that pass without proving the outcome, scope drift, uncovered Risks, and owner decisions with no reachable path yet. The security reviewer gets only the boundaries and the diff, and is asked for a path by which untrusted input crosses one.
- One round each. Fix the confirmed findings in one pass, then verify those fixes with a focused check. Run a second full review only if the fixes changed the design.
- Above about 3,000 changed lines, cheap readers can cover areas separately for the final review. One strong reviewer still reads the whole diff and owns what crosses areas. In pi that is the `reviewer` unless an expert is already justified.

## Stops

Stop for the owner only when:

- an Owner decision proves wrong, or the next step needs a decision about scope or product behaviour;
- the next step would push, land, open a PR, call an external service the plan doesn't allow, delete work you didn't create, or stop or replace something on a device the owner uses;
- escalation is exhausted and every path forward is a guess;
- a stop condition in the plan's Rules fires.

Everything else is yours to decide: a failed check, a worker at its cap, a default that proves wrong, a proposed interface that doesn't fit, a slice that needs splitting. Decide, log it in Decisions, and continue. Slices run in order, so there is no other work to move to and a stop costs hours.

Before stopping, finish what doesn't depend on the answer. Write the question under "For the owner" and send a notification if the harness has a tool for it.

## Traps

- Spawn workers without a `name`. With agent teams on, a named one runs as a teammate and wakes you with an idle notice every time it pauses.
- In pi, give every worker a `name` (`s1`, `s2`): `agent_send`, `agent_wait` and `agent_stop` address it by name.
- Every pi spawn stays one level deep: don't set `spawn: true` and don't give a worker the agent tools. A worker that needs splitting reports back instead. Every job stands alone, because an agent can't see your conversation.
- A worker killed by a usage limit leaves its commits. After the reset, continue with a fresh worker from the branch.
- Stopping a subagent doesn't stop what it launched. Select its processes by `/proc/<pid>/cwd` under the worktree; `pgrep -f <text>` also matches your own shell. In pi, `agent_stop` stops the agent, not its shell processes.
- Never pipe a rebase into another command: `git rebase … | tail` hides a conflict stop. Check `git status` afterwards.
- A history rewrite that leaves `git rev-parse HEAD^{tree}` unchanged keeps its check results. Anything that changes the tree needs them run again.

## PROGRESS.md

Rewrite it; don't append. Keep it under about 150 lines. Detail lives in commits and log files, and this file links to them.

```markdown
# Progress: <slug>

## Now

<Worktree, branch, base and candidate commits; uncommitted paths to preserve; in-flight work, its worker ID or pi name and scope; the next action.>

## Slices

| ID | Status | Commit | Check command, exit and log | Built by (model, turns) | Findings and next action |

## Decisions

<Dated, one line each: defaults changed, slices revised, concerns rejected, each with its evidence.>

## For the owner

<Dated, with an ID (Q1…): what is needed, what was done meanwhile, and the answer once there is one.>

## Surprises

## Retro

<Written when the run ends: what the plan got wrong or left out; which slices needed a repair or an escalation, and why; what the run cost in turns per slice, wall-clock and models.>
```

Update it before handing off a turn and when a result changes the next action: dispatch, verified check, review finding, failure, integration, or stop. Record enough to restart without the session transcript.

## Finish

1. If the base moved, rebase onto it once. Then run the plan's "Done when" checks on the final tree.
2. Run the final review, and the security review if the plan has trust boundaries. Fix and verify as in Reviews.
3. Stop every agent and subagent still running (pi: `agent_stop`). Fold fixups into the commits they repair, so the branch reads as logical changes. Write the retro.
4. Report in chat: what is done, with check results; failures and skips, stated plainly; what the run cost; the retro; the branch and worktree.
5. Ask, in one round, every unanswered question under "For the owner", with what was done meanwhile as the recommended answer. Use the harness's question tool when they fit. Build what the answers call for.
6. Landing is the owner's call. Once the branch has landed, offer to move the plan directory to `plans/history/<slug>/`, and move it only on a yes.
