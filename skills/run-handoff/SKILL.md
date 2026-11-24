---
name: run-handoff
description: Build a plan written by /handoff in one long-running session — keep PROGRESS.md, dispatch every unblocked item to a background subagent in its own worktree, re-run its acceptance yourself before fast-forwarding an integration branch, review at gates and over the whole branch. Checks in with the user at every gate by default; --auto runs unattended until done or blocked. Use when the user asks to run, build, execute or resume a handoff.
disable-model-invocation: true
argument-hint: "[handoff-dir] [--auto] [--review-model MODEL]"
metadata:
  summary: "builds a handoff with one subagent and worktree per item, re-verifying each."
  category: plan-build-ship
---

# run-handoff

- You are the lead and integrator. Execute the plan; don't redesign it.
- `HANDOFF.md` is the plan and is read-only to you, apart from recording the user's word under Amendments. `PROGRESS.md` is yours.
- Running a handoff is the user asking for worktrees: parallel items need isolated checkouts, so this run uses an integration worktree and one per item. Never work in the primary checkout.

## Mode

- By default, stop at every gate for the user.
- With `--auto`, gates are self-checked and only the stop conditions halt you.
- The mode is per invocation and never stored, so a gated start can resume with `--auto`.

## Models

- Item workers and ordinary gate/area reviewers use explicit cheap models: Claude Code `sonnet`, named on every spawn because a subagent otherwise inherits the lead's; pi `worker` for builds and `reviewer` for reads and reviews, both `auto/deepseek-v4.1-flash`, so the lead's Sol model never becomes a worker's by accident.
- The final whole-branch reviewer uses Claude Code `opus`. In pi it is a `reviewer` too: don't force a strong review on every handoff, and pi's `expert` (`openai-codex/gpt-6.1-sol`) is a last resort for a demonstrated hard blocker or a high-risk uncertainty that needs independent reasoning. The whole handoff gets at most two expert subagents, across items, gates and sessions, not per item.
  - Before spawning one, state the blocker and why a cheap read can't settle it, and reuse an expert already running with `agent_send` instead of spawning another.
  - Track the two in the conversation: no ledger file, and no PROGRESS or HANDOFF budget field. If this conversation can't tell whether an expert was already used, ask the user; never assume the budget reset.
- `--review-model MODEL`, or an explicit choice in this invocation, picks the gate reviewers' model. In pi that is a `reviewer` spawn with an explicit `model`, the same as HANDOFF's review-model override.
- An unavailable model fails the spawn in pi instead of silently using the lead's model, and a profile whose model doesn't resolve isn't offered at all. After spawning, compare the model the harness reports with the intended one; if they differ, use the cheap fallback once and record the downgrade in `PROGRESS.md` and the final report. Ordinary tool errors or review findings are not reasons to downgrade.
- In pi, delegate only bounded work: research an area, build one item, run one check. A task you can finish in a few tool calls stays yours.
- One full review per checkpoint, followed by focused verification of confirmed repairs. Repeat the full review only when repairs substantially change the design or scope.

## Decisions

- HANDOFF's **Yours** decisions lock. One that proves wrong and blocks the critical path is a stop condition.
- Its **Defaults** may change when evidence shows one is wrong. Whoever changes it states the evidence: an item in its report, you in the decision log.
- In a HANDOFF without these tiers, every locked decision counts as yours.
- When the user answers an open question or approves a proposed change to HANDOFF, append it to Amendments, dated and in the terms they settled. Never append on your own judgment.

## Start or resume

1. **Resolve the directory.** If none is given, take the most recently modified `plans/<slug>/` holding a `HANDOFF.md` in the project's store, skipping `plans/history/`, and confirm it before starting. `agent-notes root --ensure` gives the store's path, and the checkout sees it as `.agents/store`.
2. **Read `HANDOFF.md` in full** and `references/runtime.md`. Amendments override everything above them. Resolve this skill's bundled `scripts/watch.py` to an absolute path. Read `notes/` files only when an item needs them.
3. **Resume** if `PROGRESS.md` exists.
   - Check it against git: the integration branch, item worktrees and their commits. Where they disagree, git wins; fix `PROGRESS.md`.
   - Reconcile worker IDs, watchdog jobs, dispatch times and recovery counts as well. In pi, reconcile names too, with `agent_status`; its agents belong to the session that spawned them, so after a session reset recover from the branch and logs. Re-arm the same attempt's watcher if it died; never renew the deadline merely because the lead resumed.
   - Reuse recorded verification only when the tree and test inputs are unchanged; otherwise run the standard checks before dispatch. If a crash left the integration branch broken, fixing that comes first.
   - Add any of HANDOFF's Open questions missing from "Blocked on you".
   - Continue from "Now".
