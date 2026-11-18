# House style

One style for every plugin UI, in Claude Code and pi. Each rule is a default: depart from it when a screen reads better another way, and say why in the hand-back. The numbers and glyphs live in the kit's tokens, so a change there restyles every plugin.

Every section up to "Graphical surfaces" is the terminal's style: pi, and Claude Code in a terminal. The Claude Code desktop app and VS Code extension draw real controls in a proportional font, and have their own section at the end.

## What comes out by default, and is wrong

An agent left alone draws these. Each is a defect here:

- a panel that grows with the terminal, so lines run 200 columns wide;
- a title cut to one line while half the panel is empty;
- metadata appended to the title, so it floats at a different column on every row and falls off first;
- `·` between fields. Never use the centre dot as a separator;
- no blank rows and no padding: every row touching the next and the border;
- inverse video across a selected row;
- hints that vanish all at once when the panel is narrow;
- widths measured with `.length`, or text cut with `.slice`;
- a key that works but is not shown, or a shown key that does nothing;
- emoji.

## Decide the surface first

Say which one the UI is before laying anything out.

| Surface         | What it is                                                | Width                             |
| --------------- | --------------------------------------------------------- | --------------------------------- |
| Input-replacing | takes over the prompt: a question form, a draft           | full width                        |
| Content panel   | something you read or pick from: a queue, a picker, a log | a width class, below              |
| Chrome          | footer, status, band row                                  | one line, dim unless it needs you |

Content panels take a width class. It is a cap, never a target: the panel is as wide as the terminal allows up to the cap.

| Class     | For                                 | Cap                                     |
| --------- | ----------------------------------- | --------------------------------------- |
| `reading` | a list with descriptions, prose     | 96 columns, prose wrapped at 80         |
| `split`   | a list with a detail pane beside it | 124 columns                             |
| `dialog`  | a short form, a confirm             | 72 columns                              |
| `wide`    | a log, a table, a diff              | the terminal less a 2-column margin     |
| `auto`    | little content                      | fits the content, within `dialog`'s cap |

In Claude Code the surface decides a pane's place, not the mod: it docks beside the transcript from 110 columns in fullscreen (24 columns to 45% of the terminal) and sits inline above the prompt otherwise. So:

- a form or a prompt goes in the band above the prompt, never a pane;
- a pane is for reference content or a short list, and is laid out for about 48 columns as well as for the inline width;
- a pane is opened through the kit's `paneOptions({...})`, which makes it transparent with no fill; never pass `backgroundColor` yourself;
- `Box` has no `maxWidth`: compute a cap from `bodyColumns`.

## List with detail

In pi, a list whose rows have detail is two panes from 110 columns: the list on the left, the selected row's detail on the right, one border around both with a `┬`/`┴` divider. Below 110 columns it stacks, list above detail. The detail pane shows the selected title in full, then its metadata spelled out, then the body.

In a Claude pane there is no room for two panes: rows carry their own metadata line and the detail follows the list.

## Rows

- The title is the content and is the last thing cut. Wrap it with the kit's text component (below); never cut it to one line while there is room.
- Metadata sits in right-aligned columns with a 2-cell gutter, at the same column on every row, so it can be scanned downwards. Each field has a fixed width. When the row is too narrow for the columns (a docked pane), metadata takes its own dim line under the title.
- Hide the lowest-priority metadata column before shortening the title.
- Selection is a `❯` pointer in the gutter plus the accent colour on the title. No inverse video.
- Marks: `□` and `■` for several-of-many, `○` and `●` for one-of-many.
- Every row is the same height whether or not it is selected, so the list does not jump as the cursor moves.

## The text component

`clamp(text, width, {min?, max?, target?})` wraps to the width and returns lines.

- `target` is a length in characters: it shows as many lines as that much text needs at this width, so a narrow pane gets more lines than a wide list.
- `min` and `max` bound the line count. None of the three has a default; `{min: 1, max: 1}` is the one-line truncation, and no options means wrap without limit.
- When text is cut, the last line is filled to its end before the `…`. Never cut early and leave the line short.
- It measures in terminal cells, not characters.

Use it for every title and description.

## Sections and spacing

- One cell of padding inside any border. One blank row under the title and above the hints.
- One blank row between groups while the whole list fits. When it would have to scroll, drop the blank rows first.
- A section header is bold, followed by a dim rule to the edge: `docs/agents.md ─────────`. The rule separates when there is no room for a blank row.
- One border around a pi modal, rounded. No border inside a border, and no horizontal rule where a blank row would do.
- A Claude pane already has its frame: no border, one cell of padding, and the title as `─ Title  count ─────` so both harnesses share a title line.
- Two spaces between unrelated things on a line. Spaces only, never tabs.
- A pi modal that takes focus is centred. It covers only its own cells; the transcript stays visible around it.
- A list shows a row whole or not at all. When rows are hidden, say so (`↓ 2 more`).

