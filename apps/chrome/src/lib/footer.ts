/**
 * The line under the editor: what is answering on the left, where the session is on the right, and
 * git after it. Pure: it is given the parts and a width and says which spans to paint and where the
 * pointer may click, so a spec can ask what fits at 70 columns without a terminal.
 *
 * The model and the checkout it is working in, with the branch, are what the line is for, so a
 * narrow terminal keeps them and gives up everything else first: the extension's own statuses and
 * the steady meters go before the path is shortened, and the checkout keeps its own name after the
 * branch has collapsed to a glyph.
 */
import { cellWidth, truncate, type Span } from "@agents/kit-core/lines.ts";
import { partsWidth, shownText, spansOf, splitOverlaps, type Part, type Region } from "./line.ts";

export type { Part, Region } from "./line.ts";

/** The line's own inset, left and right. */
const PAD = 2;
/** Between the left zone and the right one. */
const ZONE_GAP = 2;
/** Git follows the path as one phrase (`~/nixos  branch`); the branch glyph is the separator. */
const PATH_GIT_GAP = 1;
const GIT_GAP = 3;
/** The model keeps at least this many columns when it is the last thing to truncate. */
const MODEL_MIN = 8;

/** How much of the branch is drawn: its name, its glyph alone, or nothing. */
export type BranchMode = "full" | "glyph" | "none";

export type FooterInput = {
  provider?: Part;
  /** The model, which collapses to `short` and is the part that truncates. */
  model: Part;
  effort?: Part;
  /** What other extensions put in pi's footer, already one line each. */
  statuses?: readonly Part[];
  /** Cache and context readings that only speak up when they are worth acting on. */
  alarms?: readonly Part[];
  /** The working directory, dimmed to its last segment; `short` keeps the last name alone. */
  path?: Part;
  cost?: Part;
  speed?: Part;
  /** Git, asked for the mode the line can afford. */
  git?: (mode: BranchMode) => Part | null;
};

export type FooterLayout = { spans: Span[]; regions: Region[] };

/** A part as the squeezed form reads, dropping spans painted for the longer text. */
const squeezed = (part: Part): Part => {
  const text = shownText(part, true);
  return { ...part, text, spans: text === part.text ? part.spans : undefined };
};

/**
 * The line: words on the left, the path before git on the right, right-aligned as one block. When
 * it does not fit, parts give way in the order of `steps`: model and checkout last.
 */
