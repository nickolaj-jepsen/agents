/**
 * The terminal's pane and its row above the prompt, painted from the kit's lines: the shared
 * screen under the sheet's head in the pane, and a line for a draft put aside or an issue filed.
 */
import type { ElementTable } from "claude-code";

import type { Filed, Form } from "../core/draft.ts";
import { draw, keysOf, TITLE, type Drawn, type Intent, type View } from "../core/screen.ts";
import type { Button } from "./kit/buttons/contract.ts";
import { buttonRow } from "./kit/buttons/terminal.ts";
import { CARD_INSET } from "./kit/card/terminal.ts";
import { blank, line, span, spansWidth, truncate, type Line } from "./kit/lines.ts";
import { hotkeys, keysHint, paintLines, ring, stack } from "./kit/paint/claude.tsx";
import { sheetHead } from "./kit/sheet/terminal.ts";
import { tokens } from "./kit/tokens.ts";

type Els = ElementTable<"terminal">;

const GAP = " ".repeat(tokens.gutter);
/** The glyph a draft put aside is marked with. */
const DRAFT_MARK = "✎";

/** The rows the pane gives to the head, and to the hint for the keyboard, not to the screen. */
const HEAD = 2;
const HINT = 2;
/** From this many rows the pane has room for the head. */
const ROOMY = 16;
/** Below this many columns the line above the prompt drops its name for the draft's title. */
const NARROW = 80;

/** The key the title's field is drawn under, for the hook that moves the ring onto it. */
export const titleKey = (form: Form | null) => `title-${form?.titleRevision ?? 0}`;

export type PaneProps = {
  form: Form | null;
  view: View;
  /** Whether the pane holds the keyboard, as far as the mod knows. */
  held: boolean;
  width: number;
  rows: number;
  /** A key or a click, with the screen as it was drawn when it came. */
  send: (intent: Intent, drawn: Drawn) => unknown;
};

/** The draft in the pane. Also gives what was drawn, for a hook that acts on it later. */
export function terminalPane(k: Els, p: PaneProps): { tree: JSX.Element; drawn: Drawn } {
  // A pane above the prompt is a few rows high, and the engine frames it: the head gives its
  // two rows to the draft there.
  const hasHead = p.rows >= ROOMY;
  const drawn = draw(p.form, p.view, {
    width: p.width,
    // The hint for the keyboard, and the blank row over it, show only while it is needed.
    rows: Math.max(4, p.rows - (hasHead ? HEAD : 0) - (p.held ? 0 : HINT)),
    isActive: p.held,
    // Escape closes the pane before a mod hears it, and Space goes to the prompt: the screen
    // names neither.
    hasAllKeys: false,
    // The engine's field shows a long title's start and hides what is typed past it when it
    // has one row (Claude Code 2.1.325); with more it wraps and keeps the cursor in sight.
    fieldRows: 2,
  });
  const head = sheetHead({ width: p.width - CARD_INSET.length, title: TITLE });
  const lines: Line[] = [
    ...(hasHead ? [{ ...head, spans: [span(CARD_INSET), ...head.spans] }, blank()] : []),
    ...drawn.body,
    ...(drawn.notice ? [drawn.notice] : []),
    ...drawn.footer,
    // The hint for the keyboard stands apart, under the buttons.
    ...(p.held ? [] : [blank()]),
  ];
  const isTyping = p.view.step === "title" && p.form?.phase === "ready" && !p.view.isConfirming;
  const field = lines.find((l) => l.slot?.kind === "input")?.slot;
  const fieldRows = field?.kind === "input" ? (field.rows ?? 1) : 1;
  const { Input } = k;
  const tree = stack(
    k,
    // First, so the ring keeps its place whatever rows the screen draws. It stays while the
    // title is typed: Escape takes the ring off the field without a word to the mod, and the
    // next arrow or Enter then lands here, which leaves the field for the draft.
    ring(
      k,
      () => p.send({ enter: true }, drawn),
      keysOf(p.form, p.view).map((key) => ({ key, press: () => p.send({ key }, drawn) })),
    ),
    paintLines(k, lines, {
      width: p.width,
      press: (hit) => p.send({ hit }, drawn),
      input: isTyping ? (
        // Enter empties an Input unless the hook draws a different value, so each submit remounts it.
        <Input
          key={titleKey(p.form)}
          value={p.form?.title ?? ""}
          // Two rows: a field of one shows a long title's start and hides what is typed past
          // it (Claude Code 2.1.325); one of several keeps the cursor in sight.
          // The key that opened it, where the drawing has it: the field stands alone on its
          // rows, so its label is the only place for it.
          label="E"
          rows={fieldRows}
          // The buttons under the draft say what Enter does; the field's own hint stays short.
          submitLabel=""
          autoFocus
          onSubmit={(title) => p.send({ title }, drawn)}
        />
      ) : undefined,
    }),
    keysHint(k, p.held, false, CARD_INSET.length),
  );
  return { tree, drawn };
}

