# Upstream manuals

These Markdown snapshots are available offline. Use the [house references](../SKILL.md) for this repo's conventions and the harness bundled with your install to resolve version differences.

## Claude Code

- Plugins: [create a plugin](upstream/claude/create.md), [components](upstream/claude/components.md), [manifest](upstream/claude/manifest-reference.md).
- Mods: [create a mod](upstream/claude/mods-create.md), [reference](upstream/claude/mods-reference.md), [interface](upstream/claude/mods-interface.md), [events](upstream/claude/mods-events.md), [API](upstream/claude/mods-api.md), [tests](upstream/claude/mods-test.md), [troubleshooting](upstream/claude/mods-troubleshoot.md).

## Pi

- [Extensions](upstream/pi/extensions.md): lifecycle, commands, tools and extension UI.
- [Packages](upstream/pi/packages.md): how to distribute an extension.
- [Terminal UI](upstream/pi/tui.md): components, input, overlays and rendering.

## Refresh the snapshots

Run `just plugin-docs` from the checkout. It takes Claude Code's current public Markdown and the Pi docs at tag `v1.5.2`. When updating the Pi version, run `just plugin-docs vMAJOR.MINOR.PATCH` with the release tag and update the default in `skills/agent-plugin-dev/scripts/refresh-docs.ts`. Review the generated diff before committing it.