4. **First run.**
   - Create the integration worktree, branch `<slug>`, off the base branch in Context. Use the user's worktree tooling, otherwise `git worktree add`.
   - Create `PROGRESS.md` from the template below, with HANDOFF's Open questions in "Blocked on you".
   - Require Python 3 and notifying background jobs; if supervision cannot be armed, report that blocker rather than running unattended without it.
   - Run Context's build and test commands once, and record their durations and known-red baseline.
   - Then do the bootstrap items and `G0`, if there are any, yourself.

## Loop

1. **Frontier.** Every item whose blockers are done, or integrated with only device or person acceptance open, and whose `Owns` doesn't overlap an item in flight.
2. **Dispatch** frontier items up to HANDOFF's concurrency cap (default 3). For each one:
   - create a worktree `<slug>-<id>` off the integration branch's current head;
   - start a cheap worker with the item brief below;
   - record its ID (pi: name), dispatch Unix timestamp, attempt directory, budget and persistent recovery count; arm the bundled watcher as a notifying background command in the lead, as in `references/runtime.md`.

   Do contracts and gates yourself. Claude Code: the Agent tool runs subagents in the background and notifies you. Spawn item subagents without a `name`; a named one runs as a teammate when agent teams are on, and wakes you with an idle notice every time it pauses. Message a running subagent by its agent ID. pi: one `agent_spawn` call per item, with a single entry carrying the item brief as `job`, `profile: "worker"`, its `name` (`a1`, `a2`) and the `cwd` of its worktree, so each report arrives on its own. It returns at once, and a report is a message that starts a turn. `agent_wait` with `names` and a short `timeout` only when a turn must combine results or finish a bounded attempt; a result it returns doesn't also arrive as a message.

   Every pi worker stays one level deep: don't set `spawn: true` on an item, reviewer or verifier, and don't give a worker the agent tools. Fresh contexts are the point, and there is no nested delegation: a job that turns out to need splitting comes back to the lead as a report.

3. **While items run,** do gate work or end your turn and wait for the reports. Every turn re-reads your whole context, so don't schedule recurring check-ins, crons or polls.
   - The watcher wakes you on report, no progress (default 10 minutes) or attempt deadline (default 60 minutes). Use HANDOFF's explicit overrides; a live foreground command within its finite lease is not a stall. Test duration alone is not an implementation budget.
   - On a stall or expired deadline, inspect commits, changed files and processes once. Stop an over-deadline attempt and its launched processes before recovery. Recover at most once per item, continuing the same worker or replacing a dead one without losing its work. If it stalls again, block that item, notify the user and continue independent work.
   - An idle notice or status ping isn't a report: end the turn without acting. A timed-out short join likewise means wait for the report or the watcher, not start another polling loop. In pi, `agent_status` is for a turn that needs the state, not for polling.
   - Claude Code: a subagent reads messages only between its own tool calls; to stop a run now, stop its processes yourself. pi: `agent_send` with `mode: "interrupt"` stops a worker's current work before delivering the message, and `agent_stop` ends the agent and its agents.
   - Stopping a subagent doesn't stop what it launched. Find its parent scripts as well as their children, and select them by `/proc/<pid>/cwd` under its worktree or by exact argv. `pgrep -f <text>` also matches your own shell.
4. **Route** each report by its status line:
   - `DONE`: integrate.
   - `DONE_WITH_CONCERNS`: read the concerns, then integrate or send back; log the call in the decision log.
   - `NEEDS_CONTEXT`: answer from HANDOFF or its notes and continue the subagent (pi: `agent_send` to it; a finished agent keeps its conversation). If the answer is the user's to give, treat it as blocked.
   - `BLOCKED`: mark the item blocked with the reason.

   A report that changed a default: check its evidence before integrating, and log the change in the decision log.

