# Plugin layout reference

Start with a working example in the [component catalogue](../../../kit/catalog/COMPONENTS.md) rather than recreating its spacing, colours or controls. The kit's tokens are the reference for exact values.

## Terminal

For a form that takes over prompt input, use a pi editor component or the Claude band above the prompt. Use an overlay in pi or a pane in Claude Code for a list or reference. A Claude pane may dock at about 48 columns, so don't rely on a side-by-side layout. For a pi overlay, pick a kit width class as a cap, not as a required width.

Put the title first. Let it wrap, and drop less useful metadata before cutting it. Use the kit's list and clamp to align columns and measure text in terminal cells. Keep the current row and the way out visible when the terminal gets narrow.

## Graphical surfaces

Use the Claude kit's native controls for Desktop and VS Code. Use a button for an action, a labelled field for input, and an expandable row when the same item has detail. Don't simulate a button with a glyph or print a row of terminal key hints. Let the pane or band size and scroll its contents.

Choose an existing pattern before adding one: `docfix` has a queue with evidence that opens in place; `linear-issue` has an editable draft; `answer` has a set of choices. The [Claude reference](claude.md) covers what the host actually renders and which actions can take focus.