export type BandProps = {
  /** A draft that is not on screen. */
  draft: Form | null;
  issues: Filed[];
  /** Discard was pressed once: the next press throws the draft away. */
  isArmed: boolean;
  width: number;
  on: {
    open: () => unknown;
    discard: () => unknown;
    openUrl: (url: string) => unknown;
    copy: (url: string) => unknown;
    dismiss: (key: string) => unknown;
  };
};

/** A mark, what it is about cut to the room the buttons leave, and the buttons. */
function chip(mark: Line["spans"], words: string, buttons: Button[], width: number): Line {
  const actions = buttonRow(buttons, width)[0]?.spans ?? [];
  const room = width - spansWidth(mark) - spansWidth(actions) - tokens.gutter;
  return line([
    ...mark,
    span(truncate(words, Math.max(4, room)), { role: "text" }),
    span(GAP),
    ...actions,
  ]);
}

/** The rows above the prompt: the draft put aside, with its digits, and each issue filed. */
export function terminalBand(k: Els, p: BandProps): JSX.Element {
  const press: Record<string, () => unknown> = {};
  const lines: Line[] = [];
  if (p.draft) {
    const what =
      p.draft.phase === "drafting"
        ? "being written…"
        : p.draft.phase === "failed"
          ? "was not written"
          : p.draft.title || "Untitled";
    press["chip:open"] = p.on.open;
    press["chip:discard"] = p.on.discard;
    lines.push(
      chip(
        // A narrow room keeps the title: the mark and the buttons say what the line is.
        [
          span(`${DRAFT_MARK} `, { role: "dim" }),
          ...(p.width < NARROW ? [] : [span(`Linear draft${GAP}`, { bold: true })]),
        ],
        what,
        [
          { hotkey: "8", label: "Open", hit: "chip:open", essential: true },
          {
            hotkey: "9",
            label: p.isArmed ? "Sure? Discard" : "Discard",
            hit: "chip:discard",
            essential: true,
          },
        ],
        p.width,
      ),
    );
  }
  for (const issue of p.issues) {
    const id = (verb: string) => `filed:${verb}:${issue.key}`;
    press[id("open")] = () => p.on.openUrl(issue.url);
    press[id("copy")] = () => p.on.copy(issue.url);
    press[id("dismiss")] = () => p.on.dismiss(issue.key);
    lines.push(
      chip(
        [
          span(`${tokens.glyph.done} `, { role: "success" }),
          span(`${issue.key}${GAP}`, { bold: true }),
        ],
        issue.title,
        [
          ...(issue.url
            ? [
                { hotkey: "", label: "Open", hit: id("open"), essential: true },
                { hotkey: "", label: "Copy link", hit: id("copy") },
              ]
            : []),
          { hotkey: "", label: tokens.glyph.times, hit: id("dismiss"), essential: true },
        ],
        p.width,
      ),
    );
  }
  return stack(
    k,
    paintLines(k, lines, { press: (hit) => press[hit]?.() }),
    // A digit in an empty prompt presses these, so a prompt starting with one cannot discard.
    p.draft
      ? hotkeys(k, [
          { key: "8", press: p.on.open },
          { key: "9", press: p.on.discard },
        ])
      : null,
  );
}