5. **Integrate.**
   - Confirm the branch sits on the integration branch's current tip. If the tip moved since, have the subagent rebase again, or rebase it yourself if trivial.
   - Never pipe a rebase into a gate (`git rebase … | tail` hides a conflict stop). Check `git status` for a rebase in progress, and print the HEAD sha before and after the gate.
   - On that tree, re-run the item's acceptance command yourself, plus the repo's standard checks and the walking skeleton if HANDOFF has one. Never take the subagent's "it passes" as the result.
   - Shape reviewable history before integrating: preserve logical changes, fold repairs into the commits they repair with fixups/autosquash, and avoid arbitrary one-commit-per-item squashing. Do not leave history reconstruction for the user after the build.
   - A pure history rewrite with the same final `git rev-parse HEAD^{tree}` and unchanged test inputs retains the verified result. Do not run full suites at every rewritten commit. Content-changing rebases or changed test inputs still need fresh verification.
   - If it passes: fast-forward the integration branch, record the command, its result, commit and verified tree ID, then read and delete the worktree's `.handoff-report.md`, stop its watcher and remove the worktree.
   - If it fails: send the failing output back to the same subagent, continuing it if the harness allows (pi: `agent_send`). After two send-backs, mark the item blocked with the last failing output.
   - If the desktop part passes and only a device or a person is left: integrate it now and record that acceptance as open in `PROGRESS.md`, so its dependents can run. Run the open step when it can run, and put any fix it needs on top.
6. **Re-check the frontier** after every integration and dispatch what opened up.
7. **Update `PROGRESS.md`** after every item and before any long operation. It is how you resume after a context reset, so keep it accurate, not optimistic.

Long operations:

- The lead runs long commands as notifying background jobs with a deadline and output files. Workers run them in the foreground through the bundled command helper, with a finite timeout and activity lease. See `references/runtime.md`.
- Run one full test suite at a time across all worktrees; parallel full runs overload the machine and fail with timeouts. Items run focused suites, and you run the full one at integration.
- Grep those files for failures instead of reading whole logs.
- You can't feel time passing, so follow HANDOFF's budgets.

## Gates

- A gate passes when its items pass acceptance on the integration branch and a reviewer signs off.
- After the last item, a final gate reviews the whole integration branch against its base. Fix its confirmed findings in one pass.
- Fix confirmed findings before any gate passes, and record the gate's commit and verdict.
- The final gate can't pass while an item's device or person acceptance is open.

### Reviewer

- A fresh, read-only subagent. Claude Code uses the cheap reviewer (`sonnet`) for ordinary gates and the stronger reviewer (`opus`) for the final whole-branch gate (Models above). pi uses the `reviewer` profile for both; a stronger review is not forced on every handoff.
- It gets the gate's diff since the previous gate (the final gate: since the base), the `HANDOFF.md` path, and the gate's item IDs. It does not get the subagents' reports.
- Ask it for:
  - defects;
  - contract violations;
  - scope drift;
  - uncovered review-focus risks;
  - acceptance checks that pass without proving the outcome;
  - decisions or user actions in HANDOFF that have no reachable path yet.
- Above about 3k changed lines, cheap area readers can cover backend, UI or deployment separately. Keep one stronger final reviewer responsible for the whole branch and cross-area contracts; it reads the actual diff, not only summaries. Claude Code keeps it on `opus`; pi keeps it on `reviewer` unless an expert is already justified.
- If HANDOFF has Trust boundaries, the first gate after an item that touches one and the final gate add a security reviewer. It gets only the boundaries and the diff, and is asked for a path by which untrusted input reaches a secret or crosses a boundary.

### After a gate

- **Default mode:** post the gate, each item's acceptance result, the reviewer's verdict, surprises, and what the frontier opens next. Ask go or adjust, using the harness's question tool if there is one. When blocked, ask right away; items already running keep going.
- **`--auto`:** continue past gates. When blocked, add the request to "Blocked on you", send a notification if the harness has a tool for it, and move on to other unblocked work. Never use the question tool before the final report, with one exception: an action HANDOFF doesn't authorise that could stop, reboot or replace something on a device the user uses. Dispatch everything else first, because a question stops the turn.

## Stop conditions

Both modes stop when:

- no unblocked item remains;
- a decision under Yours proves wrong and blocks the critical path (put the evidence and a proposed alternative in `PROGRESS.md`);
- the next step would push, land, open a PR, call a real external service HANDOFF doesn't allow, or delete work you didn't create;
- a stop condition in HANDOFF fires.

