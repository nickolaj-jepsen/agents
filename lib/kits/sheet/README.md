# @agents/kit-sheet

A panel laid over the screen, closed on every side: the title and Close in its top edge, buttons at its foot.

```ts
import { sheet } from "@agents/kit-sheet/terminal.ts";
```

`src/terminal.ts` draws the component as styled lines for a width, `src/contract.ts` has its props and results, and `src/stories.ts` one sample per state. `e2e/` plays the stories in pi and Claude Code and holds their snapshots.

```bash
pnpm drive ls kit-sheet                                    # the stories
pnpm drive live kit-sheet <story> --harness pi --watch     # one in a real session
```

What it can do on each surface is in the [catalogue](../catalog/COMPONENTS.md); how to paint and use it, in [the kit guide](../README.md).
