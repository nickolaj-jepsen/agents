import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { BandCell, BandRow } from "./band.ts";
import { controlLabel, gutterLine } from "./blocks.ts";
import { markdownLines } from "./markdown.ts";
import { clamp } from "./text.ts";
import { paint, tokens } from "./tokens.ts";

export function cardTone(theme: Theme, active: boolean, answered: boolean, text: string): string {
  return theme.fg(active ? "borderAccent" : answered ? "border" : "text", text);
}

export function cardRail(theme: Theme, active: boolean, answered: boolean, text: string): string {
  return gutterLine(cardTone(theme, active, answered, tokens.border.v), text);
}

/**
 * The title hangs from its question label. In a focused form it needs no active-card marker.
 * @param presentation `"form"` uses a dim label and a bold text heading with no pointer.
 */
export function cardHeading(
  theme: Theme,
  width: number,
  title: string,
  label: string,
  active: boolean,
  answered: boolean,
  presentation: "card" | "form" = "card",
): string[] {
  const form = presentation === "form";
  const tone = (text: string) =>
    form ? paint(theme, "text", text) : cardTone(theme, active, answered, text);
  const gap = " ".repeat(tokens.gutter);
  const prefix = form
    ? label && label + gap
    : `${active ? tokens.glyph.pointer : " "} ${label}${gap}`;
  const cells = visibleWidth(prefix);
  const lead = form ? paint(theme, "dim", prefix) : theme.bold(tone(prefix));
  return markdownLines(theme, `${title}${answered ? ` ${tokens.glyph.done}` : ""}`, width - cells, {
    color: tone,
    bold: true,
  }).map((line, i) => (i ? " ".repeat(cells) : lead) + line);
}

export type CardChoice = {
  key: string;
  text: string;
  detail?: string;
  chosen?: boolean;
  active?: boolean;
  /** Mark the current keyboard or mouse target independently of the chosen state. */
  focused?: boolean;
  /** Reserve a focus gutter and distinguish the empty write-in from preset answers. */
  presentation?: "form";
  answered?: boolean;
  multiple?: boolean;
  /** A write-in is the person's own words, not Markdown. */
  literal?: boolean;
  detailLines?: number;
};

export function cardChoice(theme: Theme, width: number, choice: CardChoice): string[] {
  const { active = false, answered = false, chosen = false, literal = false } = choice;
  const dim = (text: string) => paint(theme, "dim", text);
  const tone = (text: string) => cardTone(theme, active, answered, text);
  const ink = (text: string) => (chosen && !literal ? theme.bold(tone(text)) : tone(text));
  const marks = choice.multiple ? tokens.glyph.multi : tokens.glyph.single;
  const form = choice.presentation === "form";
  const marker = chosen ? marks.on : form && literal ? tokens.glyph.writeIn : marks.off;
  const key = choice.key || " ";
  const focus = choice.focused;
  const neutral = (text: string) => paint(theme, "text", text);
  const pointer = form
    ? focus
      ? theme.bold(neutral(tokens.glyph.pointer)) + " "
      : " ".repeat(tokens.gutter)
    : "";
  const pad = " ".repeat(visibleWidth(`${pointer}${key} ${marker} `));
  const inner = width - pad.length;
  const chosenTone = form ? (text: string) => paint(theme, "accent", text) : tone;
  const label = controlLabel(theme, {
    primary: form && chosen,
    highlighted: focus,
    rest: literal ? "dim" : "text",
  });
  const style = !form && chosen ? { ...label, color: chosenTone, bold: true } : label;
  const lines = literal
    ? clamp(choice.text, inner).map(!form && chosen ? chosenTone : label.text)
    : markdownLines(theme, choice.text, inner, chosen || focus ? style : undefined);
  const shortcut = form
    ? dim(key)
    : choice.focused
      ? theme.underline(neutral(key))
      : active || chosen
        ? ink(key)
        : dim(key);
  const mark = chosen && (form || !literal) ? theme.bold(chosenTone(marker)) : dim(marker);
  const first = `${pointer}${shortcut} ${mark} `;
  return [
    ...lines.map((line, i) => (i ? pad : first) + line),
    ...(choice.detail
      ? markdownLines(theme, choice.detail, inner, { color: dim }, choice.detailLines ?? 3).map(
          (line) => pad + line,
        )
      : []),
  ];
}

export const CARD_NOTE_LABEL = "Note: ";

/** The card's note, keeping wrapped lines aligned with the value. */
export function cardNote(
  theme: Theme,
  width: number,
  value: string,
  active: boolean,
  answered: boolean,
  max?: number,
  focused = false,
): string[] {
  const dim = (text: string) => paint(theme, "dim", text);
  const labelWidth = visibleWidth(CARD_NOTE_LABEL);
  const style = controlLabel(theme, { highlighted: focused, rest: "dim" });
  return clamp(value || "Add a note", width - labelWidth, { max }).map(
    (line, i) =>
      (i ? " ".repeat(labelWidth) : focused ? style.text(CARD_NOTE_LABEL) : dim(CARD_NOTE_LABEL)) +
      (focused ? style.text(line) : value ? cardTone(theme, active, answered, line) : dim(line)),
  );
}

