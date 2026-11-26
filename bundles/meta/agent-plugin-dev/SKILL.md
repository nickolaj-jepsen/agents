---
name: agent-plugin-dev
description: "Design, build and check the UI of a plugin in this repo, for Claude Code (a mod's pane, band, status, in the terminal, the desktop app and VS Code) and pi (an extension's overlay, form, widget): the house style, the shared UI kit, and drivers that park a real session (terminal or VS Code) on any screen and photograph it. Use when developing, fixing or reviewing what a mod or pi extension draws, its keys, mouse or focus; before handing any plugin UI change back; when a plugin seems to do nothing; or when asking how one renders."
compatibility: Works in a checkout of nickolaj-jepsen/agents, with node 24, pnpm and Claude Code signed in; VS Code pictures and site media also need nix.
metadata:
  version: 0.1.0
  summary: "the UI of a Claude Code mod or pi extension, with a house style, a shared kit and a driver that parks a real session on any screen."
  category: harnesses
---

Start with the [layout reference](references/style.md) and an example from the [kit catalogue](../../lib/kits/catalog/COMPONENTS.md). Sketch the busiest state at the narrowest and widest sizes. Design for each harness's controls rather than forcing one layout onto both.

- [Claude](references/claude.md): available surfaces, focus, graphical controls and their traps. Load `plugin-authoring` for the API.
- [pi](references/pi.md): available surfaces, runtime traps and session logs.
- [Offline upstream manuals](references/upstream.md): packaging and extension APIs.
- [Kit guide](../../lib/kits/README.md): change the shared kit instead of maintaining separate frames, text clamping or key hints in plugins.
- [Driver guide](../../lib/tools/drive/README.md): write scenarios, drive a screen, take pictures and check snapshots.

Run repo tasks as `pnpm turbo run <task>`. Drive a session with `pnpm drive <verb>` instead (`pnpm drive --help` lists them): it is not a turbo task, because turbo stops what a task leaves running and `goto` would park nothing. A parked claude or pi session is read and driven through the tui-test CLI with `pnpm drive terminal <command>`; a VS Code session with drive's own `cap`, `click`, `wait`, `shot` and `resize`.

```bash
pnpm drive goto <package> <scenario> --harness pi   # park the real agent on that screen
pnpm drive terminal text                            # the screen as text
pnpm drive terminal click text "…"                  # click visible text
pnpm drive terminal expect text "…"                 # verify it changed
pnpm drive terminal screenshot -o /tmp/shot.png     # look at the pixels
pnpm drive stop                                     # end it and clean up
```

`pnpm drive terminal help` and `pnpm drive terminal usage` are the CLI's own guide.

If a plugin does nothing, look at the running session before guessing. In pi, `pnpm drive terminal text` shows `[Extension issues]` at startup; in Claude, the session debug log shows rejected hooks and trees.

## Before handing back

1. Add or use an `extreme: true` scenario with long text, wide characters and more items than fit. Check empty and error states as well.
2. Run `pnpm drive sweep --out <review-dir>` and open each PNG (70×24, 112×32, 160×45, 240×60). Report what wraps or is cut, whether rows and columns stay aligned, whether the width stays bounded, and which hints and controls remain at 70 columns.
3. Try every visible key and click target with both an empty prompt and a draft. Run the plugin's scenarios and inspect any snapshot diff you accept.
4. For a Claude mod, mount the states on `desktop` and `vscode` in mod tests, exercise keyed actions, and run `expectNative`. In VS Code, click the actions and inspect each state at 420×800, 420 wide at full height, and 1280×720. Use the [graphical screen procedure](references/claude.md#looking-at-a-graphical-screen). Report anything you could not check on Desktop.

Use hermetic scenarios and canned turns; don't send real prompts just to reach a state. If you couldn't run a session, say what remains unverified.
