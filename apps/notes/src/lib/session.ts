/**
 * What a session makes news: when the person last looked, the turns it worked in, and the line
 * above the prompt computed from both over a walk of the store. The store is shared by every
 * worktree of a repository, so a note is this session's when it was written during one of its
 * turns, and news when it was written after the person last looked: what another session writes
 * between turns is no news here. Memory is the harness's own and is never news.
 *
 * Pure: a harness says when the session started, when a turn began and ended, when the person
 * looked, and walks the store. How those become news is here once, for Claude Code and for pi,
 * whose events differ and are all translated into these four.
 *
 * The line itself is the screen's (`bandOf` in `./screen.ts`): this decides when it is asked for
 * and what it is asked with.
 */
import { bandOf, type Band } from "./screen.ts";
import type { Group } from "./shelf.ts";

/** A turn's time: when it started and when it ended. */
type Span = { from: number; to: number };

/** A session's turns: where its first begins, the ones that ended, and the one under way. */
type Turns = {
  /** When the session started: where a first turn begins when a harness told of none. */
  start: number;
  /** Turns that ended, oldest first. */
  spans: readonly Span[];
  /** When the turn under way started. */
  open?: number;
};

/** What news is decided by: when the person last looked, and the turns the session worked in. */
export type Session = {
  /** The session's start, then when the person last looked: a note written after it is news. */
  readonly since: number;
  /** The turns it worked in: a note is this session's only where its time falls inside one. */
  readonly turns: Turns;
};

/** Slack at both ends of a turn for the file system's clock, which is not the session's. */
export const SLACK_MS = 2000;
/** Turns kept: a note newer than the last of these is all the line can be about. */
const MAX_SPANS = 100;

/** Whether a time falls inside one of the turns, give or take the slack. */
const duringTurns = (turns: Turns, at: number): boolean =>
  turns.spans.some((span) => at >= span.from - SLACK_MS && at <= span.to + SLACK_MS);

/**
 * A session starts: notes written from here are news, and a turn nobody began begins where it did.
 */
export const startSession = (at: number): Session => ({
  since: at,
  turns: { start: at, spans: [] },
});

/**
 * A turn starts. One already under way (a second prompt queued behind it, a run started inside it)
 * keeps its start, so a note the first prompt wrote stays this turn's.
 */
export const beginTurn = (session: Session, at: number): Session =>
  session.turns.open === undefined
    ? { ...session, turns: { ...session.turns, open: at } }
    : session;

/**
 * The turn under way ends. One no start was told for began where the last ended, or where the
 * session did. A turn that ended a slack before the person last looked is dropped: no note written
 * after it can fall inside one.
 */
export function endTurn(session: Session, at: number): Session {
  const { turns } = session;
  const from = turns.open ?? turns.spans.at(-1)?.to ?? turns.start;
  const spans = [...turns.spans, { from: Math.min(from, at), to: at }]
    .filter((span) => span.to + SLACK_MS > session.since)
    .slice(-MAX_SPANS);
  return { ...session, turns: { start: turns.start, spans } };
}

/**
 * The person has looked: the notes written so far are no news. Nothing else is forgotten, least of
 * all the last turn's end: it is where a turn nobody began begins, however long ago it was.
 */
export const markLooked = (session: Session, at: number): Session => ({ ...session, since: at });

/**
 * The line above the prompt: the newest note written after the person last looked, during one of
 * the session's turns, and how many there are; nothing when there is none.
 */
export const news = (session: Session, groups: readonly Group[]): Band | undefined =>
  bandOf(groups, session.since, (at) => duringTurns(session.turns, at));
