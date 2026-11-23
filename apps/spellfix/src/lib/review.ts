/**
 * The spelling review's screen: the findings in a window, what it says about them, and what it offers.
 * Pure, so the pi half holds the review and paints these lines with the shared kit; no host imports.
 */
import type { Button } from "@agents/kit-buttons/contract.ts";
import { controlStyle } from "@agents/kit-card/terminal.ts";
import {
  cellWidth,
  line,
  moreText,
  span,
  truncateSpans,
  type Line,
  type Span,
} from "@agents/kit-core/lines.ts";
import { tokens, widthCap } from "@agents/kit-core/tokens.ts";
import { emptyState, notice } from "@agents/kit-notice/terminal.ts";
import { sheetChrome } from "@agents/kit-sheet/contract.ts";
import { wordDiff, type Extra, type Miss, type Verdict } from "./spellfix.ts";

/** Lines one finding takes: its kind and count, then the draft with the fix in place. */
export const FINDING_LINES = 2;
/** Findings one review shows at most, however tall the terminal. */
export const MAX_FINDINGS = 9;
/** Draft characters shown on either side of the word. */
const CONTEXT = 28;
/** Cells the window's markers and the progress line are set in by, under a finding's text. */
const HANG = cellWidth(tokens.glyph.pointer) + 1;

/** One decision in the review: the same replacement at one or more places in the draft. */
export type Finding = {
  /** The draft text this replaces. */
  word: string;
  /** What it becomes; null while the model is still thinking or cannot tell. */
  fix: string | null;
  kind: "typo" | "casing" | "real word" | "unsure";
  /** Every occurrence this answer applies to, in draft order. */
  offsets: Miss[];
  checked: boolean;
};

/** What the review draws: the draft, its findings, where the keyboard and the window are. */
export type ReviewView = {
  text: string;
  findings: readonly Finding[];
  index: number;
  /** The window's first finding, as the last drawing left it. */
  top: number;
  /** Findings the window shows. */
  height: number;
  isChecking: boolean;
  isPendingAll: boolean;
  aiError?: string;
  added: readonly string[];
  /** The control under the pointer, as one of the hits below. */
  hover?: string;
};

/** What the review's controls press, by the hit a span or a Button carries. */
export const REVIEW_HIT = {
  apply: "review:apply",
  applyAll: "review:apply-all",
  toggle: "review:toggle",
  keep: "review:keep",
  undo: "review:undo",
} as const;

/** The hit that focuses finding `i`. */
export const rowHit = (i: number) => `review:row:${i}`;
/** The hit that toggles finding `i`, on its mark. */
export const markHit = (i: number) => `review:mark:${i}`;

/** The finding a row hit names, or undefined for another hit. */
export function rowOfHit(hit: string | undefined): number | undefined {
  const m = /^review:row:(\d+)$/.exec(hit ?? "");
  return m ? Number(m[1]) : undefined;
}

/** The finding a mark hit names, or undefined for another hit. */
export function markOfHit(hit: string | undefined): number | undefined {
  const m = /^review:mark:(\d+)$/.exec(hit ?? "");
  return m ? Number(m[1]) : undefined;
}

/**
 * The row the window starts on: as it was, moved only as far as keeping finding `index` in view
 * needs. A window is whole findings, so it never cuts a finding in two.
 */
export function reviewWindow(
  index: number,
  count: number,
  height: number,
  previous = 0,
): { top: number; above: number; below: number; rows: number } {
  const rows = Math.max(1, Math.min(MAX_FINDINGS, height));
  const max = Math.max(0, count - rows);
  let top = Math.max(0, Math.min(max, previous));
  if (index - top >= rows) top = index - rows + 1;
  if (index < top) top = index;
  top = Math.max(0, Math.min(max, top));
  return { top, above: top, below: Math.max(0, count - top - rows), rows };
}

/** The rows the overlay may take: four fifths of the terminal, as its overlay asks. */
export const reviewMaxHeight = (rows: number) => Math.max(8, Math.floor(rows * 0.8));

/**
 * Findings the window shows: the overlay's rows less the sheet's own, its footer, its notice when
 * there is one, and the window's marker and progress rows.
 */