Never edit `HANDOFF.md` to get unstuck. Propose the change in `PROGRESS.md`; it becomes an amendment only on the user's word.

## Item brief

Each item worker's job contains:

- **Role:** builds one item. The lead owns `PROGRESS.md`, integration, contracts and gate reviews.
- **Where:** its worktree path. Work and commit only there, in logical reviewable commits matching the repo's style; repairs are fixups to the change they repair.
- **What:** its item ID. Have it read `HANDOFF.md` itself (Context including its Skills line, Locked decisions, Contracts, Rules, Gotchas, its item and that item's notes files) rather than paraphrasing them.
- **Boundaries:**
  - change only its item's `Owns`; name the paths owned by items now in flight as not its own;
  - never edit contracts, `HANDOFF.md` or `PROGRESS.md`;
  - no push, and no external services beyond what HANDOFF allows;
  - it may change a default only with evidence, stated in its report.

  If a contract or a Yours decision blocks it, it finishes what it can and reports the proposed change rather than working around it.

- **Budget:** no-progress threshold, attempt deadline and command timeouts from HANDOFF (defaults 10m/60m). The lead owns the one permitted stall recovery; a worker cannot renew its own attempt.
- **Commands:** give the absolute watcher-script and attempt-directory paths. Long commands run in the foreground through `watch.py command --state-dir <attempt> --cwd <worktree> --timeout <seconds> -- <argv>`, not as detached jobs that cannot wake the worker. Its finite lease prevents a healthy command being mistaken for a stall.
- **Messages:** no progress updates or FYIs to the lead while it works. A question it can't answer from HANDOFF ends its run as a `NEEDS_CONTEXT` report. Its only message is the final one.
- **Done:** rebased onto the integration branch's current tip, then its acceptance command passes there, run by it, with the output reported.
- **Report:** written to an untracked `.handoff-report.md` in its worktree.
  - First line exactly one of `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`.
  - Then: branch and worktree; commits; the acceptance command and result; decisions made and why; anything contradicting HANDOFF; measured timings.
  - Failures and skips stated plainly.
  - Logs stay in files and the report gives their paths.
  - Its final message is only the status line and the report's path, since long replies get truncated. If it can't write the file, it sends the report as numbered messages of at most about 3,500 characters (`PART n/m`).

## PROGRESS.md

```markdown
# Progress: <slug>

## Now

<In flight, next up.>

## Items

| ID | Status | Worker / worktree | Attempt / watcher | Dispatched / idle / deadline | Stall recoveries | Send-backs | Acceptance / verified tree | Commit |

## Gates

| ID | Commit | Reviewer verdict |

## Blocked on you

<Dated, with an ID (Q1…): what is needed, what it blocks, what is done meanwhile, and its answer once there is one. HANDOFF's Open questions, decisions for the user and proposed amendments all go here.>

## Decision log

<Dated choices made within HANDOFF's latitude, and why.>

## Surprises and failed approaches

## Measurements

<Actual worker/review models and any downgrade; command timings, retries and available usage. Separate cached input from fresh input and output; do not invent dollar estimates.>

## Handoff retro

<Written when the run ends: what HANDOFF got wrong, left out or over-specified, and which decisions or gotchas the build had to discover.>
```

## Final report

1. Stop every subagent and watchdog still running, idle ones included (pi: `agent_stop` each one). Confirm the branch has logical reviewable commits, not an unfinished history-cleanup job. Write the handoff retro.
2. Report in chat:
   - what is done and verified, with acceptance results;
   - what is blocked and on what;
   - failures and skips, stated plainly;
   - measured timings, actual worker/final-review models, and any review downgrade;
   - the retro;
   - the integration branch and any worktrees left.
3. Ask, in one round, every unanswered entry in "Blocked on you" that the user can answer now, with what was done meanwhile as the recommended answer. This applies with `--auto` too, since the run is over and a question interrupts nothing. Use the harness's question tool when they fit, otherwise a numbered list with your pick on each. Record each answer, and build what it calls for on the integration branch.
4. End with what the user acts on:
   - landing, which is the user's call; whenever it comes up, even mid-run, first name what is still unanswered;
   - anything still blocked on them;
   - once the branch has landed and no owner gate is left in HANDOFF, an offer to archive the plan dir to `plans/history/<slug>/`, which the notes no longer list as active. The retro and any unanswered question go with it, so name those. Move it only on a yes.
