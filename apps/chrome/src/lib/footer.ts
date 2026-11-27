/**
 * The line under the editor: what is answering on the left, where the session is on the right, and
 * git after it. Pure: it is given the parts and a width and says which spans to paint and where the
 * pointer may click, so a spec can ask what fits at 70 columns without a terminal.
 *
 * A part that does not fit gives way in the order of `steps`, so a narrow terminal loses the
 * secondary detail and keeps the model and the checkout or branch it is working in.
 */
import { cellWidth, truncate, type Role, type Span } from "@agents/kit-core/lines.ts";

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

/**
 * One thing the line says. `text` is what it reads as plain, and its width; `spans` is how it is
 * painted when that is more than one colour. `action` names what a click does, and a part with one
 * is a control; `short` is what it says when the line is squeezed.
 */
export type Part = {
  id: string;
  text: string;
  spans?: Span[];
  role?: Role;
  bold?: boolean;
  short?: string;
  /** Columns of extra click target on each side; neighbours split any overlap. */
  hitPad?: number;
  action?: string;
};

/** Where a control sits on the painted line, in cells from its start. */
export type Region = { x0: number; x1: number; id: string; action: string };

export type FooterInput = {
  provider?: Part;
  /** The model, which collapses to `short` and is the part that truncates. */
  model: Part;
  effort?: Part;
  /** The working directory, dimmed to its last segment. */
  path?: Part;
  /** Git, asked for the mode the line can afford. */
  git?: (mode: BranchMode) => Part | null;
};

export type FooterLayout = { spans: Span[]; regions: Region[] };

/** The spans a part draws, with its own style when it gives no spans of its own. */
const draw = (part: Part): Span[] =>
  part.spans && part.spans.map((s) => s.text).join("") === part.text
    ? part.spans
    : [{ text: part.text, role: part.role, bold: part.bold }];

/**
 * The line: words on the left, the path before git on the right, right-aligned as one block. When
 * it does not fit, parts give way in the order of `steps`.
 */
export const layoutFooter = (width: number, input: FooterInput, hovered?: string): FooterLayout => {
  if (width <= PAD * 2) return { spans: [], regions: [] };
  const inner = width - PAD * 2;

  let provider = true;
  let providerShort = false;
  let effort = true;
  let path = true;
  let branch: BranchMode = "full";
  let shortModel = false;
  let modelText = input.model.text;
  let modelSpans = input.model.spans;

  const compose = () => {
    const left = [
      provider && input.provider
        ? {
            ...input.provider,
            text: providerShort
              ? (input.provider.short ?? input.provider.text)
              : input.provider.text,
            // A swapped text drops the spans painted for the old one; `draw` gives it its role.
            spans: providerShort ? undefined : input.provider.spans,
          }
        : undefined,
      {
        ...input.model,
        text: modelText,
        // The painted form is bound to the text it was built for; a swapped or truncated text has
        // to fall back to a plain colour.
        spans: modelText === input.model.text ? modelSpans : undefined,
      },
      effort ? input.effort : undefined,
    ].filter((part): part is Part => part !== undefined);
    const right = path ? [input.path].filter((part): part is Part => !!part) : [];
    const git = input.git?.(branch) ?? null;
    const widths = (parts: Part[]) =>
      parts.reduce((sum, part, i) => sum + (i === 0 ? 0 : ZONE_GAP) + cellWidth(part.text), 0);
    const leftWidth = widths(left);
    const rightWidth = widths(right);
    const gitWidth = git ? cellWidth(git.text) : 0;
    const gitGap = path ? PATH_GIT_GAP : GIT_GAP;
    const used =
      leftWidth + (rightWidth > 0 ? ZONE_GAP + rightWidth : 0) + (git ? gitGap + gitWidth : 0);
    return { left, right, git, leftWidth, rightWidth, gitWidth, gitGap, used };
  };

  let layout = compose();
  // The ladder is the frame's current one, with the parts this line does not have taken out: the
  // path goes before the branch's name, and the provider before the model is shortened. Ticket 03
  // owns whether that is the right order for a narrow terminal.
  const steps: Array<() => void> = [
    () => (providerShort = true),
    () => (path = false),
    () => (branch = "glyph"),
    () => (provider = false),
    () => {
      shortModel = true;
      modelText = input.model.short ?? input.model.text;
      modelSpans = undefined;
    },
    () => (effort = false),
    () => (branch = "none"),
    () => {
      const room = inner - (layout.used - cellWidth(modelText));
      modelText = truncate(
        shortModel ? (input.model.short ?? input.model.text) : input.model.text,
        Math.max(MODEL_MIN, room),
      );
      modelSpans = undefined;
    },
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
      for (const s of draw(part)) {
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
  const place = (parts: Part[], at: number) => {
    let x = at;
    parts.forEach((part, index) => {
      if (index > 0) {
        spans.push({ text: " ".repeat(ZONE_GAP) });
        x += ZONE_GAP;
      }
      const painted = draw(part);
      const partWidth = cellWidth(part.text);
      const lit = part.action !== undefined && part.id === hovered;
      for (const s of painted) {
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
    const painted = draw(layout.git);
    const lit = layout.git.action !== undefined && layout.git.id === hovered;
    for (const s of painted)
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

  // A padded target must not swallow its neighbour: two of them split the gap between them, so a
  // click near the edge of the line still picks the control it is closest to.
  for (let i = 1; i < regions.length; i++) {
    const left = regions[i - 1];
    const right = regions[i];
    if (left && right && left.x1 > right.x0) {
      const middle = Math.floor((left.x1 + right.x0) / 2);
      left.x1 = middle;
      right.x0 = middle;
    }
  }
  return { spans, regions };
};