## Key hints

- Every key the UI accepts is shown, and nothing is shown that does nothing.
- In pi they are set into the bottom border, left-aligned, the border running between them: `╰─ ↑↓ move ── space mark ── a apply ── esc later ─╯`. Key in normal weight, label dim.
- When they do not fit, drop the lowest-priority hint first. Never drop the way out (`esc`), and never drop them all.
- In Claude Code keys belong to `Button`s, which the engine draws; put them in one row, 2 cells apart, after a blank row.

## Colour

Four roles, taken from the theme, never hard-coded:

| Role   | For                                                             |
| ------ | --------------------------------------------------------------- |
| text   | what you read                                                   |
| dim    | anything that needs no attention: metadata, rules, hints, paths |
| accent | the title and the selection, nothing else                       |
| status | success, warning, error, only for an actual state               |

- A colour on metadata marks a state or a threshold, and most rows should carry none: in docfix, `!` is error and the seen count turns warning from 3×. If most rows are coloured, the colour says nothing.
- No background fills. No emoji.
- Focus and selection must still read with colour off: that is what the pointer is for.

## Glyphs

All one cell wide. Check a new one in a screenshot before using it; some fonts draw symbols two cells wide.

| Glyph       | Use                                                              |
| ----------- | ---------------------------------------------------------------- |
| `❯`         | selection pointer                                                |
| `□` `■`     | several-of-many, off and on                                      |
| `○` `●`     | one-of-many, off and on                                          |
| `…`         | cut text                                                         |
| `─`         | rules and title lines                                            |
| `✓`         | done                                                             |
| `×`         | a count: `3×`                                                    |
| `│` `╰▸`    | a note's gutter: `│` on each line but the last, `╰▸` on the last |
| `+` `↻` `!` | docfix kinds: missing, stale, wrong (`!` in error)               |

An icon stands alone where the word is spelled out nearby (a detail pane), and is followed by its word where it is not.

## A note

```
│  first line of the note
│  second line
╰▸ third line
```

A one-line note is `╰▸ the note`. The gutter is dim.

The gutter points at the one thing the note belongs to. Never use it for a list of several entries.

## Dated entries

A log, a history, evidence: several entries, each with a date. From 50 columns the date is a fixed dim column on the left and the text hangs beside it, so entries are found by scanning down the edge. Narrower, the date is a dim line above the text. One blank row between entries, no bullets and no gutter. Leave out identifiers nobody reads, such as a session id.

```
2026-11-13  `just build` printed error:
            derivation failed while…

2026-10-16  The section says the build
            verifies a pi change, but…
```

## States every UI has

Design each of these, not only the full one: empty; one item; more items than fit; text far longer than expected, in every field; wide characters; an error or notice; the narrowest size it supports.

Say what happens at the narrowest size. A review that does not name it has not finished.

## Graphical surfaces

The desktop app and the VS Code extension draw a mod's tree with their own controls, in a proportional font. Cells, glyphs and the terminal's rules above do not apply there. The kit draws both from one call (`claude.md`, "Graphical surfaces"), and docfix's pane is the reference screen.

### The idea

- A calm list where things open in place. A row is one line; opening it shows its detail under it, in the same pane.
- The host already frames the pane and draws its title and close mark. Draw no box, border or card inside it.
- Only the control worth pressing now is filled. Every other button is quiet.
- Design for the inline pane: about 234 pixels tall (13 lines of text) in a 420-pixel-wide editor. A docked pane is about 350 pixels wide and draws the same; it needs no layout of its own.

### Spacing

Use the kit's numbers, never a step name such as `"md"`. VS Code draws a step as a whole line or none down the page, so a step gives either rows that touch or a blank line between every part.

Down the page, `tokens.gui.space`, in lines of body text (a line is about 18 pixels in VS Code):

| Step | Lines | Between                                                                                |
| ---- | ----- | -------------------------------------------------------------------------------------- |
| `xs` | 0.2   | the lines of one part: a heading and its rows, a label and its text, wrapped buttons   |
| `sm` | 0.5   | the parts of one item: its text, meta line, detail and keys; the paragraphs of detail  |
| `md` | 0.9   | things that stand alone: groups, and the pane's regions (toolbar, list, `Show N more`) |

Rows space themselves with padding, 0.2 folded and 0.5 opened, and have no gap between them.

Across, `tokens.gui.across`, in cells:

| Step    | Cells | Between                                                                                |
| ------- | ----- | -------------------------------------------------------------------------------------- |
| `xs`    | 0.6   | the buttons of one row                                                                 |
| `sm`    | 0.8   | an icon and its text                                                                   |
| `md`    | 1.2   | a line's text and its control; a label and its value                                   |
| `inset` | 1     | each side of every block: toolbar, headings, rows, notices, empty state, `Show N more` |

