import { view as viewOf } from "../lib/forms";
import { POSITIONS } from "./terminal";
import type { Current, Editing, Held, View } from "./types.d.ts";
import type { Button } from "@agents/kit-buttons/contract.ts";
import { buttonRow } from "@agents/kit-buttons/gui.tsx";
import {
  CARD_INSET,
  choice as cardChoice,
  closing as cardClosing,
  heading as cardHeading,
  note as cardNote,
  railRole,
} from "@agents/kit-card/terminal.ts";
import {
  choice as choiceGui,
  choices as choicesGui,
  closing as closingGui,
  heading as headingGui,
  note as noteGui,
  summary as summaryGui,
} from "@agents/kit-card/gui.tsx";
import { lineOf, type Choice, type FieldProps } from "@agents/kit-card/contract.ts";
import {
  blank,
  cellWidth,
  clamp,
  line,
  slotLine,
  span,
  type Line,
  type Span,
} from "@agents/kit-core/lines.ts";
import { notice as noticeGui } from "@agents/kit-notice/gui.tsx";
import { column, type Gui } from "@agents/kit-core/paint/gui.tsx";
import { hotkeys, paintLines, quoted, stack } from "@agents/kit-core/paint/claude.tsx";
import { prose as proseGui } from "@agents/kit-prose/gui.tsx";
import { can } from "@agents/kit-core/surfaces.ts";
import { widthCap } from "@agents/kit-core/tokens.ts";

/** The elements a terminal event's painter takes. */
export type Els = Parameters<typeof paintLines>[0];

export type RoundActions = {
  go: (index: number) => unknown;
  pick: (question: number, entry: number) => unknown;
  edit: (question: number, field: NonNullable<Editing>, from?: number) => unknown;
  clear: (question: number) => unknown;
  accept: (question: number) => unknown;
  fill: () => unknown;
  send: () => unknown;
  /** Back to the first question, scrolled to the top of the round. */
  top: () => unknown;
};

/**
 * The field a graphical surface has open in the transcript, and what its controls do: drawn in
 * place of the write-in row or the note under `question` (the round's count for its note).
 */
export type Writing = {
  question: number;
  field: NonNullable<Editing>;
  /** What it holds now. */
  value: string;
  /** The field's address; its Input is keyed from it. */
  hit: string;
  /** What the field is given: its invitation, the focus, its lines and rows. */
  props: FieldProps;
  /** What is typed in it, with the line it was typed on where the host's field is one line. */
  onInput(text: string, line?: number): unknown;
  /** What Enter in it submits. */
  onSubmit(text: string, line?: number): unknown;
  /** Save, Cancel and, where the host's field is one line, Add line. */
  buttons: Button[];
  /** What each of those buttons does, by its `hit`. */
  act: Record<string, () => unknown>;
};

/**
 * The drawing context with the events of the fields the kit's card draws: `fields` by their `hit`.
 * A field of one line per line (`lines`) reports the line it was typed on; the others the text whole.
 */
export function fieldEvents(
  g: Gui,
  fields: Record<
    string,
    {
      lines?: number;
      input(text: string, line?: number): unknown;
      submit(text: string, line?: number): unknown;
    }
  >,
): Gui {
  const by = (hit: string) => {
    const at = lineOf(hit);
    const f = fields[at.hit];
    return f ? { f, line: f.lines ? at.line : undefined } : undefined;
  };
  return {
    ...g,
    input: (hit, text) => {
      const w = by(hit);
      return w ? w.f.input(text, w.line) : g.input(hit, text);
    },
    submit: (hit, text) => {
      const w = by(hit);
      return w ? w.f.submit(text, w.line) : g.submit(hit, text);
    },
  };
}

/** A transcript's open field, as `fieldEvents` takes it. */
const eventsOf = (w: Writing) => ({
  [w.hit]: { lines: w.props.lines, input: w.onInput, submit: w.onSubmit },
});

const labelOf = (text: string) => text.replace(/^[A-H0-9]{1,2}[.)]\s*/, "");

