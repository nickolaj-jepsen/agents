# @agents/kit-frame

A form between two rules: a caption and Close in the top one, buttons above the bottom one.

```ts
import { captionFrame } from "@agents/kit-frame/terminal.ts";
```

`src/terminal.ts` draws the component as styled lines for a width, `src/contract.ts` has its props and results, and `src/stories.ts` one sample per state. `e2e/` plays the stories in pi and Claude Code and holds their snapshots.

```bash
pnpm drive ls kit-frame                                    # the stories
pnpm drive live kit-frame <story> --harness pi --watch     # one in a real session
```

What it can do on each surface is in the [catalogue](../catalog/COMPONENTS.md); how to paint and use it, in [the kit guide](../README.md).
