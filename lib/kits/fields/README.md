# @agents/kit-fields

What a record holds, one named value each: a row per field, or side by side.

```ts
import { fields } from "@agents/kit-fields/terminal.ts";
```

`src/terminal.ts` draws the component as styled lines for a width, `src/gui.tsx` in native controls for Claude Desktop and VS Code (the same names and props, less the width), `src/contract.ts` has its model (a field's editor is data: `one`, `many` or `text`) and the props each drawing is given, `src/model.ts` its view model (which control a value cell is), and `src/stories.ts` one sample per state as data, which the catalogue draws with each drawing's adapter. The component is on `schema: 2` (see the [kit guide](../README.md#schema-2-one-api-five-surfaces)). `e2e/` plays the stories in pi, Claude Code and VS Code and holds their snapshots.

```bash
pnpm drive ls kit-fields                                    # the stories
pnpm drive live kit-fields <story> --harness pi --watch     # one in a real session
```

What it can do on each surface is in the [catalogue](../catalog/COMPONENTS.md); how to paint and use it, in [the kit guide](../README.md).
