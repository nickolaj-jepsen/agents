# Plugin layout reference

Draw with a kit component before making anything by hand. [`AGENTS.md`](../../../AGENTS.md) lists the components, the [catalogue](../../../lib/kits/catalog/COMPONENTS.md) says what each can do on each surface, and the [kit guide](../../../lib/kits/README.md) shows how to use and add one. The kit's [tokens](../../../lib/kits/core/src/tokens.ts) are the reference for exact values.

## Rules for every component

These hold on both clients. A kit component already follows them; they matter when you add a state or a component.

- **Focus** is a neutral `❯` and a bold label. The accent is not a focus colour.
- **Chosen** is the accent and a filled mark (`●`, `■`). Nothing else takes the accent, so a chosen answer is still readable with the keyboard elsewhere.
- **Hover** shows on the label, never by moving the focus pointer. pi bolds the label; Claude Code puts the row on a soft fill.
- **Close** sits in the frame's top-right corner. A form that would lose answers asks there, in place, before it closes. So does any other button that throws work away, such as Discard, while the buttons under it stand quiet.
- **Buttons** are label first with the key dim after it (`Send ↵`, `Note [n]`), the main action first. The suggested action is the only accented one.
- **Hints** are for keys a person would not guess. Arrows and Tab still work but are not printed.
- **Colour** comes from a role (`text`, `dim`, `accent`, `success`, `warning`, `error`), never from a raw colour. Use `success`, `warning` and `error` only for an actual state.
- **Shades:** words are `text` or `dim`. Rows told apart by slightly different whites read as noise.
- **Rules** carry a section's heading the way the frame's top carries its caption (`captionRule`: `─ Evidence ── 9 days ago ──── Read [e] ─`). Parts of a heading are set apart by a short rule, not by `·`.
- **Rails** down the left of a card or a group mean "answer each of these", as in Answer. A list nobody has to finish, such as docfix's queue, goes without (`rail: false`).
- **Windows** say how many rows they hide and nothing else: `↑ 3 more  ↓ 14 more`. Every kit window does (`scrolled`).

## Rules for every screen

These are the house's rules, not a screen's. A design that needs to break one asks the owner first, and a change to one is made in every plugin. Give this page to anyone who reviews a design.

- **One left edge.** Every section of a screen (its caption, its body, its footer) starts its words in the same column, under the caption's words, and its rules run the full width. Nesting is the only indent: the rows of a tree, or the choices opened under a field, are set in under their parent. A section is not set in again inside the frame's own inset.
- **Air between groups:** a blank row parts one group from the next, as it parts two cards.
- **The mouse works on both clients.** Whatever can be clicked on one client can be clicked on the other. A pi widget never takes the keyboard, so it names the command that does what its buttons do.
- **Writes take Enter.** Only Enter, or a click on the lit button, sends anything out of the plugin. An Enter or a click within 600 ms of the screen changing under it is ignored, and a second send while one is in flight is dropped.

## Terminal

Answer and Questions set the look on the terminal. Build from the kit even where a client's stock widget (pi's `SelectList`, a plain list in a pane) would be quicker.

For a form that takes over prompt input, use a pi editor component or the Claude band above the prompt. Use an overlay in pi or a pane in Claude Code for a list or reference. A Claude pane may dock at about 48 columns, so don't rely on a side-by-side layout. For a pi overlay, pick a width class as a cap, not as a required width.

A screen that fills its pane or sidebar ends on its button row, with no rule under it and a full-width rule over it, so the buttons don't run into what scrolls above. A pi sidebar has a divider at its edge that drags to resize it, as a Claude pane's does. A pi panel never covers the prompt: a sidebar stops above it, and a sheet stands on its rule (`sheet` with `foot: "none"`).

Put the title first. Let it wrap, and drop less useful metadata before cutting it. Measure and wrap in terminal cells with the kit's own functions, which count wide characters as two. Keep the current row and the way out visible when the terminal gets narrow.

On Claude Code, a pane or the band has the keyboard only after `ctrl+x tab` or a click in it, and a click in the transcript hands it back to the prompt. Wherever the kit's keys live, show the kit's keyboard hint so a person can tell where their keys go.

## Graphical surfaces

Use native controls on Desktop and VS Code. Use a button for an action, a labelled field for input, and an expandable row when the same item has detail. Don't simulate a button with a glyph or print a row of terminal key hints. Let the pane or band size and scroll its contents.

These are the house's rules for a graphical screen, held for every plugin. A design that needs to break one asks the owner first.

1. **Controls line up.** Controls that repeat down a screen share a column, and a label column has a fixed width. A label and its control never wrap together like words. A row of chips of one kind (labels, suggestions) may wrap; a row of fields of different kinds may not.
2. **Editing stays in place.** A value's editor takes the value's own cell, at its width. Opening one may push what's below it down, but never moves anything above or beside it. Read and edit are not two layouts.
3. **State has an icon.** A row's kind or state is an icon from the kit's set, in its role's colour (`meaning`, `priority:high`, `kind:stale`, `decision:apply`). A bare chosen mark is for terminals. An icon is an image, so it keeps its colour on a light theme: only a mid-tone reads on both.
4. **Hierarchy comes from size.** Titles, headings, body and captions take the kit's type roles (`typed`, `tokens.type`), never a raw size. Dim and bold are not the only levels. A count or a time sets `tabular` digits.
5. **What opens in place sits in a panel.** An editor, a warning with its own actions, or an opened row is set apart as one object (`panel`): filled on graphical surfaces, on a rail on the terminal (`panelLines`). A group of rows that is always there is not a panel.

Rows keep one beat: a row is its line plus `tokens.gui.row.pad` of space above and below whether or not a Button is in it, with `tokens.gui.row.gap` between rows (`rowOf`, `rows`). One Button per screen is lit, and the pane's own Close is the host's: the kit draws Discard and Keep only while Close asks.

Choose an existing pattern before adding one: `docfix` has a queue with evidence that opens in place; `linear-issue` has an editable draft; `answer` has a set of choices. On the terminal, `linear-issue` is also the pattern for a record reviewed before it is sent: lettered fields that open their choices in place, and only Enter sends. The [Claude reference](claude.md) covers what the host actually renders and which actions can take focus.