export function reviewHeight(
  rows: number,
  { footer, notice: hasNotice }: { footer: number; notice: boolean },
): number {
  const taken = sheetChrome("edge") + Math.max(1, footer) + (hasNotice ? 1 : 0) + 2;
  return Math.max(
    3,
    Math.min(MAX_FINDINGS, Math.floor((reviewMaxHeight(rows) - taken) / FINDING_LINES)),
  );
}

/** The sheet's width: a dialog's cap, with a cell of margin on either side of the terminal. */
export const reviewWidth = (columns: number) =>
  Math.max(1, Math.min(columns - 2, widthCap("dialog", columns)));

/** The title rule's caption: the plugin, then what the review has and what is checked. */
export function reviewCaption(view: ReviewView): Span[] {
  const name = span("spellfix", { role: "accent", bold: true });
  const count = view.findings.length;
  if (count === 0) return [name];
  const checked = view.findings.filter((f) => f.checked && f.fix !== null).length;
  return [name, span(` · ${checked} to apply · ${count} found`, { role: "dim" })];
}

/**
 * What the review says besides its findings: what it is waiting on, whether the model failed,
 * and the words this answer added. Undefined when it has nothing to say, so the row is saved.
 */
export function reviewNotice(view: ReviewView, width: number): Line | undefined {
  const notes: string[] = [];
  if (view.isChecking) notes.push("asking the model…");
  if (view.isPendingAll) notes.push("waiting for the model…");
  if (view.aiError) notes.push(`model: ${view.aiError}`);
  if (view.added.length) notes.push(`added: ${view.added.join(", ")}`);
  if (notes.length === 0) return undefined;
  return notice({ text: notes.join(" · "), status: "dim", width })[0];
}

/** What the review offers: the action on the focused finding first, the keys beside it. */
export function reviewButtons(view: ReviewView, hover?: string): Button[][] {
  const focused = view.findings[view.index];
  const checked = view.findings.some((f) => f.checked && f.fix !== null);
  const buttons: Button[] = [];
  if (view.findings.length > 0) {
    buttons.push({
      label: "Apply",
      hotkey: "enter",
      hit: REVIEW_HIT.apply,
      isLit: true,
      essential: true,
    });
    if (checked)
      buttons.push({ label: "Apply all", hotkey: "a", hit: REVIEW_HIT.applyAll, essential: true });
    buttons.push({ label: "Toggle", hotkey: "space", hit: REVIEW_HIT.toggle, essential: true });
    if (focused && focused.kind !== "real word")
      buttons.push({ label: "Keep word", hotkey: "d", hit: REVIEW_HIT.keep });
    if (view.added.length > 0)
      buttons.push({ label: "Undo add", hotkey: "u", hit: REVIEW_HIT.undo });
  }
  // Close is the frame's own, in the top rule; this says the key, and is not a second control.
  buttons.push({ label: "close", hotkey: "esc" });
  return [
    buttons.map((b) => (b.hit !== undefined && b.hit === hover ? { ...b, hovered: true } : b)),
  ];
}

/** The findings the window shows, then how many it hides, then where the keyboard is. */
export function reviewBody(view: ReviewView, width: number): Line[] {
  if (view.findings.length === 0) {
    const words = view.isChecking ? "Checking for misspellings…" : "No misspellings left.";
    return view.isChecking
      ? notice({ text: words, status: "pending", width })
      : emptyState({ text: words, width });
  }
  const { top, above, below, rows } = reviewWindow(
    view.index,
    view.findings.length,
    view.height,
    view.top,
  );
  const body: Line[] = [];
  for (let i = top; i < Math.min(view.findings.length, top + rows); i++)
    body.push(...findingLines(view, i, width));
  if (above || below) body.push(windowLine(above, below));
  body.push(
    line([
      span(" ".repeat(HANG)),
      span(`${view.index + 1}/${view.findings.length}`, { role: "dim" }),
    ]),
  );
  return body;
}