Every block shares the inset, so their left edges line up. An opened row's fill spans the pane's width, and its content keeps the inset.

### Hierarchy

There are no type sizes: VS Code draws every `size` alike. Hierarchy is weight, dim and colour.

| What                                   | Drawn                                              |
| -------------------------------------- | -------------------------------------------------- |
| A group heading (a doc's path)         | semibold                                           |
| A row                                  | regular, its icon before it                        |
| A row's meta line                      | the kind's word in its status colour, the rest dim |
| A heading inside an item ("Details")   | semibold and dim (`subhead`)                       |
| A label: a date and who, a fact's name | dim                                                |
| Body text: a claim, evidence           | regular                                            |
| A count, the empty state               | dim                                                |

The colour roles are the terminal's. Colour marks a state only: a kind's icon and word, a row set to apply. Most rows carry one coloured icon and nothing else in colour.

### Patterns

Each names the kit function that draws it; `claude.md` says how to call them.

**A folded row** (`card`). One line: the icon, the text cut at the edge by the surface, and a quiet `Open` at the far edge.

- Do keep it to one line, with code spans in chips.
- Don't wrap a folded row to two or three lines: the inline pane then holds three rows.

**An opened row** (`card`, opened).

- The row sits in a well: the theme's second background, with rounded corners.
- Its text is shown whole, and its button says `Close`.
- Everything under the text (the meta line, the detail, the keys) is set in under the text, not under the icon or at the pane's edge.
- A thin rule runs down from the icon to the end of the body. It says the body belongs to that line.
- One row is open at a time: opening a row folds the one that was open.
- Don't put a whole blank line between the parts, set the body at the pane's edge, or leave several rows open.

**Groups** (`section`). A semibold heading at the inset, its rows `xs` under it, groups `md` apart. Nothing at the heading's right: no keys that act on a whole group, and no press that opens every row of it.

**The toolbar** (`paneTitle` with `gui.actions`). The pane's first line. On the left, the count, dim (`3 open`), or what closing will do once something is set (`On close: apply 1, dismiss 1`). At the far edge, the pane's actions. The main one (Submit) is quiet until there is something to submit, then filled. The terminal's action row at the foot is not drawn here.

**Choices** (`choice`, `gui.layout: "row"`). One button per option in a row, the chosen one filled and the rest quiet. An option that means "nothing" (skip) is never filled.

**An action row** (`actionBar`). A word or two per button, labels capitalised, the main one filled. These are the only buttons that may carry a hotkey.

**Prose and labels.** Text a person or an agent wrote (a claim, evidence) is `Markdown` (`prose`), so code spans and links draw. Headings, labels, meta and anything cut to one line are `Text`. A Markdown block can't be cut, so a folded row is a `Text`.

**Facts** (`facts`). A dim label, then its value beside it, wrapping under itself. Several entries of evidence each get a dim label line (`2026-11-16  claude`) over their text; there is no date column.

**The band above the prompt** (`statusBand`). The status icon, the count in words (`3 doc suggestions to review`) and a quiet button with a verb (`Review`). The prompt's send button stays the one filled control in view.

**The empty state** (`emptyState`). One dim paragraph at the inset: what is missing, and what makes rows appear.

**A long list** (`capped`). The first 12 rows (`tokens.gui.maxItems`), then a quiet `Show N more` at the inset. The terminal shows every row, as its pane scrolls.

**A notice** (`notice`). One line at the inset in its status colour.

**Icons** (`icon`). Stroked drawings on a 16-pixel grid, drawn 16 pixels square.

- The set: `wrong`, `stale`, `missing`, `warning`, `success`, `error`.
- An icon is an image and can't follow the theme, so its colours are fixed in `tokens.gui.tone`: neutral `#8b8f98`, error `#e5534b`, warning `#d4962a`, success `#3fa65b`.
- An icon is neutral unless it marks a state.
- A new icon goes into the kit's set, on the same grid with the same 1.5 stroke.

### Rules

- No rule made of repeated characters.
- No glyph standing in for a control (`▸`, `□`, `❯`): a control is a `Button`.
- No key hints in text.
- No text cut or padded by the mod: the surface cuts a line (`truncate-end`).
- Nothing sized to the viewport or counted in cells by the mod: no width, height or minimum height but the kit's.
- Hotkeys only on the buttons of an action row; never on a row's buttons.
- No horizontal overflow at 420 pixels. A button never wraps, so a label is a word or two.
- No frame inside the pane; a fill only under an opened row.

`expectNative` checks most of these in a mod's tests (`claude.md`).

### Where it departs from the terminal

- The meta line joins its fields with `·`. Proportional text has no columns to line up, and two spaces read as one narrow gap. The terminal keeps its rule against the centre dot.
- An opened row has a background fill.
- There is no width class: the surface sizes the pane, and the kit draws to whatever it gives.
