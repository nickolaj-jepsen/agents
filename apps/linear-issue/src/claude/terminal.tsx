/**
 * The terminal's pane and its row above the prompt, painted from the kit's lines: the shared
 * screen under the sheet's head in the pane, and a line for a draft put aside or an issue filed.
 */
import type { ElementTable } from "claude-code";

import { chip, CHIP, draftChip } from "../lib/chip.ts";
import type { Filed, Form } from "../lib/draft.ts";
import {
  BODY_KEY,
  draw,
  keysOf,
  TITLE,
  type Drawn,
  type Intent,
  type View,
} from "../lib/screen.ts";
import { CARD_INSET } from "@agents/kit-card/terminal.ts";
import { blank, line, span, type Line } from "@agents/kit-core/lines.ts";
import { hotkeys, keysHint, paintLines, ring, stack } from "@agents/kit-core/paint/claude.tsx";
import { sheetHead } from "@agents/kit-sheet/terminal.ts";
import { ctxOf } from "@agents/kit-core/surfaces.ts";
import { tokens } from "@agents/kit-core/tokens.ts";

type Els = ElementTable<"terminal">;

const GAP = " ".repeat(tokens.gutter);

/** The rows the pane gives to the head, and to the hint for the keyboard, not to the screen. */
const HEAD = 2;
const HINT = 2;
/** From this many rows the pane has room for the head. */
const ROOMY = 16;
/** The rows of the description's field its two rules take. */
const RULES = 2;

/** The step a text field is open in: the title's, or the description's. */
export const typingOf = (view: View) =>
  view.step === "title" || view.step === "body" ? view.step : undefined;

/** The key a step's field is drawn under, for the hook that moves the ring onto it. */
export const fieldKey = (form: Form | null, step: "title" | "body") =>
  `${step}-${form?.fieldRevision ?? 0}`;

export type PaneProps = {
  form: Form | null;
  view: View;
  /** Whether the pane holds the keyboard, as far as the mod knows. */
  held: boolean;
  width: number;
  rows: number;
  /** A key or a click, with the screen as it was drawn when it came. */
  send: (intent: Intent, drawn: Drawn) => unknown;
  /** The description's field as it stands after each key: what an Enter outside it saves. */
  typed: (text: string) => unknown;
};

/** The draft in the pane. Also gives what was drawn, for a hook that acts on it later. */
export function terminalPane(k: Els, p: PaneProps): { tree: JSX.Element; drawn: Drawn } {
  // A pane above the prompt is a few rows high, and the engine frames it: the head gives its
  // two rows to the draft there.
  // While Discard asks, its question stands in the head, which a short pane then shows too.
  const hasHead = p.rows >= ROOMY || p.view.isConfirming;
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
    isFieldFlush: true,
  });
  const head = sheetHead({ width: p.width - CARD_INSET.length, title: TITLE, close: drawn.close });
  const lines: Line[] = [
    ...(hasHead ? [{ ...head, spans: [span(CARD_INSET), ...head.spans] }, blank()] : []),
    ...drawn.body,
    ...(drawn.notice ? [drawn.notice] : []),
    ...drawn.footer,
    // The hint for the keyboard stands apart, under the buttons.
    ...(p.held ? [] : [blank()]),
  ];
  const typing = p.form?.phase === "ready" && !p.view.isConfirming ? typingOf(p.view) : undefined;
  const hit = typing && fieldKey(p.form, typing);
  const g = ctxOf("claude-terminal", {
    press: (key) => p.send({ hit: key }, drawn),
    input: (key, text) => {
      if (typing === "body" && key === hit) return p.typed(text);
    },
    submit: (key, text) => {
      if (key === hit) return p.send({ text }, drawn);
    },
  });
  const field = lines.find((l) => l.slot?.kind === "input")?.slot;
  const fieldRows = field?.kind === "input" ? (field.rows ?? 1) : 1;
  const fieldWidth = field?.kind === "input" ? field.width : 0;
  const { Input } = k;
  const rule = () =>
    paintLines(k, [line([span(tokens.glyph.rule.repeat(fieldWidth), { role: "border" })])]);
  const tree = stack(
    k,
    // First, so the ring keeps its place whatever rows the screen draws. It stays while the
    // field is typed in: Escape takes the ring off the field without a word to the mod, and the
    // next arrow or Enter then lands here.
    ring(
      k,
      () => p.send({ enter: true }, drawn),
      keysOf(p.form, p.view).map((key) => ({ key, press: () => p.send({ key }, drawn) })),
    ),
    paintLines(k, lines, {
      width: p.width,
      press: g.press,
      input: !hit ? undefined : typing === "body" ? (
        // The description as the Markdown it is filed as, between two rules that mark the
        // field: the engine's own draws none. It stands at the pane's left edge, as the drawing
        // has it: the engine measures a field of several lines by its pane, and set in at all
        // it cuts each line instead of wrapping it (Claude Code 2.1.325).
        stack(
          k,
          rule(),
          <Input
            key={hit}
            value={p.form?.description ?? ""}
            // The key that opened it: with a label the rows hang under the first one's words.
            label={BODY_KEY.toUpperCase()}
            rows={Math.max(2, fieldRows - RULES)}
            // The engine's own hint names Enter and the key for a new line.
            submitLabel=""
            autoFocus
            onInput={(text) => g.input(hit, text)}
            onSubmit={(text) => g.submit(hit, text)}
          />,
          rule(),
        )
      ) : (
        // Enter empties an Input unless the hook draws a different value, so each submit remounts it.
        <Input
          key={hit}
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
          onSubmit={(text) => g.submit(hit, text)}
        />
      ),
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

/** The rows above the prompt: the draft put aside, with its digits, and each issue filed. */
export function terminalBand(k: Els, p: BandProps): JSX.Element {
  const press: Record<string, () => unknown> = {};
  const lines: Line[] = [];
  if (p.draft) {
    press[CHIP.open] = p.on.open;
    press[CHIP.discard] = p.on.discard;
    lines.push(draftChip(p.draft, p.width, { openKey: "8", discardKey: "9", isArmed: p.isArmed }));
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
