---
name: slices
description: Turn a finished brainstorm or research thread into a short plan for a separate builder agent — pin the scope, find the one end-to-end path that proves the change, order the work as slices that each leave the product running, run every check you write down, and write a self-contained SLICES.md that /run-slices builds unattended. --quick drafts from existing evidence without subagents or a cold read. Use when the user asks for slices, or for a sliced plan another agent will build in a long-running session.
disable-model-invocation: true
argument-hint: "[scope] [--quick]"
arguments: scope
metadata:
  summary: "writes a finished plan up as ordered slices for another agent, riskiest path first."
  category: plan-build-ship
---

# slices

- The reader is a builder agent that never saw this conversation. It runs `/run-slices <dir>`, which owns the build loop, so write only what is specific to this project.
- Write the decisions the builder can't make alone and the order that proves the change early. Leave routine implementation choices to the builder.
- `scope` is free text naming what to hand off (`1-4`, `options 2 and 3`, `all but the migration`). Empty means what the conversation just settled on.
- If one agent can finish the task in one sitting, say it needs `/dispatch` instead.

## Slices

The plan is an ordered list of slices. A **slice** is one reviewable change that leaves the product working and its checks green. The builder works them one at a time, in order, on one branch.

- **Slice 1 is the thread:** the thinnest change that runs the real product through the new code, from its real entry point to a result you can observe.
  - For a new feature, that is the main path end to end with everything else stubbed.
  - For a migration or refactor, it is one real caller switched to the new code while the old path still serves the rest. The cutover is where the plan starts.
  - New code built beside the old and proven only by its own tests meets the product at the end, where every hidden gap lands on one slice.
  - A plan that adds no new path (a cleanup, a set of unrelated fixes) has no thread. Slice 1 is then the change most likely to fail, alone, with its own check.
- **Every later slice widens the thread.** It moves more behaviour or more callers onto the new path and ends with the product still running on it. No slice builds something that nothing real calls yet. Deleting the old path comes last, once nothing uses it.
- **Each slice has a check you ran.** A check is a command, its working directory and the expected result.
  - Run it while planning and record what it does now: it fails for the reason the slice fixes, or it doesn't exist and the slice writes it first.
  - A check that already passes proves nothing, and "tests pass" alone is not a check.
  - If the product has a real end-to-end run (an e2e suite, a device, a testbed), the thread's check includes the cheapest one. Saving it for the end finds the regressions last.
- **Mark each slice `hard` or `routine`.** Hard means it needs diagnosis or judgement: the thread, any cutover, concurrency, an unknown mechanism, or anything whose failure blocks every later slice. Routine means the recipe is known and the check decides. The builder gives hard slices to its strongest model.
- **Size.** If a slice's outcome needs "and", or you can't name the modules it changes, it is more than one slice.
- **Plan in detail only as far as you can see.** Slices past the point where the work depends on what earlier ones discover go in `Later`, one line each. The builder slices them when it gets there, with what it has learned. A plan with more than about eight detailed slices is usually guessing.
- **Interfaces are recorded, not frozen.** State an interface only where code already proves it, and mark the rest `proposed`. An interface written before anything ran on it gets amended by nearly every slice that touches it.
- **One writer on shared code.** Slices run one at a time unless you group them in a **batch**: slices whose paths don't overlap and that each have their own check, such as callers migrated package by package or unrelated small fixes. Name each member's paths.
  - Slices that touch the same code stay in order. Parallel workers on shared code spend their time rebasing and re-verifying each other.
  - A change that touches everything (a repo-wide rename, a folder move) runs alone, after every batch has landed.
- **Answer plan-changing unknowns before writing.** An unknown that could change the order of slices gets a probe now, against the product's real entry point in a scratch checkout. A toy probe says nothing about the product. If it can't be answered in minutes, the thread is the probe: say which result would change the plan and how.
- **Risks:** the three to five failure classes most likely to slip past the checks (bad input, partial failure, concurrency, upgrade paths), each assigned to the slice whose check covers it.

## Procedure

1. **Pin the scope** in one message: each selected item restated in full, an out-of-scope list, a kebab-case slug, and the directory `plans/<slug>/` in the project's store (`agent-notes root --ensure` gives its path; the checkout sees it as `.agents/store`). Ask before overwriting an existing `SLICES.md`. Continue unless the scope itself holds an open decision.
2. **Harvest decisions.** Keep the choices the builder needs, each with its reason when known and where it applies.
   - **Owner decisions:** the user stated it, typed their own answer, or picked an option you didn't recommend. These lock.
   - **Defaults:** a bare "yes" to your recommendation, or an implementation call. The builder may change one when evidence shows it's wrong. When the tier is unclear, it's a default.
