# Plugin layout reference

Draw with a kit component before making anything by hand. [`AGENTS.md`](../../../AGENTS.md) lists the components, the [catalogue](../../../kit/catalog/COMPONENTS.md) says what each can do on each surface, and the [kit guide](../../../kit/README.md) shows how to use and add one. The kit's [tokens](../../../kit/tokens.ts) are the reference for exact values.

## Rules for every component

These hold on both clients. A kit component already follows them; they matter when you add a state or a component.

- **Focus** is a neutral `❯` and a bold label. The accent is not a focus colour.
- **Chosen** is the accent and a filled mark (`●`, `■`). Nothing else takes the accent, so a chosen answer is still readable with the keyboard elsewhere.
- **Hover** shows on the label, never by moving the focus pointer. pi bolds the label; Claude Code puts the row on a soft fill.
- **Close** sits in the frame's top-right corner. A form that would lose answers asks there, in place, before it closes.
- **Buttons** are label first with the key dim after it (`Send ↵`, `Note [n]`), the main action first. The suggested action is the only accented one.
- **Hints** are for keys a person would not guess. Arrows and Tab still work but are not printed.
- **Colour** comes from a role (`text`, `dim`, `accent`, `success`, `warning`, `error`), never from a raw colour. Use `success`, `warning` and `error` only for an actual state.

## Terminal

For a form that takes over prompt input, use a pi editor component or the Claude band above the prompt. Use an overlay in pi or a pane in Claude Code for a list or reference. A Claude pane may dock at about 48 columns, so don't rely on a side-by-side layout. For a pi overlay, pick a width class as a cap, not as a required width.

Put the title first. Let it wrap, and drop less useful metadata before cutting it. Measure and wrap in terminal cells with the kit's own functions, which count wide characters as two. Keep the current row and the way out visible when the terminal gets narrow.

On Claude Code, a pane or the band has the keyboard only after `ctrl+x tab` or a click in it, and a click in the transcript hands it back to the prompt. Wherever the kit's keys live, show the kit's keyboard hint so a person can tell where their keys go.

## Graphical surfaces

Use native controls on Desktop and VS Code. Use a button for an action, a labelled field for input, and an expandable row when the same item has detail. Don't simulate a button with a glyph or print a row of terminal key hints. Let the pane or band size and scroll its contents.

Choose an existing pattern before adding one: `docfix` has a queue with evidence that opens in place; `linear-issue` has an editable draft; `answer` has a set of choices. The [Claude reference](claude.md) covers what the host actually renders and which actions can take focus.
