/** The question card's parts as styled lines: the one drawing both terminals paint. */
import {
  blank,
  block,
  cellWidth,
  clamp,
  inline,
  line,
  literal,
  span,
  spansWidth,
  truncate,
  type Line,
  type Role,
  type Span,
  type Style,
} from "../lines.ts";
import { tokens } from "../tokens.ts";
import {
  choiceHit,
  type CardState,
  type Choice,
  type ChoiceList,
  type Heading,
  type Note,
  type Step,
  type Summary,
} from "./contract.ts";

const GAP = " ".repeat(tokens.gutter);

/**
 * One style for every label a person can act on. The keyboard's or the pointer's target is
 * bold in the text colour; only what is chosen takes the accent, and is underlined when it is
 * the target too.
 */
export function controlStyle({
  primary = false,
  highlighted = false,
  rest = "text",
  primaryRole = "accent",
}: { primary?: boolean; highlighted?: boolean; rest?: Role; primaryRole?: Role } = {}): Style {
  return {
    role: primary ? primaryRole : highlighted ? "text" : rest,
    bold: primary || highlighted || undefined,
    underline: (primary && highlighted) || undefined,
  };
}

/**
 * The rail's colour: the success colour beside a card that has its answer, else bright beside
 * the keyboard's card and quiet beside every other.
 */
export const railRole = (state: CardState): Role =>
  state.answered ? "success" : state.active ? "text" : "dim";

/** What a person can press on a card: in the accent on the keyboard's card, quiet elsewhere. */
const keyRole = (state: CardState): Role => (state.active ? "accent" : "dim");

/**
 * The column every row of a card keeps for the focus pointer, as blank cells: what a host sets
 * before a row of its own, such as an input, to line it up with the card's.
 */
export const CARD_INSET = " ".repeat(cellWidth(tokens.glyph.pointer) + 1);

/** The pointer column of one row: the pointer where the keyboard is, else blank. */
const pointerLead = (isFocused = false): Span[] =>
  isFocused
    ? [span(tokens.glyph.pointer, { role: "text", bold: true }), span(" ")]
    : [span(CARD_INSET)];

/** A line behind a card's rail, which still draws on a blank row. */
export function rail(state: CardState, row: Line): Line {
  const mark = span(tokens.glyph.rail, { role: railRole(state) });
  return { ...row, spans: row.spans.length ? [mark, span(GAP), ...row.spans] : [mark] };
}

/**
 * The question: the pointer column, its label, then the title hanging from it. That it is
 * answered is the rail's to say.
 */
export function heading(h: Heading, width: number): Line[] {
  return block(inline(h.title, { role: "text", bold: true }), width, {
    lead: [
      ...pointerLead(h.focused),
      ...(h.label ? [span(h.label + GAP, { role: keyRole(h) })] : []),
    ],
  });
}

/**
 * One answer: the pointer column, its key, its mark and its words, wrapped to hang under their
 * first line. Only a chosen one takes a colour, the accent.
 */
export function choice(c: Choice, width: number): Line[] {
  const { chosen = false, literal: isLiteral = false, focused = false, hovered = false } = c;
  const marks = c.multiple ? tokens.glyph.multi : tokens.glyph.single;
  const isLit = chosen || focused || hovered;
  const label = controlStyle({
    primary: chosen,
    highlighted: focused || hovered,
    rest: isLiteral ? "dim" : "text",
  });
  // A row nothing marks is drawn in the terminal's own colour, as its Markdown would be.
  const words = [
    ...(isLiteral ? literal(c.text, label) : inline(c.text, isLit ? label : {})),
    ...(c.aside ? [span(c.aside, { role: "dim" })] : []),
  ];
  const mark: Style = chosen ? { role: "accent", bold: true } : { role: "dim" };
  const lead = [
    ...pointerLead(focused),
    span(c.key || " ", { role: keyRole(c) }),
    span(" "),
    span(chosen ? marks.on : marks.off, mark),
    span(" "),
  ];
  const hang = [span(" ".repeat(spansWidth(lead)))];
  return [
    ...block(words, width, { lead, hang, hit: c.hit }),
    ...(c.detail
      ? block(inline(c.detail, { role: "dim" }), width, {
          lead: hang,
          hang,
          max: c.detailLines ?? 3,
          hit: c.hit,
        })
      : []),
  ];
}

export const NOTE_LABEL = "Note: ";

/** The card's note after the pointer column and its label, or the invitation to add one. */
export function note(n: Note, width: number): Line[] {
  const isLit = n.focused || n.hovered;
  const style = controlStyle({ highlighted: isLit, rest: "dim" });
  const room = width - cellWidth(CARD_INSET) - cellWidth(NOTE_LABEL);
  const words: Style = isLit ? style : { role: n.value ? "text" : "dim" };
  return clamp(n.value || "Add a note", room, { max: n.max }).map((text, i) =>
    line(
      [
        ...(i
          ? [span(CARD_INSET + " ".repeat(cellWidth(NOTE_LABEL)))]
          : [...pointerLead(n.focused), span(NOTE_LABEL, isLit ? style : { role: "dim" })]),
        span(text, words),
      ],
      n.hit,
    ),
  );
}

