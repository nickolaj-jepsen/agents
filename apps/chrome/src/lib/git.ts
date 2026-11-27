/**
 * The git block of the footer, and the porcelain it is read from. The footer asks git off its own
 * render path (`src/pi/git.ts` runs the command and the timer); what the answer says, and what the
 * line draws for it, is here, so a spec can hand in a known `status --porcelain=v2` and read the
 * words back.
 */
import type { Role, Span } from "@agents/kit-core/lines.ts";
import type { Part } from "./footer.ts";

export type PrKind = "open" | "draft" | "merged" | "closed";

/** The branch's pull request: what the footer draws as a glyph. */
export type PrRef = { url: string; number: number; state: PrKind };

export type GitState = {
  /** Null on a detached HEAD, whose commit is `oid` instead. */
  branch: string | null;
  detached: boolean;
  oid: string;
  upstream: boolean;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
  ahead: number;
  behind: number;
  /** A rebase, merge, am or cherry-pick in progress, with its step when git says. */
  operation: string | undefined;
};

// Font Awesome, the Nerd Font range: present in every version of it.
const BRANCH_GLYPH = "\uf418";
const DETACHED_GLYPH = "\uf417";
const PR_GLYPHS: Record<PrKind, string> = {
  open: "\uf407",
  draft: "\uf4dd",
  merged: "\uf419",
  closed: "\uf4dc",
};

/**
 * `git status --porcelain=v2 --branch` as the footer's state. `operation` is what the repository is
 * in the middle of, which only the filesystem under `.git` says.
 */
export const parseStatus = (output: string, operation?: string): GitState => {
  let branch: string | null = null;
  let detached = false;
  let oid = "";
  let upstream = false;
  let ahead = 0;
  let behind = 0;
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  let conflicts = 0;

  for (const line of output.split("\n")) {
    if (line.startsWith("# branch.head ")) {
      const head = line.slice("# branch.head ".length);
      if (head === "(detached)") detached = true;
      else branch = head;
    } else if (line.startsWith("# branch.oid ")) {
      oid = line.slice("# branch.oid ".length);
    } else if (line.startsWith("# branch.upstream ")) {
      upstream = true;
    } else if (line.startsWith("# branch.ab ")) {
      const match = /\+(\d+) -(\d+)/.exec(line);
      if (match) {
        ahead = Number(match[1]);
        behind = Number(match[2]);
      }
    } else if (line.startsWith("? ")) {
      untracked++;
    } else if (line.startsWith("u ")) {
      conflicts++;
    } else if (line.startsWith("1 ") || line.startsWith("2 ")) {
      const xy = line.slice(2, 4);
      if (xy[0] !== ".") staged++;
      if (xy[1] !== ".") unstaged++;
    }
  }

  return {
    branch,
    detached,
    oid,
    upstream,
    staged,
    unstaged,
    untracked,
    conflicts,
    ahead,
    behind,
    operation,
  };
};

/** A span that follows another on the same block: a space parts the two. */
const after = (text: string, role: Role, attached = false): Span => ({
  text: `${attached ? "" : " "}${text}`,
  role,
});

/**
 * The branch block: its glyph, the name when it says something the folder does not, the dirty
 * mark attached to it, and the parts that only sometimes exist. `null` when there is no branch to
 * show, which is a directory that is not a repository yet.
 */
export const branchPart = (
  state: GitState | null | undefined,
  pr: PrRef | null,
  mode: "full" | "glyph" | "none",
  /** The folder the session is in: a worktree's branch may be the same word as its folder. */
  folder: string,
): Part | null => {
  if (mode === "none" || !state) return null;

  const name = state.detached ? state.oid.slice(0, 7) : (state.branch ?? "");
  const glyph = state.detached ? DETACHED_GLYPH : BRANCH_GLYPH;
  const stateRole: Role = state.operation
    ? "accent"
    : state.unstaged > 0 || state.conflicts > 0
      ? "error"
      : state.staged > 0
        ? "warning"
        : "success";
  const dirtyRole: Role | undefined =
    state.unstaged > 0 ? "error" : state.staged > 0 ? "warning" : undefined;
  const prRole: Role | undefined = !pr
    ? undefined
    : pr.state === "draft"
      ? "dim"
      : pr.state === "merged"
        ? "success"
        : pr.state === "closed"
          ? "error"
          : "accent";

  const spans: Span[] = [{ text: glyph, role: stateRole }];
  if (mode === "full" && name && name !== folder) spans.push(after(name, "dim"));
  if (dirtyRole) spans.push(after("*", dirtyRole, true));
  if (pr) spans.push(after(PR_GLYPHS[pr.state], prRole ?? "dim"));
  if (state.operation) spans.push(after(state.operation, "accent"));
  if (state.untracked > 0) spans.push(after("?", "warning"));
  if (state.conflicts > 0) spans.push(after(`~${state.conflicts}`, "error"));
  if (state.ahead > 0 || state.behind > 0)
    spans.push(
      after(
        `${state.ahead > 0 ? `⇡${state.ahead}` : ""}${state.behind > 0 ? `⇣${state.behind}` : ""}`,
        "dim",
      ),
    );

  return { id: "branch", text: spans.map((s) => s.text).join(""), spans };
};
