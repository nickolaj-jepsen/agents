/**
 * The times a session was working in. The store is shared by every worktree of a repository, so a
 * note is this session's when it was written during one of its turns, not when it merely shows up.
 * Pure: a harness says when a turn starts and ends.
 */

/** A turn's time: when it started and when it ended. */
export type Span = { from: number; to: number };

export type Turns = {
  /** When the session started: where the first turn begins when none was told. */
  start: number;
  /** Turns that ended, oldest first. */
  spans: readonly Span[];
  /** When the turn under way started. */
  open?: number;
};

/** Slack at both ends of a turn for the file system's clock, which is not the session's. */
export const SLACK_MS = 2000;
/** Turns kept: a note newer than the last of these is all the band can be about. */
const MAX_SPANS = 100;

export const startTurns = (start: number): Turns => ({ start, spans: [] });

/** A turn starts; one already under way (a second prompt queued behind it) keeps its start. */
export const beginTurn = (turns: Turns, now: number): Turns =>
  turns.open === undefined ? { ...turns, open: now } : turns;

/**
 * The turn under way ends. One no start was told for (a harness that gave none) began when the
 * last ended, or when the session did.
 * @param since When the person last looked: turns that ended before it can have no news.
 */
export function endTurn(turns: Turns, now: number, since = 0): Turns {
  const from = turns.open ?? turns.spans.at(-1)?.to ?? turns.start;
  const spans = [...turns.spans, { from: Math.min(from, now), to: now }]
    .filter((span) => span.to + SLACK_MS > since)
    .slice(-MAX_SPANS);
  return { start: turns.start, spans };
}

/** Whether a time falls inside one of the turns, give or take the slack. */
export const duringTurns = (turns: Turns, at: number): boolean =>
  turns.spans.some((span) => at >= span.from - SLACK_MS && at <= span.to + SLACK_MS);
