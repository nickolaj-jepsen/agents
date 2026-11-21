/** Where the numbered or Q-labelled questions of a message start, and which of them make up the run to read. */
import type { Lead } from "./item.ts";
import { type Doc, unbold } from "./lines.ts";

export type Start = Lead & { line: number; isQ: boolean; n: number };

// `**Q1. …**`, `### Q2: …`, `1. **…?** …`, `**3.** …`, `Q4) …`, `## Question 5: …`, `## Q6 — …`.
// Unindented only; at most three digits, so a year or a count is no label. A dash follows only a Q
// label (the lookbehind), which a bare number never takes. `bold` opens before the label and
// `closed` closes right after it; `after` is the rest of the line.
const START =
  /^(?:#{1,6}\s+)?(?<bold>\*\*)?(?<q>Q(?:uestion)?\s*)?(?<n>[0-9]{1,3})(?:[.:)]|(?<=Q(?:uestion)?\s*[0-9]{1,3})\s*[—–-](?=\s))(?<closed>\*\*)?(?:\s+|$)(?<after>.*)$/;
// `❓ **Q1** - **Title**: body`: the label closes its bold before any punctuation.
const EMOJI_START = /^❓\s*\*\*Q(?<n>[0-9]{1,3})\*\*\s*[-–—:]\s*(?<after>.*)$/;

/** Whether a line starts like a numbered question, for readers that must not take one for their own prose. */
export const isStart = (line: string) => START.test(line);

/**
 * Title and the rest of a start line. `boldOpen` when the bold opened before the title and is
 * still open, so the title runs to the next `**`; else a bold at the very start is the title.
 */
function splitTitle(boldOpen: boolean, rest: string): [string, string] {
  if (boldOpen) {
    const end = rest.indexOf("**");
    return end < 0 ? [rest, ""] : [rest.slice(0, end), rest.slice(end + 2)];
  }
  const end = rest.startsWith("**") ? rest.indexOf("**", 2) : -1;
  return end > 0 ? [rest.slice(2, end), rest.slice(end + 2)] : [rest, ""];
}

function emojiStart(line: string, at: number): Start | null {
  const groups = EMOJI_START.exec(line)?.groups;
  if (!groups) return null;
  // `**Title**: body` after the label: the bold part is the title.
  const [title, rest] = splitTitle(false, groups.after ?? "");
  const body = rest.startsWith(":") ? rest.slice(1) : rest;
  return unbold(title)
    ? {
        line: at,
        isQ: true,
        n: Number(groups.n),
        label: `Q${groups.n}`,
        title: unbold(title),
        rest: body.trim(),
      }
    : null;
}

function numberStart(line: string, at: number): Start | null {
  const groups = START.exec(line)?.groups;
  if (!groups) return null;
  const { bold, q, n = "", closed, after = "" } = groups;
  // `**Q1.** …` closed its bold on the label, so a `**` after it is the title's own.
  const [title, rest] = splitTitle(Boolean(bold) && !closed, after);
  return unbold(title)
    ? {
        line: at,
        isQ: Boolean(q),
        n: Number(n),
        label: q ? `Q${n}` : n,
        title: unbold(title),
        rest: rest.trim(),
      }
    : null;
}

export function findStarts(doc: Doc): Start[] {
  const starts: Start[] = [];
  doc.lines.forEach((line, at) => {
    const start = doc.code[at] ? null : (emojiStart(line, at) ?? numberStart(line, at));
    if (start) starts.push(start);
  });
  return starts;
}

/** The trailing run of starts: a run restarts where the numbering goes back. */
function lastRun(starts: Start[]): Start[] {
  let run: Start[] = [];
  for (const start of starts) {
    if (start.n <= (run.at(-1)?.n ?? 0)) run = [];
    run.push(start);
  }
  return run;
}

/** The runs worth trying, best first: the Q-labelled one, then every numbered one. */
export function candidates(starts: Start[]): Start[][] {
  const labelled = lastRun(starts.filter((start) => start.isQ));
  const all = lastRun(starts);
  return labelled.length && labelled.length !== all.length ? [labelled, all] : [all];
}