export type CardStep<A> = {
  /** Short label retained when names do not fit, such as the step number or Review. */
  short: string;
  /** Name of a numbered step. A standalone action like Review omits the name and marker. */
  name?: string;
  current?: boolean;
  hovered?: boolean;
  done?: boolean;
  act: A;
};

/** Clickable steps, with the longest name shortened first and a compact numbered fallback. */
export function cardSteps<A>(
  theme: Theme,
  width: number,
  steps: readonly CardStep<A>[],
): BandRow<A> {
  const gaps = Math.max(0, steps.length - 1);
  const markerSlots = steps.filter(({ name }) => name).length;
  const fixed = steps.reduce((n, step) => n + visibleWidth(step.short), 0) + 2 * markerSlots;
  const roomyGap = ` ${tokens.border.h.repeat(tokens.gutter)} `;
  const tightGap = ` ${tokens.border.h} `;
  const gap =
    width >= fixed + gaps * visibleWidth(roomyGap) + markerSlots * 2
      ? roomyGap
      : width >= fixed - markerSlots + gaps * visibleWidth(tightGap)
        ? tightGap
        : tokens.border.h;
  const base = fixed + gaps * visibleWidth(gap);
  const widths = steps.map((step) => (step.name ? visibleWidth(step.name) + 1 : 0));
  const names = widths.filter(Boolean).length;
  const compact = width < base + names * 2;
  if (width < base - markerSlots) return { text: "" };
  let overflow = base + widths.reduce((n, w) => n + w, 0) - width;
  while (!compact && overflow > 0) {
    const widest = widths.indexOf(Math.max(...widths));
    widths[widest]!--;
    overflow--;
  }
  let text = "";
  const cells: BandCell<A>[] = [];
  steps.forEach(({ short, name, current, hovered, done, act }, i) => {
    if (i) text += paint(theme, "border", gap);
    const start = visibleWidth(text);
    const mark = current ? tokens.glyph.pointer : done ? tokens.glyph.done : " ";
    const label =
      short +
      (!compact && name ? " " + truncateToWidth(name, widths[i]! - 1, tokens.glyph.ellipsis) : "");
    const caption = controlLabel(theme, {
      primary: current,
      highlighted: hovered,
      rest: done || !name ? "text" : "dim",
    });
    if (name) text += paint(theme, current ? "accent" : "dim", mark) + (compact ? "" : " ");
    text += caption.text(label);
    cells.push({ start, end: visibleWidth(text), act });
  });
  return { text, cells };
}

export type CardSummary = {
  /** Short identifier, kept to the left of the question and its answers. */
  label: string;
  title: string;
  /** Preset answers may contain Markdown. Write-ins are literal. */
  values: readonly { text: string; literal?: boolean }[];
  note?: string;
  hovered?: boolean;
};

/** A numbered question's answers, one per line, then its note. */
export function cardSummary(theme: Theme, width: number, summary: CardSummary): string[] {
  const prefix = summary.label + " ".repeat(tokens.gutter);
  const indent = " ".repeat(visibleWidth(prefix));
  const dim = (text: string) => paint(theme, "dim", text);
  const room = width - indent.length;
  if (room < 1) return [];
  const heading = clamp(summary.title, room).map(
    (line, i) => (i ? indent : dim(prefix)) + theme.bold(paint(theme, "text", line)),
  );
  const bullet = summary.values.length > 1 && room > 2 ? "• " : "";
  const bulletWidth = visibleWidth(bullet);
  const label = controlLabel(theme, { highlighted: summary.hovered });
  const answers = summary.values.flatMap(({ text, literal }) => {
    const lines = literal
      ? clamp(text, room - bulletWidth).map((line) => (summary.hovered ? label.text(line) : line))
      : markdownLines(theme, text, room - bulletWidth, summary.hovered ? label : undefined);
    return lines.map((line, i) => indent + (i ? " ".repeat(bulletWidth) : dim(bullet)) + line);
  });
  const note = summary.note
    ? clamp(summary.note, room - visibleWidth(CARD_NOTE_LABEL)).map(
        (line, i) =>
          indent + dim((i ? " ".repeat(visibleWidth(CARD_NOTE_LABEL)) : CARD_NOTE_LABEL) + line),
      )
    : [];
  const missing = clamp("Not answered", room).map(
    (line) => indent + (summary.hovered ? label.text(line) : dim(line)),
  );
  return [...heading, ...(answers.length ? answers : missing), ...note];
}

/** Lay out nonempty sections of a card with one blank row between them. */
export function cardSections<Row>(blank: Row, ...sections: readonly Row[][]): Row[] {
  return sections
    .filter((section) => section.length > 0)
    .flatMap((section, index) => (index ? [blank, ...section] : section));
}

/** Terminal aliases follow positions, not the letters printed on the rows. */
export function digitChoice(key: string): number {
  return /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
}
