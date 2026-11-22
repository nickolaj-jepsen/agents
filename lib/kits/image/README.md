# @agents/kit-image

Draws PNG images at their aspect ratios, with optional file links and a caption.

```ts
import { imageGallery } from "@agents/kit-image/terminal.ts";
```

`src/terminal.ts` draws the component as styled lines for a width, `src/contract.ts` has its props and results, and `src/stories.ts` one sample per state. It has no graphical drawing: the graphical surfaces draw an image themselves, from the `image` slot of a line. `e2e/` plays the stories in pi and Claude Code and holds their snapshots.

```bash
pnpm drive ls kit-image                                    # the stories
pnpm drive live kit-image <story> --harness pi --watch     # one in a real session
```

What it can do on each surface is in the [catalogue](../catalog/COMPONENTS.md); how to paint and use it, in [the kit guide](../README.md).
