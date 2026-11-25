---
name: handoff
description: Turn a finished brainstorm or research thread into a handoff for a separate builder agent — pin the scope, verify assumptions with read-only subagents, grill the user only on what is still undecided, agree the item graph, then write a self-contained HANDOFF.md whose work items carry owned paths and acceptance commands so /run-handoff can build them in parallel. --quick drafts from existing evidence, with at most two minutes of essential research and no cold read; it does not limit the size of the build. Use when the user asks for a handoff, or for a plan another agent will implement in a long-running session.
disable-model-invocation: true
argument-hint: "[scope] [--quick] [--review-model MODEL]"
arguments: scope
metadata:
  version: 0.1.0
  uses: [grilling, run-handoff]
  summary: "writes a finished plan up as a self-contained handoff for another agent."
  category: plan-build-ship
---

# handoff

- The reader is a builder agent that never saw this conversation.
- It runs `/run-handoff <dir>`, which owns the operating loop: progress tracking, subagent briefs, worktrees, merging, gates and stopping. Don't restate that loop in the handoff; write only what is specific to the project.
- `scope` is free text naming what to hand off (`1-4`, `options 2 and 3`, `all but the migration`). Empty means what the conversation just settled on. Flags aren't part of scope; `--quick` replaces the spine with the section of that name.

## Models

- Research uses explicit cheap models: Claude Code `sonnet`, named on every spawn because a subagent otherwise inherits the lead's; pi `researcher` and `reviewer`, both `auto/deepseek-v4.1-flash`. In pi, a build, test or probe that takes minutes goes to a `verifier`, which reports the command, its exit and the failing lines, and every spawn names its profile.
- The cold read uses Claude Code `opus`; pi `reviewer` (read-only, thinking high), which is enough for the read below. Don't force a strong read: pi's `expert` (`openai-codex/gpt-6.1-sol`) is a last resort for a hard blocker or a high-risk uncertainty that needs independent reasoning. A handoff gets at most two expert reads across the plan and its build.
  - Use one here only when a cheap read leaves the risk unresolved, and say why in the report. Track the two in the conversation: no ledger file, and no PROGRESS or HANDOFF budget field. A run that can't tell from the conversation what was already spent asks the user; never assume the budget is fresh.
- `--review-model MODEL`, or the user's explicit choice, overrides the cold read's model; an explicit `model` on the pi spawn does the same.
- An unavailable model fails the spawn in pi instead of silently using the lead's model, and a profile whose model doesn't resolve isn't offered. If the model that ran differs from the one intended, use the cheap fallback once and report the downgrade. Ordinary tool errors or findings are not reasons to downgrade.
- In pi, delegate only bounded work: research one area, read the plan cold. A fact you can check in a few tool calls stays yours.
- One full cold read, then focused verification of its fixes. Repeat the full read only if repairs substantially change the design or scope.

## Spine

1. **Pin the scope.** Send one message with:
   - each selected item, restated in full from the conversation;
   - an explicit out-of-scope list;
   - a kebab-case slug;
   - the directory: `plans/<slug>/` in the project's store (`.agents/store/` in the checkout the session started in, which the notes plugin links to the repository's one shared store; create the folder if it is missing, and from another worktree use its absolute path).

   Then:
   - If the directory already holds a `HANDOFF.md`, ask before overwriting.
   - Wait for a go or a correction.

2. **Harvest decisions.** Keep the choices the builder needs for this handoff. Record where each applies (for example, this demo or all supported clients), its reason when known, and its owner:
   - **Yours:** the user stated it, typed their own answer, or picked an option you didn't recommend. These lock.
   - **Defaults:** a bare "yes" to your recommendation, or an implementation call. The builder may change one when evidence shows it's wrong, and says so in its report.
   - When the tag is unclear, it's a default.

3. **Research.** Reuse the conversation and existing notes first, checking their commit/version and whether relevant paths changed. Fan out cheap read-only subagents only for missing evidence, one per independent area rather than per item.
   - In pi, one `agent_spawn` call with an entry per area starts them together; their results arrive as one group message. `agent_wait` only when the round must combine results.
   - In pi, a command whose measurement is part of the evidence goes to a `verifier`, with the command, its working directory and the known-red baseline it should expect.
   - Each gets an objective, an output format and explicit boundaries ("X is another subagent's"). Launch in the background and join once; progress pings are not findings. A pi agent has a fresh context and can't see this conversation, so each brief stands alone.
   - In pi, no nested delegation: don't set `spawn: true`, so a researcher starts no researchers of its own.
   - They verify what the plan leans on:
     - the files, modules and APIs each item will touch;
     - real interfaces and versions, from installed source or type definitions rather than READMEs;
     - the exact build, test and run commands, their measured durations and any known-red baseline; reuse measurements on unchanged inputs;
     - repo conventions, the constraints in its agent instructions, and the skills it expects agents to use.
   - Findings too long to restate inline go to `notes/<area>.md`, written by the subagent, which returns only the path.

