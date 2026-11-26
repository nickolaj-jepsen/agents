---
name: agent-setup
description: "Change your agent setup: harnesses, Herdr, plugins, skills, MCP, and their configuration."
argument-hint: "[what to change]"
disable-model-invocation: true
metadata:
  version: 0.1.0
  summary: "One entry point to change, test, and safely apply your agent setup."
  category: harnesses
  uses: [agent-plugin-dev, writing-for-agents]
---

Turn the requested setup change into a tested change at its source, then apply the smallest safe update. This is a router, not a replacement for the tools' instructions.

## 1. Find the owner

Identify the affected surface and its persistent source before editing:

- Find the agents checkout from `AGENTS_CHECKOUT`, the installed `agents` wrapper/configuration, or local repository instructions. Confirm it contains the expected `apps/`, `skills/`, and `lib/tools/` trees. Discover paths rather than assuming a home directory or checkout name.
- Read that checkout's `AGENTS.md` and `docs/development.md`, and the instructions for any other repository you need to change. For declaratively managed settings, find the configuration repository and its owning module.
- For Herdr, locate the active app home (including `HERDR_APP_HOME` or an explicit override). Read its generated `AGENTS.md` and, when changing a mod, the local type files it names. Treat these as version-matched API references, not files to edit. Distinguish user-owned customizations, shipped files, and artifacts deployed from the agents checkout.
- For harness settings, extensions, hooks, or MCP, consult the installed harness's documentation and the owning configuration. Establish which settings are generated and which can be edited directly.

Finish discovery with a source → build/configuration → runtime map for the affected surface. If ownership is ambiguous, resolve it before editing; if a required tool or checkout is absent, report the missing prerequisite rather than installing a replacement stack.

## 2. Load only the relevant route

Paths below are relative to the discovered agents checkout, not the installed skill directory.

| Change                                                                          | Read or load before implementing                                                                                                                                                                                |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude/pi plugin UI, keys, mouse, focus, or a plugin that appears to do nothing | Load `agent-plugin-dev`; follow its house style, harness references, and real-session verification procedure.                                                                                                   |
| Skills, agent instructions, or context pointers                                 | Read `writing-for-agents/SKILL.md` from the installed skills as reference, including its skill-mechanics reference when writing a skill. Follow the repository's dependency, changelog, and registration rules. |
| Harness APIs, settings, hooks, or MCP                                           | Read that harness's current manuals and the configuration module's instructions. Use `agent-plugin-dev` too when an extension changes visible UI or interaction.                                                |
| Herdr layouts, mods, keys, or appearance                                        | Read the active app home's `AGENTS.md` and relevant type definitions. Find whether the persistent owner is the agents UI artifact, declarative configuration, or a user-owned clone.                            |
| Driving agents, inspecting screens, or offering a session to the user           | Read `lib/tools/drive/README.md`; inspect `pnpm drive --help`. For Herdr/core automation, consult `herdr-app --help`, `hc --help`, and the app's instructions.                                                  |
| Publication, reset, profile refresh, or reload                                  | Read `lib/tools/updates/README.md`; inspect the installed `agents --help` and `agents status`. Use the available version's capabilities.                                                                        |
| Supporting Nix/system configuration                                             | Follow the owning repository's evaluation, build, sandbox, and approval rules.                                                                                                                                  |

A task can take several routes. Load each needed specialist once; keep unrelated specialists out of context. Ask focused questions only for unresolved decisions, not facts the environment can supply.

## 3. Edit and prove the change

Edit the persistent owner, then use its prescribed formatters and focused checks. Preserve unrelated work and keep fixtures, state, and driver sessions isolated from the person's setup.

- For plugin UI, use the specialist's real-harness checks, including interaction and screenshots. Use canned scenarios rather than real prompts to reach a state.
- For Herdr mods, run the app's checker and inspect the result in a running app; a passing initial check does not exercise deferred renders or later states. Prefer an isolated app instance for development.
- For skills/instructions, check the description, routes, dependencies, and completion criteria against representative requests. Validate frontmatter and regenerate repository indexes with the repository's tools.
- For configuration, evaluate/build or use the repository's sandbox before live activation.

Use the drivers' documented watched/in-place workflow for a tight loop in sessions you own for this task. Track those sessions so cleanup cannot stop somebody else's work. If a required check cannot run, identify the gap and ask before live application that depends on it.

## 4. Apply narrowly; reload only when safe

A request to make a setup change normally includes a validated, targeted local application. It does not grant permission to push Git commits, switch/boot a system generation, force a restart, or disrupt unrelated sessions.

For the updates tool, use the documented `agents update <name>` workflow for the affected plugin, `--skill` for a skill, or the named Herdr UI artifact. Inspect the current state first and record what rollback would restore: `reset` returns to the pinned baseline, not necessarily the previously published override. Keep existing roots and snapshots intact. Use profile refresh through its configured launcher/helper contract rather than hand-editing generated profiles. Publication and Git release are separate operations.

Choose the least disruptive runtime path:

- **Owned test session:** use the driver's documented in-place reload when suitable; replay/restart only that test session if necessary.
- **Personal session:** establish the full affected set before requesting reload. Confirm there is no active work, draft input, open overlay, or unsaved extension state that reload could discard. Idle alone is insufficient; if observability or targeting is inadequate, ask or leave the change ready for the next launch. Never type a reload command into someone else's prompt.
- **Pi publication bridge:** use `--live pi` only after those checks. Consult the guide for its same-user fan-out and idle queueing; a request is not an acknowledgement, and eligibility may change while queued.
- **Claude publication:** use the supported next-launch path when runtime reload is unavailable. A development mod watcher is not evidence that published plugin paths can be replaced in a personal session.
- **Herdr artifact:** publication deploys files into a watched tree and can affect the live window without a restart. Check that this live change is acceptable before publishing; stage in isolation or ask if it could interrupt work. Verify the rendered behavior, not just the file write.

When safe reload cannot be established, prefer next-launch readiness over interrupting the user. Use broader activation only with explicit approval.

## 5. Report the actual boundary reached

State the source changed, checks run, snapshot/configuration applied, and what the running app or harness demonstrably loaded. Separate **built**, **published/deployed**, **reload requested**, **acknowledged**, and **observed working**. Include unverified behavior, deferred reloads, and the applicable rollback path. Stop and clean up only the test sessions this task owns.