/**
 * The steps of several questions on one row, each a control: the longest name is shortened
 * first, and with no room for names only the short labels stay. `undefined` when even those do
 * not fit.
 */
export function steps(all: readonly Step[], width: number): Line | undefined {
  const rule = tokens.glyph.rule;
  const gaps = Math.max(0, all.length - 1);
  const marked = all.filter(({ name }) => name).length;
  const fixed = all.reduce((n, step) => n + cellWidth(step.short), 0) + 2 * marked;
  const roomy = ` ${rule.repeat(tokens.gutter)} `;
  const tight = ` ${rule} `;
  const gap =
    width >= fixed + gaps * cellWidth(roomy) + marked * 2
      ? roomy
      : width >= fixed - marked + gaps * cellWidth(tight)
        ? tight
        : rule;
  const base = fixed + gaps * cellWidth(gap);
  const widths = all.map((step) => (step.name ? cellWidth(step.name) + 1 : 0));
  const isCompact = width < base + widths.filter(Boolean).length * 2;
  if (width < base - marked) return undefined;
  let overflow = base + widths.reduce((n, w) => n + w, 0) - width;
  while (!isCompact && overflow > 0) {
    widths[widths.indexOf(Math.max(...widths))]!--;
    overflow--;
  }
  const spans: Span[] = [];
  all.forEach((step, i) => {
    if (i) spans.push(span(gap, { role: "border" }));
    const mark = step.current ? tokens.glyph.pointer : step.done ? tokens.glyph.done : " ";
    const label =
      step.short + (!isCompact && step.name ? ` ${truncate(step.name, (widths[i] ?? 1) - 1)}` : "");
    const caption = controlStyle({
      primary: step.current,
      highlighted: step.hovered,
      rest: step.done || !step.name ? "text" : "dim",
    });
    if (step.name) {
      spans.push(span(mark, { role: step.current ? "accent" : "dim", hit: step.hit }));
      if (!isCompact) spans.push(span(" ", { hit: step.hit }));
    }
    spans.push(span(label, { ...caption, hit: step.hit }));
  });
  return line(spans);
}

/** A numbered question's answers, one per line, then its note. */
export function summary(s: Summary, width: number): Line[] {
  const prefix = s.label + GAP;
  const indent = span(" ".repeat(cellWidth(prefix)));
  const room = width - cellWidth(prefix);
  if (room < 1) return [];
  const label = controlStyle({ highlighted: s.hovered });
  const head = clamp(s.title, room).map((text, i) =>
    line(
      [i ? indent : span(prefix, { role: "dim" }), span(text, { role: "text", bold: true })],
      s.hit,
    ),
  );
  const bullet = s.values.length > 1 && room > 2 ? `${tokens.glyph.bullet} ` : "";
  const answers = s.values.flatMap(({ text, literal: isLiteral }) =>
    block(
      isLiteral ? literal(text, s.hovered ? label : {}) : inline(text, s.hovered ? label : {}),
      width,
      {
        lead: [indent, ...(bullet ? [span(bullet, { role: "dim" })] : [])],
        hang: [indent, ...(bullet ? [span(" ".repeat(cellWidth(bullet)))] : [])],
        hit: s.hit,
      },
    ),
  );
  const missing = clamp("Not answered", room).map((text) =>
    line([indent, span(text, s.hovered ? label : { role: "dim" })], s.hit),
  );
  const noted = s.note
    ? clamp(s.note, room - cellWidth(NOTE_LABEL)).map((text, i) =>
        line(
          [
            indent,
            span((i ? " ".repeat(cellWidth(NOTE_LABEL)) : NOTE_LABEL) + text, { role: "dim" }),
          ],
          s.hit,
        ),
      )
    : [];
  return [...head, ...(answers.length ? answers : missing), ...noted];
}

/** The nonempty sections of a card, `gap` between them: for rows that are not lines yet. */
export function sectionsOf<Row>(gap: Row, ...parts: readonly Row[][]): Row[] {
  return parts.filter((part) => part.length > 0).flatMap((part, i) => (i ? [gap, ...part] : part));
}

/** The nonempty sections of a card, one blank row between them. */
export const sections = (...parts: readonly Line[][]): Line[] => sectionsOf(blank(), ...parts);

/** A list of answers the keyboard moves through: `choice` rows, each a control. */
export function choiceList(list: ChoiceList, width: number): Line[] {
  return list.items.flatMap((item, i) =>
    choice(
      {
        active: list.active,
        key: item.key,
        text: item.text,
        detail: item.detail,
        chosen: list.chosen.includes(i),
        focused: list.focus === i,
        hovered: list.hover === i,
        multiple: list.multiple,
        literal: item.writeIn,
        hit: choiceHit(i),
      },
      width,
    ),
  );
}