4. **Grill the gaps.** Load the `grilling` skill (Claude Code: call the Skill tool with "grilling"; pi: read its SKILL.md).
   - Name as open only the decisions research couldn't settle and that are the user's to make, including where tests attach (the highest seam that proves the outcome).
   - If there are none, say so and skip this step.
   - Tag each answer as in step 2.

5. **Decompose** by the rules below.
6. **Confirm the graph.**
   - Show every item as one line: ID, title, blocked by, `Owns`, outcome.
   - Ask whether the granularity is right, whether each edge really blocks, and what to merge or split.
   - Iterate until the user approves.
7. **Write `HANDOFF.md`** from the template below.
8. **Cold read.** Use the model above for a fresh read-only subagent given only the directory path, with no conversation context. Ask it to:
   - list everything it couldn't act on without asking: undefined terms, references to the discussion, items without runnable acceptance, missing run commands;
   - map every in-scope line, decision (both tiers) and contract to the items that deliver it end to end, and every review-focus risk and trust boundary to the item whose acceptance covers it, and report what maps to nothing;
   - list the user actions the decisions imply (a decision that discards work implies a control to discard) and the item that builds each one;
   - flag items that could be in flight together but share `Owns`.

   Fix what it finds. Reopen the grill only for a real decision gap.

9. **Ask what's still open,** because a question that is only reported goes unanswered. In one round, ask each open question the user can answer now, with its meanwhile rule as the recommended answer. Use the harness's question tool when they fit, otherwise a numbered list with your pick on each.
   - Classify each answer as Yours or Defaults by the same rule as step 2. Update the items it affects.
   - Only what can't be answered yet stays in Open questions.
   - A fact goes in Gotchas, and something the user has to do goes in the item or gate that needs it.
   - If nothing is open, skip this step.

10. **Report** the checks performed or skipped and the cold-read model, including any downgrade and, in pi, any expert read spent. End with the `HANDOFF.md` path, what stayed open, and the kickoff line `/run-handoff <dir>`, plus `--auto` to run it unattended.

## Decomposition

- **Vertical slices.** Each item cuts a narrow but complete path through every layer it needs (schema, logic, interface, tests) and is verifiable on its own. Items split by layer only meet at the end, which is where parallel builders' hidden assumptions collide.
- **Wide refactors go expand–contract.** A mechanical change whose blast radius crosses the codebase can't keep `Owns` disjoint or land green as one slice.
  - Expand: add the new form beside the old.
  - Migrate callers in batches, each blocked by the expand.
  - Contract: delete the old form, blocked by every batch.
- **Freeze contracts first.**
  - Any interface two concurrently running items code against (schema, types, CLI flags, file format, API shape) is a contract, frozen at gate `G0` before work fans out.
  - Items never change a contract; they propose changes.
  - Wiring that spans modules (startup and shutdown order, cross-module listeners) is a contract too, with one owning item.
- **Walking skeleton at `G0`.** When there is a user-facing flow:
  - `G0` adds a test that drives the main path end to end through the real entry point, with pending steps where modules don't exist yet.
  - Each item's acceptance includes making its steps real with the skeleton still passing.
  - If the flow has a UI, driving it is a test tier, not a manual gate step.
- **Concurrency comes from the graph.**
  - Items whose blockers are done and whose `Owns` are disjoint run at once; there are no lanes or phases to declare.
  - Shared hotspots (lockfiles, registries, central config) belong to one item or to `G0`.
  - A mostly linear graph is a fine answer; don't cut edges to look parallel.
- **Unknowns become spikes** (`S1`…): a question, a timebox, and the criteria for keeping or discarding the result. They block the items that depend on them.
- **Tool behaviour needs evidence.**
  - A decision that rests on how a third-party tool behaves cites a command run on the pinned version and its output, or a spike. Without either it becomes a spike.
  - Where the mechanism is uncertain, lock the outcome and list pre-approved fallback mechanisms the builder may switch between without stopping.
- **No implementation steps.** A "how" that matters is a decision; an unknown "how" is a spike.
- **Size:** one subagent can finish and verify an item in one fresh context.
- **Budgets:** each item has a no-progress threshold (default 10 minutes), an attempt deadline (default 60 minutes) and finite command timeouts. Override them explicitly for known long work; test duration alone is not an implementation budget.
- **Acceptance is observable.**
  - A command, its working directory and the expected result.
  - For a behaviour change, a test that fails before and passes after.
  - "Tests pass" alone is not acceptance.
  - If no reliable check exists, the first item builds one: builders optimise for whatever the check rewards.
