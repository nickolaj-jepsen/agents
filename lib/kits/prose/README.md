# @agents/kit-prose

A text of several blocks set as lines whose rows can be counted, and the window a short room shows of it.

```ts
import { prose } from "@agents/kit-prose/terminal.ts";
```

`src/terminal.ts` draws the component as styled lines for a width, `src/gui.tsx` in native controls for Claude Desktop and VS Code (the same names and props, less the width), `src/contract.ts` has its props and results, and `src/stories.ts` one sample per state, which `src/stories.gui.tsx` draws with `gui.tsx`. `e2e/` plays the stories in pi, Claude Code and VS Code and holds their snapshots.

```bash
pnpm drive ls kit-prose                                    # the stories
pnpm drive live kit-prose <story> --harness pi --watch     # one in a real session
```

What it can do on each surface is in the [catalogue](../catalog/COMPONENTS.md); how to paint and use it, in [the kit guide](../README.md).
