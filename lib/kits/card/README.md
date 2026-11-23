# @agents/kit-card

A question with lettered answers and a note, and the steps and summary of a form of several.

```ts
import { choiceList } from "@agents/kit-card/terminal.ts";
```

`src/terminal.ts` draws the component as styled lines for a width, `src/gui.tsx` in native controls for Claude Desktop and VS Code (the same names and props, less the width), `src/contract.ts` has its model and the props each drawing is given, `src/model.ts` its view model (the rail, the note's panel, a surface with no field), and `src/stories.ts` one sample per state as data, which the catalogue draws with each drawing's adapter. The component is on `schema: 2` (see the [kit guide](../README.md#schema-2-one-api-five-surfaces)). `e2e/` plays the stories in pi, Claude Code and VS Code and holds their snapshots.

```bash
pnpm drive ls kit-card                                    # the stories
pnpm drive live kit-card <story> --harness pi --watch     # one in a real session
```

What it can do on each surface is in the [catalogue](../catalog/COMPONENTS.md); how to paint and use it, in [the kit guide](../README.md).
