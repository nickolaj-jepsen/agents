import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { gutterLine } from "./blocks.ts";
import { markdownLines } from "./markdown.ts";
import { clamp } from "./text.ts";
import { paint, tokens } from "./tokens.ts";

export function cardTone(theme: Theme, active: boolean, answered: boolean, text: string): string {
  return theme.fg(active ? "borderAccent" : answered ? "border" : "text", text);
}

export function cardRail(theme: Theme, active: boolean, answered: boolean, text: string): string {
  return gutterLine(cardTone(theme, active, answered, tokens.border.v), text);
}

/** The title hangs from its question label; the rail is applied after layout. */
export function cardHeading(
  theme: Theme,
  width: number,
  title: string,
  label: string,
  active: boolean,
  answered: boolean,
): string[] {
  const tone = (text: string) => cardTone(theme, active, answered, text);
  const prefix = `${active ? tokens.glyph.pointer : " "} ${label}${" ".repeat(tokens.gutter)}`;
  const cells = visibleWidth(prefix);
  return markdownLines(theme, `${title}${answered ? ` ${tokens.glyph.done}` : ""}`, width - cells, {
    color: tone,
    bold: true,
  }).map((line, i) => (i ? " ".repeat(cells) : theme.bold(tone(prefix))) + line);
}

export type CardChoice = {
  key: string;
  text: string;
  detail?: string;
  chosen?: boolean;
  active?: boolean;
  /** Highlight the keyboard target without adding another gutter or shifting the label. */
  focused?: boolean;
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
  const marker = chosen ? marks.on : marks.off;
  const key = choice.key || " ";
  const pad = " ".repeat(visibleWidth(`${key} ${marker} `));
  const inner = width - pad.length;
  const lines = literal
    ? clamp(choice.text, inner).map((line) => (chosen ? ink(line) : dim(line)))
    : markdownLines(theme, choice.text, inner, chosen ? { color: tone, bold: true } : undefined);
  const first =
    (choice.focused ? theme.underline(tone(key)) : active || chosen ? ink(key) : dim(key)) +
    ` ${choice.focused ? theme.bold(tone(marker)) : chosen && !literal ? ink(marker) : dim(marker)} `;
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
): string[] {
  const dim = (text: string) => paint(theme, "dim", text);
  const labelWidth = visibleWidth(CARD_NOTE_LABEL);
  return clamp(value || "Add a note", width - labelWidth, { max }).map(
    (line, i) =>
      (i ? " ".repeat(labelWidth) : dim(CARD_NOTE_LABEL)) +
      (value ? cardTone(theme, active, answered, line) : dim(line)),
  );
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
