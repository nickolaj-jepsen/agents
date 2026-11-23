# @agents/kit-band

The one line above the prompt that says there is something to open: a status mark and the text, then a way in and further actions.

```ts
import { statusBand } from "@agents/kit-band/terminal.ts";
```

`src/terminal.ts` draws the component as styled lines for a width, `src/gui.tsx` in native controls for Claude Desktop and VS Code (the same names and props, less the width), `src/contract.ts` has its model and the props each drawing is given, `src/model.ts` its view model (what each surface draws), and `src/stories.ts` one sample per state as data, which the catalogue draws with each drawing's adapter. The component is on `schema: 2` (see the [kit guide](../README.md#schema-2-one-api-five-surfaces)). `e2e/` plays the stories in pi, Claude Code and VS Code and holds their snapshots.

```bash
pnpm drive ls kit-band                                    # the stories
pnpm drive live kit-band <story> --harness pi --watch     # one in a real session
```

What it can do on each surface is in the [catalogue](../catalog/COMPONENTS.md); how to paint and use it, in [the kit guide](../README.md).