export const layoutFooter = (width: number, input: FooterInput, hovered?: string): FooterLayout => {
  if (width <= PAD * 2) return { spans: [], regions: [] };
  const inner = width - PAD * 2;

  let provider = true;
  let providerShort = false;
  let statuses = true;
  let speed = true;
  let cost = true;
  let effort = true;
  let alarms = true;
  let path = true;
  let pathShort = false;
  let shortModel = false;
  let modelText = input.model.text;
  let branch: BranchMode = "full";

  const compose = () => {
    const left = [
      provider && input.provider
        ? providerShort
          ? squeezed(input.provider)
          : input.provider
        : undefined,
      {
        ...input.model,
        text: modelText,
        // The painted form is bound to the text it was built for; a swapped or truncated text has
        // to fall back to a plain colour.
        spans: modelText === input.model.text ? input.model.spans : undefined,
      },
      effort ? input.effort : undefined,
      ...(statuses ? (input.statuses ?? []) : []),
    ].filter((part): part is Part => part !== undefined);
    const right = [
      ...(alarms ? (input.alarms ?? []) : []),
      cost ? input.cost : undefined,
      speed ? input.speed : undefined,
      path && input.path ? (pathShort ? squeezed(input.path) : input.path) : undefined,
    ].filter((part): part is Part => part !== undefined);
    const git = input.git?.(branch) ?? null;
    const leftWidth = partsWidth(left, ZONE_GAP);
    const rightWidth = partsWidth(right, ZONE_GAP);
    const gitWidth = git ? cellWidth(git.text) : 0;
    const gitGap = path && input.path ? PATH_GIT_GAP : GIT_GAP;
    const used =
      leftWidth + (rightWidth > 0 ? ZONE_GAP + rightWidth : 0) + (git ? gitGap + gitWidth : 0);
    return { left, right, git, leftWidth, rightWidth, gitWidth, gitGap, used };
  };

  let layout = compose();
  // The ladder, first dropped first. Ticket 02's version gave up the path before the branch's name
  // and the model, which at 70 columns left a session with nowhere to work; the checkout is now
  // the last secondary thing to go, and its own name outlives the branch's.
  const steps: Array<() => void> = [
    () => (providerShort = true),
    () => (statuses = false),
    () => (speed = false),
    () => (cost = false),
    () => (effort = false),
    () => (provider = false),
    () => {
      shortModel = true;
      modelText = input.model.short ?? input.model.text;
    },
    () => (pathShort = true),
    () => (branch = "glyph"),
    () => (alarms = false),
    () => {
      const room = inner - (layout.used - cellWidth(modelText));
      modelText = truncate(
        shortModel ? (input.model.short ?? input.model.text) : input.model.text,
        Math.max(MODEL_MIN, room),
      );
    },
    () => (branch = "none"),
    () => (path = false),
  ];
  for (const step of steps) {
    if (layout.used <= inner) break;
    step();
    layout = compose();
  }

  // The last resort: keep the left words, cut the tail to the width, and leave no control whose
  // cells are gone.
  if (layout.used > inner) {
    const spans: Span[] = [];
    let used = 0;
    for (const part of layout.left) {
      const gap = spans.length > 0 ? ZONE_GAP : 0;
      const room = width - PAD - used - gap;
      if (room <= 0) break;
      if (spans.length > 0) spans.push({ text: " ".repeat(gap) });
      used += gap;
      for (const s of spansOf(part)) {
        const w = cellWidth(s.text);
        if (used + w <= width) {
          spans.push({ ...s, hit: part.action ? part.id : s.hit });
          used += w;
          continue;
        }
        const left = width - used;
        if (left > 0) spans.push({ ...s, text: truncate(s.text, left), hit: undefined });
        used = width;
        break;
      }
      if (used >= width) break;
    }
    return { spans: [{ text: " ".repeat(PAD) }, ...spans], regions: [] };
  }

  // Paint the left zone, then the right zone pushed to the far end, then git after it.
  const spans: Span[] = [{ text: " ".repeat(PAD) }];
  const regions: Region[] = [];
  const place = (parts: readonly Part[], at: number) => {
    let x = at;
    parts.forEach((part, index) => {
      if (index > 0) {
        spans.push({ text: " ".repeat(ZONE_GAP) });
        x += ZONE_GAP;
      }
      const partWidth = cellWidth(part.text);
      const lit = part.action !== undefined && part.id === hovered;
      for (const s of spansOf(part)) {
        spans.push({
          ...s,
          role: lit && s.role === "dim" ? "text" : s.role,
          bold: lit ? true : s.bold,
          hit: part.action ? part.id : s.hit,
        });
      }
      if (part.action) {
        const pad = part.hitPad ?? 0;
        regions.push({
          x0: x - pad,
          x1: x + partWidth + pad,
          id: part.id,
          action: part.action,
        });
      }
      x += partWidth;
    });
    return x;
  };

  const leftEnd = place(layout.left, PAD);
  const fill = Math.max(
    0,
    inner -
      layout.leftWidth -
      layout.rightWidth -
      (layout.git ? layout.gitGap + layout.gitWidth : 0),
  );
  const rightStart = leftEnd + fill;
  if (fill > 0) spans.push({ text: " ".repeat(fill) });
  const rightEnd = place(layout.right, rightStart);
  if (layout.git) {
    const start = rightEnd + layout.gitGap;
    spans.push({ text: " ".repeat(layout.gitGap) });
    const lit = layout.git.action !== undefined && layout.git.id === hovered;
    for (const s of spansOf(layout.git))
      spans.push({
        ...s,
        role: lit && s.role === "dim" ? "text" : s.role,
        bold: lit ? true : s.bold,
        hit: layout.git.action ? layout.git.id : s.hit,
      });
    if (layout.git.action)
      regions.push({
        x0: start,
        x1: start + layout.gitWidth,
        id: layout.git.id,
        action: layout.git.action,
      });
  }
  spans.push({ text: " ".repeat(PAD) });

  return { spans, regions: splitOverlaps(regions) };
};
