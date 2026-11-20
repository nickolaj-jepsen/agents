---
name: agent-plugin-dev
description: "Design, build and check the UI of a plugin in this repo, for Claude Code (a mod's pane, band, status, in the terminal, the desktop app and VS Code) and pi (an extension's overlay, form, widget): the house style, the shared UI kit, and drivers that park a real session (terminal or VS Code) on any screen and photograph it. Use when developing, fixing or reviewing what a mod or pi extension draws, its keys, mouse or focus; before handing any plugin UI change back; when a plugin seems to do nothing; or when asking how one renders."
compatibility: Works in a checkout of nickolaj-jepsen/agents, with nix, Claude Code signed in and pi.
metadata:
  summary: "the UI of a Claude Code mod or pi extension, with a house style, a shared kit and a driver that parks a real session on any screen."
  category: harnesses
---

Start with the [layout reference](references/style.md) and an example from the [kit catalogue](../../kit/catalog/COMPONENTS.md). Sketch the busiest state at the narrowest and widest sizes. Design for each harness's controls rather than forcing one layout onto both.

- [Claude](references/claude.md): available surfaces, focus, graphical controls and their traps. Load `plugin-authoring` for the API.
- [pi](references/pi.md): available surfaces, runtime traps and session logs.
- [Offline upstream manuals](references/upstream.md): packaging and extension APIs.
- [Kit guide](../../kit/README.md): change the shared kit instead of maintaining separate frames, text clamping or key hints in plugins.
- [Replay guide](../../e2e/README.md): write scenarios, drive a screen, take pictures and check snapshots.

If a plugin does nothing, look at the running session before guessing. In pi, startup `cap` shows `[Extension issues]`; in Claude, the session debug log shows rejected hooks and trees.

## Before handing back

1. Add or use an `extreme: true` scenario with long text, wide characters and more items than fit. Check empty and error states as well.
2. Run `sweep` and open each PNG (70×24, 112×32, 160×45, 240×60). Report what wraps or is cut, whether rows and columns stay aligned, whether the width stays bounded, and which hints and controls remain at 70 columns.
3. Try every visible key and click target with both an empty prompt and a draft. Run the plugin's scenarios and inspect any snapshot diff you accept.
4. For a Claude mod, mount the states on `desktop` and `vscode` in mod tests, exercise keyed actions, and run `expectNative`. In VS Code, click the actions and inspect each state at 420×800, 420 wide at full height, and 1280×720. Use the [graphical screen procedure](references/claude.md#looking-at-a-graphical-screen). Report anything you could not check on Desktop.

Use hermetic scenarios and canned turns; don't send real prompts just to reach a state. If you couldn't run a session, say what remains unverified.