3. **Find the thread and research what it leans on.** Reuse the conversation and existing notes first. Verify from the code and by running things:
   - the entry point, modules and interfaces the thread touches, from source or type definitions rather than READMEs;
   - what a fresh worktree needs before its tests run (submodules, installs, builds);
   - the exact build, test and run commands, their measured durations and any known-red baseline;
   - what can't run in parallel on this machine (full suites, ports, devices);
   - the repo's conventions and the skills it expects agents to use.

   Fan out cheap read-only subagents only for independent areas. Each gets an objective, an output format and its boundaries; launch them in the background and join once.

4. **Slice** by the rules above.
5. **Grill the gaps.** Load the `grilling` skill and ask only the decisions research couldn't settle and that are the user's to make. If there are none, skip this.
6. **Write `SLICES.md`** from the template below.
7. **Cold read.** Give a fresh, cheap, read-only subagent only the directory path. Ask it:
   - what it couldn't act on without asking: undefined terms, references to the discussion, missing commands;
   - which slice first runs the real product on the new code, and what that slice's check proves;
   - which checks were not run, or would pass before their slice is built;
   - which in-scope lines, owner decisions and risks map to no slice, and which user actions the decisions imply that no slice builds.

   Fix what it finds. When it finds that nothing proves some behaviour end to end, move that proof into the thread. Adding the missing work to a late slice is how the last slice becomes the whole project.

8. **Report and ask.** Show the slices one line each (ID, title, hard or routine, outcome), the thread's check, and what you did not verify. In the same round, ask each open question the user can answer now, with your recommended answer; use the harness's question tool when they fit. End with the `SLICES.md` path and the kickoff line `/run-slices <dir>`.

## Models

- Research and the cold read run on the harness's cheap model: Claude Code `sonnet`; pi the `Explore` and `reviewer` roles.
- Name the model on every spawn, because a subagent otherwise inherits yours. pi falls back to your model silently when a role's model is unavailable, so report the model each subagent actually ran on.

## SLICES.md

- Self-contained: define each term where it first appears, restate findings instead of linking to the discussion, and never write "as discussed".
- Repo-relative paths, and exact commands with their working directory.
- Redact secrets, tokens and personal data; name where to find them instead.
- Slice IDs are stable. The builder may split 3 into 3a and 3b, but nothing is renumbered.
- Status never goes in this file; the builder keeps it in `PROGRESS.md`.
- Keep it under about 300 lines. A longer plan is usually detailing slices that belong in `Later`.
- Findings too long to restate go in `notes/<area>.md` beside it, linked from the slice that needs them.

```markdown
# <Title>: slices

## Goal

<One paragraph: what exists when this is done, and why it matters.>

**Done when:** <the final checks: each command, its working directory and expected result>

## Scope

In: … Out: …

## Context

<Repo, base branch and commit. What a fresh worktree needs before tests run. Build, test and run commands with their working directory and measured duration, or "unverified". Known-red baseline. What can't run in parallel on this machine. Terms.>
Skills: <skills the builder and its workers should load, and when.>

## Owner decisions

Stated by the owner. The builder doesn't change these; if evidence shows one is wrong, it stops and says so.

- U1 <decision>. Why: <reason>.

## Defaults

Accepted recommendations and implementation calls. The builder changes one when evidence shows it's wrong, and logs it.

- D1 <decision>. Why: <reason>.

## Interfaces

<Only what two slices or outside callers depend on. Each is `proven` (name the code and test) or `proposed`.>

## Slices

### 1 <title> (thread, hard)

- Outcome: <1–3 sentences of behaviour>
- Check: `cd <dir> && <cmd>` → <expected>. Now: <fails with … | written first by this slice>.
- Notes: notes/<area>.md (if needed)

### 2 <title> (routine)

- Outcome: …
- Check: …

### 3 <title> (batch, routine)

- Members: 3a <outcome> in `<paths>`; 3b <outcome> in `<paths>`
- Check (each member): …

## Later

- <One line each: the outcome, and what must be known before it can be sliced.>

## Risks

- <Failure class> → covered by slice <n>'s check.
- <Untrusted input> must not reach <secret or resource> → attacked by slice <n>'s check.

## Rules for this project

<Never and always beyond the generic loop: services not to call, files not to touch, what the builder may land or run without asking.>

## Gotchas

<Verified facts that will bite.>

## Open questions

<Not answerable before the build: what will answer each one, and how to proceed meanwhile.>
```

## --quick

Draft from what is already settled, in a few minutes: no subagents, no cold read, no grilling round.

- Still find the thread and still run its check. Mark every other check you didn't run as unverified.
- Ask only a product decision that blocks stating what to build.
- Reread the file yourself with the cold-read questions before reporting.