/** A finding's two lines: its kind and count, then the draft with the fix in place. */
function findingLines(view: ReviewView, index: number, width: number): Line[] {
  const finding = view.findings[index]!;
  const focused = index === view.index;
  const row = rowHit(index);
  const isHovered = view.hover === row || view.hover === markHit(index);
  const pointer = focused
    ? span(tokens.glyph.pointer, { role: "text", bold: true, hit: row })
    : span(" ".repeat(cellWidth(tokens.glyph.pointer)), { hit: row });
  const mark: Span = {
    text: finding.checked ? tokens.glyph.multi.on : tokens.glyph.multi.off,
    ...(finding.checked ? { role: "accent", bold: true } : { role: "dim" }),
    hit: markHit(index),
  };
  // A hovered row's label is bold, as the kit's lists bold theirs; the pointer stays where the keyboard is.
  const label = { ...controlStyle({ highlighted: isHovered, rest: "dim" }), hit: row };
  const count =
    finding.offsets.length > 1
      ? [span(` ×${finding.offsets.length}`, { role: "dim", hit: row })]
      : [];
  const head = line([
    pointer,
    span(" ", { hit: row }),
    mark,
    span(" ", { hit: row }),
    span(`[${finding.kind}]`, label),
    ...count,
  ]);
  return [head, line(truncateSpans(diffSpans(view, finding, row), width))];
}

/** The draft around the finding's first occurrence, with the word and its replacement set apart. */
function diffSpans(view: ReviewView, finding: Finding, hit: string): Span[] {
  const at = finding.offsets[0]!;
  const lead = view.text.slice(Math.max(0, at.start - CONTEXT), at.start).replace(/\s+/g, " ");
  const tail = view.text
    .slice(at.end, Math.min(view.text.length, at.end + CONTEXT))
    .replace(/\s+/g, " ");
  const change: Span[] =
    finding.fix === null
      ? [span(finding.word, { role: "warning", underline: true, hit })]
      : wordDiff(finding.word, finding.fix).flatMap((run, i) => [
          ...(i > 0 ? [span(" ", { hit })] : []),
          span(run.text, {
            ...(run.kind === "removed"
              ? { role: "error" as const }
              : run.kind === "added"
                ? { role: "success" as const }
                : {}),
            hit,
          }),
        ]);
  return [
    span(" ".repeat(HANG), { hit }),
    ...(at.start > CONTEXT ? [span("…", { role: "dim", hit })] : []),
    span(lead, { role: "dim", hit }),
    ...change,
    span(tail, { role: "dim", hit }),
    ...(at.end + CONTEXT < view.text.length ? [span("…", { role: "dim", hit })] : []),
  ];
}

/** The kit's window marker, counting whole findings past either edge. */
function windowLine(above: number, below: number): Line {
  const parts: string[] = [];
  if (above) parts.push(moreText(tokens.glyph.more.up, above));
  if (below) parts.push(moreText(tokens.glyph.more.down, below));
  return line([
    span(" ".repeat(HANG)),
    span(parts.join(" ".repeat(tokens.gutter)), { role: "dim" }),
  ]);
}

/**
 * The findings from hunspell's misses and the model's extras, each at its first occurrence in the
 * draft. A fix that only changes case is a casing slip; an extra is a real word the model caught.
 */
export function toFindings(
  misses: readonly Miss[],
  extras: readonly Extra[],
  verdicts: ReadonlyMap<string, Verdict>,
): Finding[] {
  const byWord = new Map<string, Miss[]>();
  for (const m of misses) {
    const seen = byWord.get(m.word);
    if (seen) seen.push(m);
    else byWord.set(m.word, [m]);
  }
  const findings: Finding[] = [];
  for (const [word, offsets] of byWord) {
    const verdict = verdicts.get(word);
    const fix = verdict?.kind === "fix" ? verdict.word : null;
    const kind = fix && fix.toLowerCase() === word.toLowerCase() ? "casing" : "typo";
    findings.push({
      word,
      fix,
      kind: verdict?.kind === "unsure" ? "unsure" : kind,
      offsets,
      checked: true,
    });
  }
  for (const extra of extras) {
    findings.push({
      word: extra.word,
      fix: extra.fix,
      kind: "real word",
      offsets: [{ word: extra.word, start: extra.start, end: extra.end }],
      checked: true,
    });
  }
  return findings.sort((a, b) => a.offsets[0]!.start - b.offsets[0]!.start);
}
