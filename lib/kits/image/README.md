# @agents/kit-image

Draws PNG images at their aspect ratios, with optional file links and a caption.

```ts
import { imageGallery } from "@agents/kit-image/terminal.ts";
```

`src/terminal.ts` draws the component as styled lines for a width, `src/contract.ts` has its model and the props the terminal is given, and `src/stories.ts` one sample per state as data. It has no graphical drawing, and its manifest says why (`parts.imageGallery.none.gui`): the graphical surfaces draw an image themselves, from the `image` slot of a line. The component is on `schema: 2` (see the [kit guide](../README.md#schema-2-one-api-five-surfaces)). `e2e/` plays the stories in pi and Claude Code and holds their snapshots.

```bash
pnpm drive ls kit-image                                    # the stories
pnpm drive live kit-image <story> --harness pi --watch     # one in a real session
```

What it can do on each surface is in the [catalogue](../catalog/COMPONENTS.md); how to paint and use it, in [the kit guide](../README.md).