- **Review focus:** the three to five failure classes most likely to slip past happy-path acceptance (bad input, partial failure, concurrency, upgrade paths), each assigned to the item whose acceptance must cover it.

## HANDOFF.md

- Self-contained: define each term where it first appears, restate findings instead of linking to them, and never write "as discussed".
- Repo-relative paths, and exact commands with their working directory.
- Redact secrets, tokens and personal data; name where to find them instead.
- IDs are stable and never renumbered, because `/run-handoff` tracks status by ID.
- Status never goes in this file.

```markdown
# <Title>: handoff

## Mission

<One paragraph: what exists when this is done, and why it matters.>

## Scope

In: … Out: …

## Context

<Repo, base branch and evidence commit, how to build/test/run (exact commands, cwd, measured duration or unverified), known-red baseline, conventions, terms.>
Skills: <skills the builder and its subagents should invoke, e.g. tdd, and when.>
Review model override: <only if the user chose one; otherwise use the invoking harness's default>.

## Locked decisions

### Yours

Stated by the owner for the scope recorded here. Do not re-litigate. If evidence shows one is wrong, raise it; don't deviate.

- U1 <decision>. Why: <reason>.

### Defaults

Accepted recommendations and implementation calls. Change one only if evidence shows it's wrong, and say so in the item's report.

- D1 <decision>. Why: <reason>.

### Mechanism uncertain

The builder may switch to the fallback without stopping, and says so in its report.

- D2 <outcome>. Chosen: <mechanism>. Fallback: <mechanism>. Why: <reason>. Evidence: <notes file or spike>.

## Contracts

- C1 <interface>: <shape, where it lives>. Frozen at G0.

## Trust boundaries

<Only when untrusted input reaches the system. What is trusted and what isn't; each secret and where it lives (not its value).>

- B1 <untrusted input> must not reach <secret or resource> → attacked by <item ID>'s acceptance.

## Work items

### A1 <title>

- Blocked by: G0, S1
- Owns: <paths only this item changes>
- Outcome: <1–3 sentences of behaviour>
- Acceptance: `cd <dir> && <cmd>` → <expected>
- Budget: no progress 10m; attempt 60m; commands <finite timeouts, within the attempt deadline>
- Constraints: U1, D1, C1
- Notes: notes/<area>.md (if needed)

### S1 <question> (spike, timebox <n>)

- Keep if … / discard if …

### G0 Contracts frozen

- Acceptance: C1… committed; <items> pass; reviewer signs off.

## Review focus

- <Failure class> → covered by <item ID>'s acceptance.

## Concurrency

Max items in flight: <n> (default 3; lower if tests contend for a cluster, ports, disk).

## Rules for this project

<Never/always beyond the generic loop: services not to call, files not to read or touch, time budgets.>

## Stop conditions

<Project-specific; the generic ones live in /run-handoff.>

## Gotchas

<Verified facts that will bite.>

## Open questions

<Not the builder's to decide and not answerable before the build: what will answer each one, and how to proceed meanwhile.>

## Amendments

<Dated entries from the owner, written by them or by the lead on their word; they override everything above.>
```

## --quick

Finish the current planner's work quickly, even when implementation is large. Draft from what is already settled. No graph-approval round or cold read unless explicitly requested. It still writes a complete `HANDOFF.md`.

1. **State the scope, don't wait.** Give the scope, exclusions and directory in one line. Ask before overwriting an existing `HANDOFF.md`.
2. **Harvest decisions** as in step 2 of the spine; reuse existing evidence and references.
3. **Research only a critical gap:** a missing fact that could invalidate scope, a contract or acceptance. Budget roughly two minutes total, including waiting, with at most one batch of two cheap read-only subagents if needed. Give them the remaining deadline. No test/build runs, broad discovery or repeated joins. When the budget expires, stop those subagents and do not wait for their answers; capture the remaining uncertainty instead.
4. **Ask only blocking product decisions.** Otherwise mark unverified assumptions in Context. Technical unknowns become bounded spikes or explicit builder validation before dependent work.
5. **Decompose by the normal rules.** Keep the items, parallelism, contracts, gates, skeleton, trust boundaries and budgets the build needs. There is no item-count cap; a hard implementation is not a reason to upgrade the planner to full mode.
6. **Write `HANDOFF.md`** using the template, omitting empty sections, not necessary safeguards. Acceptance stays observable; identify checks whose command or outcome has not been verified.
7. **Reread it yourself** for missing requirements, undefined terms, references to the discussion and unusable acceptance. Ask answerable open questions as in step 9 of the spine. If a cold read was explicitly requested, use Models above.
8. **Report** the path, unverified evidence, checks skipped and anything still open. End with `/run-handoff <dir>` and optional `--auto`.

A later full run starts from this file's scope, decisions and evidence rather than repeating them.
