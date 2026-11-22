# @agents/kit-notice

One line telling the person what happened, in a role, and the dim words that stand in for a list's rows.

```ts
import { notice } from "@agents/kit-notice/terminal.ts";
```

`src/terminal.ts` draws the component as styled lines for a width, `src/gui.tsx` in native controls for Claude Desktop and VS Code (the same names and props, less the width), `src/contract.ts` has its props and results, and `src/stories.ts` one sample per state, which `src/stories.gui.tsx` draws with `gui.tsx`. `e2e/` plays the stories in pi, Claude Code and VS Code and holds their snapshots.

```bash
pnpm drive ls kit-notice                                    # the stories
pnpm drive live kit-notice <story> --harness pi --watch     # one in a real session
```

What it can do on each surface is in the [catalogue](../catalog/COMPONENTS.md); how to paint and use it, in [the kit guide](../README.md).