/** Markdown that `inlineMarkdown` cannot set: a list, a heading, a quote, a fence or a table. */
const BLOCKS = /^\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|>|```|~~~|\|)/m;

type Entry = NonNullable<View["item"]>["entries"][number];

/**
 * The key a terminal card draws and binds: its own letter, `A` for a prose recommendation,
 * or its place in a pick list.
 */
export const entryLetter = (entry: Entry, index: number) =>
  entry.kind === "accept"
    ? "A"
    : entry.key || (entry.kind === "option" ? String.fromCharCode(65 + index) : "");

/** The key a row of the card binds: a letter, or the number a list of alternatives printed. */
const isKey = (key: string) => /^[A-H1-9]$/.test(key);

export function writeLetter(item: NonNullable<View["item"]>) {
  const keys = item.entries.map((entry, i) => entryLetter(entry, i)).filter(isKey);
  // Numbered rows are followed by the next number, lettered ones by the next letter.
  const isNumbered = keys.length > 0 && keys.every((key) => /[1-9]/.test(key));
  const last = Math.max(isNumbered ? 48 : 64, ...keys.map((key) => key.charCodeAt(0)));
  return String.fromCharCode(last + 1);
}

/** Whether a recommendation of several options has its own press: `Take A, B`. */
const takesMany = (item: NonNullable<View["item"]>) => item.canAccept && item.accepts.includes(",");

// ---- the terminal

/** A markdown block the engine sets, in the card's room: `indent` cells in, `inner` wide in all. */
const markdown = (text: string, indent: number, inner: number, isDim?: boolean) =>
  slotLine({ kind: "markdown", text, indent, width: Math.max(1, inner - indent), isDim });

/** Blocks as lines with a blank row between them, as the card keeps them. */
const spaced = (blocks: Line[][]) =>
  blocks.filter((rows) => rows.length).flatMap((rows, i) => (i ? [blank(), ...rows] : rows));

/**
 * A question's card in a terminal: the kit's lines behind the engine's quote rail, each control
 * a Button named by its row (`question-<n>-choose-<i>`, `-write`, `-note`, `-activate`).
 * @param columns The band's or pane's room in cells.
 */
export function questionCard(
  els: Els,
  columns: number,
  held: Held,
  index: number,
  current: Current | null,
  actions?: RoundActions,
): JSX.Element | null {
  const v = viewOf(held.form, { ...held.draft, step: index });
  const item = v.item;
  if (!item) return null;
  const isActive = current?.view.step === index;
  const several = item.isSeveral;
  const width = widthCap("reading", columns);
  const room = Math.max(1, width - 4);
  // What the rail (a cell and a space) and the padding leave a markdown block.
  const inner = room;
  const prefix = `question-${index}`;
  const answered = v.review[index]?.isAnswered;
  const hasChoices = item.entries.some((entry) => entry.kind !== "write");
  const state = { active: isActive, answered };
  const inset = cellWidth(CARD_INSET);
  const hit = (name: string) => `${prefix}-${name}`;

  const choices: Line[] = [];
  item.entries.forEach((entry, i) => {
    if (entry.kind === "write") return;
    const words = entry.kind === "accept" ? entry.text : labelOf(entry.text);
    // A detail of plain paragraphs is the option's too; one with blocks keeps its Markdown under it.
    const isDetailInline = !!entry.detail && !BLOCKS.test(entry.detail);
    choices.push(
      ...cardChoice(
        {
          ...state,
          key: entryLetter(entry, i),
          text: words,
          aside: entry.isRecommended ? "  Recommended" : undefined,
          detail: isDetailInline ? entry.detail : undefined,
          detailLines: Infinity,
          chosen: entry.isChosen,
          multiple: several,
          hit: hit(`choose-${i}`),
        },
        room,
      ),
    );
    if (entry.detail && !isDetailInline)
      choices.push(markdown(entry.detail, 4 + inset, inner, true));
  });
  if (actions || item.written)
    choices.push(
      ...cardChoice(
        {
          ...state,
          key: writeLetter(item),
          // A pick list's says "Something else".
          text:
            item.written ||
            item.entries.find((entry) => entry.kind === "write")?.text ||
            "Write your own answer",
          literal: true,
          chosen: !!item.written,
          hit: hit("write"),
        },
        room,
      ),
    );
  if (actions || item.note)
    choices.push(...cardNote({ ...state, value: item.note, hit: hit("note") }, room));

  const rows = spaced([
    cardHeading({ ...state, focused: isActive, label: item.label, title: item.title }, room).map(
      (row) => ({ ...row, hit: hit("activate") }),
    ),
    item.body ? [markdown(item.body, inset, inner)] : [],
    hasChoices || actions || item.written || item.note ? choices : [],
    item.recommended ? [markdown(`**Recommended:** ${item.recommended}`, inset, inner, true)] : [],
    actions && takesMany(item)
      ? [
          line([
            span(CARD_INSET),
            span(`Take ${item.accepts}`, { role: "dim", hit: hit("accept") }),
          ]),
        ]
      : [],
  ]);

  const press = (name: string) => {
    if (name === hit("activate")) return actions?.go(index);
    if (name === hit("write")) return actions?.edit(index, "write");
    if (name === hit("note")) return actions?.edit(index, "note");
    if (name === hit("accept")) return actions?.accept(index);
    const at = Number(name.slice(hit("choose-").length));
    // A press on the one chosen answer takes it back: the card keeps no row to clear it.
    return item.entries[at]?.isChosen && !several
      ? actions?.clear(index)
      : actions?.pick(index, at);
  };
  return quoted(els, paintLines(els, rows, { press: actions ? press : undefined, width: room }), {
    key: item.label,
    width,
    // An answered card has a green rail; the keyboard's is bright and the rest are quiet.
    rail: answered ? "answered" : isActive ? "bright" : "quiet",
  });
}

/** The closing row's controls, as the painter names their Buttons. */
export const CLOSING = { count: "round-count", fill: "round-fill", note: "round-note" } as const;

/**
 * The row after the last card, the kit's: the count goes back to the first question, Fill prompt
 * puts the reply in the prompt, and the round's note stands under it once it has words.
 */
export function closingRow(
  els: Els,
  columns: number,
  view: View,
  current: Current | null,
  actions: RoundActions | undefined,
  sent: boolean,
) {
  const width = widthCap("reading", columns);
  const room = Math.max(1, width - 4);
  const isActive = current?.view.isReview === true;
  const isNoting =
    isActive && (current.writer ? current.editing === "note" : current.pending?.field === "note");
  const press = (name: string) =>
    name === CLOSING.count
      ? actions?.top()
      : name === CLOSING.fill
        ? actions?.fill()
        : actions?.edit(view.count, "note");
  const rows = [
    ...cardClosing(
      {
        answered: view.answered,
        total: view.count,
        // While its note is written the pointer stands on the note.
        focused: isActive && !isNoting,
        canFill: !!view.reply,
        sent,
        hits: actions ? { count: CLOSING.count, fill: CLOSING.fill } : undefined,
      },
      room,
    ),
    ...(view.note || isNoting
      ? cardNote(
          {
            active: isActive,
            value: view.note,
            focused: isNoting,
            hit: actions ? CLOSING.note : undefined,
          },
          room,
        )
      : []),
  ];
  // The rail is a card's: answered once every question is, bright while the keyboard is here.
  const rail = railRole({ active: isActive, answered: view.answered === view.count });
  return quoted(els, paintLines(els, rows, { press: actions ? press : undefined, width: room }), {
    key: "round-closing",
    width,
    rail: rail === "success" ? "answered" : rail === "dim" ? "quiet" : "bright",
  });
}

/** One blank row between the blocks of a terminal reply. */
export const spacer = (els: Els) => paintLines(els, [blank()]);

/** A passage of the reply the engine sets, as wide as the room. */
export const preamble = (els: Els, columns: number, text: string) =>
  paintLines(els, [markdown(text, 0, columns)], { width: columns });

export const ROUND_FOCUS = "round-current";
const shortcuts = "abcdefghijklmnopqrstuvwxyz";

/**
 * The guide above the prompt while the cards have the keys. The host sends unmatched printable
 * keys back to the prompt, so while the band has the keys every letter is bound, and every digit
 * so a row answers by its place on screen.
 */
export function controlBar(
  els: Els,
  current: Current,
  home: () => unknown,
  press: (key: string) => unknown,
) {
  const { view } = current;
  const item = view.item;
  const letters =
    item?.entries
      .flatMap((entry, i) =>
        entry.kind !== "write" && isKey(entryLetter(entry, i)) ? [entryLetter(entry, i)] : [],
      )
      .sort() ?? [];
  const write = item ? writeLetter(item) : "";
  const first = letters[0]?.charCodeAt(0) ?? 0;
  const picks =
    letters.length > 1 && letters.every((c, i) => c.charCodeAt(0) === first + i)
      ? `${letters[0]}–${letters.at(-1)}`
      : letters.join("");
  const position = view.isReview
    ? `Review  ${view.answered}/${view.count} answered`
    : `${view.item?.label}/${view.count}`;
  const hint = (hotkey: string, label: string) => [span(`${hotkey} ${label}`, { role: "dim" })];
  /** The parts of one row, a cell apart. */
  const row = (parts: Span[][]) =>
    line(parts.flatMap((part, i) => (i ? [span(" "), ...part] : part)));
  const painted = (parts: Span[][]) =>
    stack(
      els,
      paintLines(els, [row(parts)], {
        press: (name) => (name === ROUND_FOCUS ? home() : undefined),
        autoFocus: ROUND_FOCUS,
      }),
      hotkeys(
        els,
        Array.from(`${shortcuts}${POSITIONS}`, (key) => ({ key, press: () => press(key) })),
      ),
    );
  // The position is where the ring rests, and a press on it goes home; it is as wide as the
  // longest position, so the hints keep their place from one question to the next.
  const here = [
    span(position.padEnd(Math.max(6, cellWidth(`Q${view.count}/${view.count}`))), {
      role: "accent",
      bold: true,
      hit: ROUND_FOCUS,
    }),
  ];
  // The guide's keys reach the band only while it has them. A click in the transcript hands them
  // back to the prompt and the host does not say so, and the band takes the keys from `Alt+a` or
  // `ctrl+x tab`, not from a click: until a move into the band proves otherwise, the row names
  // the chord instead of promising keys it cannot hear.
  if (!current.hasKeys) return painted([here, hint("alt+a", "for the keys")]);
  if (view.isReview)
    // The last step offers the reply; with none yet, Enter goes back to the first question.
    return painted([
      [span(position, { role: "accent", bold: true })],
      hint("jk", "move"),
      [span(`enter ${view.reply ? "fill" : "first question"}`, { hit: ROUND_FOCUS })],
      hint("n", "note"),
      hint("r", "back"),
      [span("keys here", { role: "dim" })],
    ]);
  return painted([
    here,
    hint("jk", "move"),
    ...(picks ? [hint(picks, "pick")] : []),
    hint(write, "write"),
    hint("n", "note"),
    hint("r", "review"),
    [span("keys here", { role: "dim" })],
  ]);
}

/**
 * The terminal's writer above the prompt: the question and, for a note, its answer, the engine's
 * field and Save and Cancel. `input` is the field, which stands alone on its rows.
 */
export function writerBand(
  els: Els,
  columns: number,
  o: {
    caption: string;
    answer?: string;
    input: JSX.Element;
    rows: number;
    isWaiting: boolean;
    chord: string;
    save: () => unknown;
    cancel: () => unknown;
  },
) {
  const one = (text: string) => clamp(text, Math.max(1, columns - 6), { max: 1 }).join("");
  const rows: Line[] = [
    line([span(one(o.caption), { role: "accent", bold: true })]),
    ...(o.answer ? [line([span(one(o.answer), { role: "dim" })])] : []),
    slotLine({ kind: "input", lead: [], width: columns, rows: o.rows }),
    line([
      span("Save", { role: "dim", hit: "keep" }),
      span("  "),
      span("Cancel", { role: "dim", hit: "cancel" }),
      ...(o.isWaiting ? [span("  "), span(`Click field or ${o.chord}`, { role: "dim" })] : []),
    ]),
  ];
  return paintLines(els, rows, {
    press: (name) => (name === "keep" ? o.save() : o.cancel()),
    width: columns,
    input: o.input,
  });
}

// ---- Desktop and VS Code

/** What a press on a transcript card's control does, by its `hit`. */
export function roundPress(
  actions: RoundActions,
  writing: Writing | null | undefined,
  count: number,
) {
  return (name: string) => {
    const own = writing?.act[name];
    if (own) return own();
    if (name === "review") return actions.go(count);
    if (name === "send") return actions.send();
    if (name === "fill") return actions.fill();
    if (name === "round-note") return actions.edit(count, "note");
    const answer = /^review-answer-(\d+)$/.exec(name);
    if (answer) return actions.go(Number(answer[1]));
    const card = /^question-(\d+)-(choose|write|note|clear|accept)(?:-(\d+))?$/.exec(name);
    if (!card) return undefined;
    const question = Number(card[1]);
    if (card[2] === "choose") return actions.pick(question, Number(card[3]));
    if (card[2] === "write" || card[2] === "note") return actions.edit(question, card[2]);
    return card[2] === "clear" ? actions.clear(question) : actions.accept(question);
  };
}

/** One question of the transcript, as the surface draws it: its heading, answers, field and actions. */
function question(
  g: Gui,
  held: Held,
  index: number,
  actions: RoundActions | undefined,
  writing: Writing | null | undefined,
  sent: boolean,
) {
  const show = viewOf(held.form, { ...held.draft, step: index });
  const item = show.item;
  if (!item) return null;
  const prefix = `question-${index}`;
  const answered = show.review[index]?.isAnswered;
  const mine = writing?.question === index ? writing : undefined;
  const choices: Choice[] = item.entries.flatMap((entry, i) => {
    if (entry.kind === "write") return [];
    const option = {
      tag: entryLetter(entry, i),
      label: entry.kind === "accept" ? entry.text : labelOf(entry.text),
    };
    return [
      {
        // With no actions (a round already sent) the mark is an icon: nothing is pressed.
        key: actions ? option.tag : "",
        text: option.label,
        aside: entry.isRecommended ? "Recommended" : undefined,
        detail: entry.detail || undefined,
        chosen: entry.isChosen,
        multiple: item.isSeveral,
        answered,
        hit: `${prefix}-choose-${i}`,
      },
    ];
  });
  const written = item.written
    ? noticeGui(g, {
        text: [
          span("Answer: ", { bold: true, role: sent ? "success" : undefined }),
          span(item.written),
        ],
        status: "text",
      })
    : null;
  const write =
    mine?.field === "write"
      ? choiceGui(fieldEvents(g, eventsOf(mine)), {
          key: writeLetter(item),
          text: mine.value,
          literal: true,
          chosen: true,
          hit: mine.hit,
          ...mine.props,
        })
      : actions
        ? choiceGui(g, {
            key: writeLetter(item),
            text: item.written ? "Edit answer" : "Write your own answer",
            chosen: Boolean(item.written),
            hit: `${prefix}-write`,
          })
        : null;
  const note =
    mine?.field === "note"
      ? noteGui(fieldEvents(g, eventsOf(mine)), { value: mine.value, hit: mine.hit, ...mine.props })
      : item.note
        ? noticeGui(g, { text: `Note: ${item.note}`, status: "dim" })
        : null;
  const controls: Button[] = actions
    ? [
        ...(mine?.field === "note"
          ? []
          : [{ hotkey: "", label: item.note ? "Edit note" : "Add note", hit: `${prefix}-note` }]),
        ...(answered && mine?.field !== "write"
          ? [{ hotkey: "", label: "Clear answer", hit: `${prefix}-clear` }]
          : []),
        ...(takesMany(item)
          ? [
              {
                hotkey: "",
                label: `Take ${item.accepts}`,
                hit: `${prefix}-accept`,
                isLiteral: true,
              },
            ]
          : []),
      ]
    : [];
  return column(
    g,
    { key: `${prefix}-card` },
    column(
      g,
      { gap: "xs" },
      headingGui(g, { label: item.label, title: item.title, answered }),
      item.body ? proseGui(g, { text: item.body }) : null,
      item.recommended
        ? proseGui(g, { text: `**Recommended:** ${item.recommended}`, isDim: true })
        : null,
    ),
    column(g, { gap: "sm" }, choices.length ? choicesGui(g, choices) : null, write),
    // Save, Cancel and Add line stand right under the field they belong to.
    mine?.field === "write" ? buttonRow(g, { rows: [mine.buttons] }) : written,
    note,
    mine?.field === "note" ? buttonRow(g, { rows: [mine.buttons] }) : null,
    buttonRow(g, { rows: [controls] }),
  );
}

/**
 * The transcript's cards and reply controls. Where the host can jump to a card by key,
 * offer a review with links back to its answers; otherwise end with the count and reply buttons.
 */
export function nativeRound(
  g: Gui,
  held: Held,
  current: Current | null,
  actions: RoundActions | undefined,
  writing: Writing | null | undefined,
  sent = false,
  epilogue = "",
) {
  const view = current?.view ?? viewOf(held.form, held.draft);
  const open = sent || (current ? view.isReview : true);
  const reply: Button[] =
    actions && view.reply
      ? [
          { hotkey: "", label: "Send reply", hit: "send", isLit: true },
          { hotkey: "", label: "Fill prompt", hit: "fill" },
        ]
      : [];
  const count = closingGui(g, { answered: view.answered, total: view.count, sent });
  const cards = held.form.items.map((_, index) => question(g, held, index, actions, writing, sent));
  const foot = !can(g, "transcriptKeyScroll")
    ? [
        count,
        view.note ? noticeGui(g, { text: `Round note: ${view.note}`, status: "dim" }) : null,
        buttonRow(g, { rows: [reply] }),
      ]
    : [
        count,
        actions
          ? buttonRow(g, {
              rows: [
                [{ hotkey: "", label: open ? "Hide review" : "Review answers", hit: "review" }],
              ],
            })
          : null,
        ...(open
          ? [
              column(
                g,
                { gap: "sm" },
                ...view.review.map((row, i) =>
                  summaryGui(g, {
                    label: row.label,
                    title: row.title,
                    values: row.isAnswered ? [{ text: row.shown, literal: true }] : [],
                    note: row.note,
                    hit: actions ? `review-answer-${i}` : undefined,
                  }),
                ),
              ),
              writing?.question === view.count
                ? noteGui(fieldEvents(g, eventsOf(writing)), {
                    value: writing.value,
                    hit: writing.hit,
                    ...writing.props,
                  })
                : view.note
                  ? noticeGui(g, { text: `Round note: ${view.note}`, status: "dim" })
                  : null,
              writing?.question === view.count
                ? buttonRow(g, { rows: [writing.buttons] })
                : actions
                  ? buttonRow(g, {
                      rows: [
                        [
                          {
                            hotkey: "",
                            label: view.note ? "Edit round note" : "Add round note",
                            hit: "round-note",
                          },
                          ...reply.toReversed(),
                        ],
                      ],
                    })
                  : null,
            ]
          : []),
      ];
  return column(
    g,
    { gap: "md" },
    ...cards,
    // What the message said after its questions sits between the last card and the count.
    epilogue ? proseGui(g, { text: epilogue }) : null,
    column(g, { key: "round-closing", gap: "sm" }, ...foot),
  );
}
