// What the work queue shows, from GitHub's and Linear's answers: pure, so the tests
// can run it without Herdr. Cards share one shape, so the panel lines every
// type's elements up: a highlight line, the title, then where/who and signals.

export const WORK_ORG = "Digital-Udvikling";
const DAY = 86400000;
// A review or a quiet PR is "long" after this many working days.
export const LONG = 3 * DAY;
// Your own PRs untouched this long fold into one dormant line.
export const DORMANT = 30 * DAY;

// Time between two instants without Saturdays and Sundays (local time).
export function workingMs(from, to) {
  if (!(to > from)) return 0;
  let total = 0;
  let at = from;
  while (at < to) {
    const d = new Date(at);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const end = Math.min(next, to);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) total += end - at;
    at = end;
  }
  return total;
}

export function ago(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(m, 1)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 60 ? `${d}d` : `${Math.floor(d / 30)}mo`;
}

const time = (s) => (s ? Date.parse(s) : 0);
const repoName = (pr) => pr.repository.nameWithOwner.split("/").pop();
export const tabOf = (owner) => (owner === WORK_ORG ? "work" : "personal");

function ci(pr) {
  const state = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  if (state === "FAILURE" || state === "ERROR") return "failing";
  if (state === "PENDING" || state === "EXPECTED") return "pending";
  return state === "SUCCESS" ? "passing" : null;
}

// The signals on a PR card's last line, in a fixed order: CI, size, reviews, threads.
function signals(pr, own) {
  const out = [];
  const state = ci(pr);
  // A passing check is the norm: only failing or pending earns a mark.
  if (state && state !== "passing")
    out.push({
      kind: "ci",
      state,
      tone: state === "failing" ? "blocked" : "dim",
      tip: `CI ${state}`,
    });
  out.push({ kind: "diff", added: pr.additions ?? 0, removed: pr.deletions ?? 0 });
  if (own) {
    const reviews = pr.latestReviews?.nodes ?? [];
    const approved = reviews.filter((r) => r.state === "APPROVED").length;
    const changes = reviews.filter((r) => r.state === "CHANGES_REQUESTED").length;
    if (approved)
      out.push({ kind: "approved", count: approved, tone: "dim", tip: `${approved} approved` });
    if (changes)
      out.push({
        kind: "changes",
        count: changes,
        tone: "muted",
        tip: `${changes} requested changes`,
      });
  }
  const open = (pr.reviewThreads?.nodes ?? []).filter((t) => !t.isResolved).length;
  if (open)
    out.push({
      kind: "threads",
      count: open,
      tone: own ? "muted" : "dim",
      tip: `${open} unresolved thread${open === 1 ? "" : "s"}`,
    });
  return out;
}

function prCard(pr, kind) {
  return {
    key: `${kind}-${pr.url}`,
    kind,
    tab: tabOf(pr.repository.owner.login),
    title: pr.title,
    url: pr.url,
    repo: pr.repository.nameWithOwner,
    number: pr.number,
    branch: pr.headRefName,
    where: `${repoName(pr)} #${pr.number}`,
    signals: signals(pr, kind === "mine"),
  };
}

// When this review was last asked of you (or one of your teams): a re-request counts anew.
function requestedAt(pr, login, direct) {
  const events = (pr.timelineItems?.nodes ?? []).filter(
    (e) => e.__typename === "ReviewRequestedEvent",
  );
  const mine = events.filter((e) =>
    direct ? e.requestedReviewer?.login === login : e.requestedReviewer?.__typename === "Team",
  );
  const last = (mine.length ? mine : events).at(-1);
  return time(last?.createdAt) || time(pr.createdAt);
}

export function reviewCard(pr, login, now) {
  const direct = (pr.reviewRequests?.nodes ?? []).some((n) => n.requestedReviewer?.login === login);
  const since = requestedAt(pr, login, direct);
  const waited = now - since;
  const card = prCard(pr, "review");
  // Everything here was requested of you: lead with who is waiting, and for how long.
  card.highlight = {
    text: `${pr.author?.login ?? "?"} · ${ago(waited)}`,
    tone: workingMs(since, now) > LONG ? "blocked" : "muted",
  };
  card.who = direct ? null : "team";
  card.team = !direct;
  card.since = since;
  card.age = waited;
  return card;
}

// When your PR last started waiting on a review: its latest request, readiness or review.
function waitingSince(pr) {
  let at = time(pr.createdAt);
  for (const e of pr.timelineItems?.nodes ?? [])
    at = Math.max(at, time(e.createdAt ?? e.submittedAt));
  return at;
}

// Why your own PR needs you, most pressing first; null while it doesn't.
export function mineReason(pr, now) {
  const failing = ci(pr) === "failing";
  if (pr.mergeable === "CONFLICTING") return { text: "Conflict", tone: "blocked", why: "conflict" };
  if (failing) return { text: "CI failing", tone: "blocked", why: "ci" };
  if (pr.reviewDecision === "CHANGES_REQUESTED")
    return { text: "Changes requested", tone: "muted", why: "changes" };
  if (pr.reviewDecision === "APPROVED" && pr.mergeable === "MERGEABLE" && !pr.isDraft)
    return { text: "Ready to merge", tone: "done", why: "ready" };
  const requests = pr.reviewRequests?.nodes?.length ?? 0;
  const reviews = pr.latestReviews?.totalCount ?? 0;
  if (!pr.isDraft && requests > 0) {
    const since = waitingSince(pr);
    return workingMs(since, now) > LONG
      ? { text: `Review pending ${ago(now - since)}`, tone: "muted", why: "pending" }
      : null;
  }
  if (pr.isDraft || (requests === 0 && reviews === 0)) {
    if (workingMs(time(pr.updatedAt), now) <= LONG) return null;
    return {
      text: pr.isDraft ? "Stuck · draft" : "Stuck · no reviewers",
      tone: "muted",
      why: "stuck",
    };
  }
  return null;
}

export function mineCard(pr, now) {
  const reason = mineReason(pr, now);
  if (!reason) return null;
  const card = prCard(pr, "mine");
  const idle = now - time(pr.updatedAt);
  card.highlight = { text: reason.text, tone: reason.tone };
  card.why = reason.why;
  card.who = null;
  // The reason already says CI or a conflict is wrong; don't ring twice.
  if (reason.tone === "blocked") for (const s of card.signals) if (s.kind === "ci") s.tone = "dim";
  card.signals.push({ kind: "age", text: ago(idle), tone: "dim", tip: `Updated ${ago(idle)} ago` });
  card.dormant = idle > DORMANT;
  card.age = idle;
  return card;
}

const STATE_ORDER = { started: 0, unstarted: 1, triage: 2 };
const PRIORITY_ORDER = (p) => (p >= 1 && p <= 4 ? p : 5);
const PR_URL = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)/;

export function linearCard(issue, openPrs, now) {
  const prs = (issue.attachments?.nodes ?? [])
    .map((a) => PR_URL.exec(a.url ?? ""))
    .filter(Boolean)
    .map((m) => ({ repo: m[1], number: Number(m[2]), url: m[0] }));
  // Prefer a PR that's still open (it has a branch to work in), else the latest linked.
  const pr = prs.find((p) => openPrs.has(p.url)) ?? (prs.length ? prs[prs.length - 1] : null);
  const open = pr ? openPrs.get(pr.url) : null;
  const updated = time(issue.updatedAt);
  return {
    key: `linear-${issue.identifier}`,
    kind: "linear",
    tab: "work",
    title: issue.title,
    url: issue.url,
    id: issue.identifier,
    branch: open?.headRefName ?? issue.branchName,
    repo: pr?.repo ?? null,
    number: pr?.number ?? null,
    pr: pr ? { ...pr, open: Boolean(open) } : null,
    highlight: {
      text: issue.state?.name ?? "",
      tone: issue.state?.type === "started" ? "foreground" : "muted",
      priority: issue.priority === 1 ? "urgent" : issue.priority === 2 ? "high" : null,
    },
    where: issue.identifier,
    who: pr ? `PR #${pr.number}` : null,
    signals: [
      {
        kind: "age",
        text: ago(now - updated),
        tone: "dim",
        tip: `Updated ${ago(now - updated)} ago`,
      },
    ],
    order: [STATE_ORDER[issue.state?.type] ?? 3, PRIORITY_ORDER(issue.priority), -updated],
  };
}

const empty = () => ({ review: [], mine: [], dormant: [], linear: [] });

// Every card, by tab and section, in display order. `gh`: the GraphQL `data`
// (viewer, review, direct, mine); `linear`: the issue nodes, or null without Linear.
export function build(gh, linear, now) {
  const tabs = { work: empty(), personal: empty() };
  const open = new Map();
  if (gh) {
    const login = gh.viewer?.login;
    const seen = new Set();
    for (const pr of [...(gh.direct?.nodes ?? []), ...(gh.review?.nodes ?? [])]) {
      if (!pr?.url || seen.has(pr.url) || pr.author?.login === login) continue;
      seen.add(pr.url);
      const card = reviewCard(pr, login, now);
      tabs[card.tab].review.push(card);
    }
    for (const pr of gh.mine?.nodes ?? []) {
      if (!pr?.url) continue;
      open.set(pr.url, pr);
      const card = mineCard(pr, now);
      if (card) tabs[card.tab][card.dormant ? "dormant" : "mine"].push(card);
    }
  }
  for (const t of Object.values(tabs)) {
    t.review.sort((a, b) => Number(a.team) - Number(b.team) || a.since - b.since);
    const rank = { conflict: 0, ci: 1, changes: 2, ready: 3, pending: 4, stuck: 5 };
    t.mine.sort((a, b) => rank[a.why] - rank[b.why] || a.age - b.age);
    t.dormant.sort((a, b) => a.age - b.age);
  }
  if (linear) {
    const cards = linear.map((i) => linearCard(i, open, now));
    cards.sort((a, b) => {
      for (let i = 0; i < a.order.length; i++)
        if (a.order[i] !== b.order[i]) return a.order[i] - b.order[i];
      return 0;
    });
    tabs.work.linear = cards;
  }
  return tabs;
}

// Cards that ask something of you now: reviews and your own PRs, not Linear's ongoing work.
export const needs = (tab) => tab.review.length + tab.mine.length;

// Turns `owner/repo` remotes into a map of clones: `owner/repo` -> folders, the one
// named like the repo first.
export function parseClones(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const [path, url] = line.split("\t");
    const m = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url ?? "");
    if (!path || !m) continue;
    (out[m[1]] ??= []).push(path);
  }
  for (const [repo, paths] of Object.entries(out)) {
    const name = repo.split("/")[1];
    paths.sort((a, b) => Number(b.endsWith(`/${name}`)) - Number(a.endsWith(`/${name}`)));
  }
  return out;
}

// The agent's first message for a card.
export function task(card) {
  const pr = `PR #${card.number} (${card.url})`;
  if (card.kind === "review")
    return `Review ${pr} in this worktree. Summarise what it changes and the risks you see. Don't post comments or push anything.`;
  if (card.kind === "linear")
    return `Work on ${card.id}: ${card.title}. Read the issue with the Linear tools first (${card.url}). Don't push anything.`;
  const what = {
    conflict: `${pr} has merge conflicts with its base branch. Rebase it onto the base and resolve them.`,
    ci: `CI is failing on ${pr}. Find out why with gh and fix it.`,
    changes: `Reviewers asked for changes on ${pr}. Read the unresolved threads with gh and address them.`,
    ready: `${pr} is approved and mergeable. Check nothing is left before it merges and summarise it.`,
    pending: `${pr} has waited on review for a while. Make sure it's ready (rebased, CI green) and summarise it for reviewers.`,
    stuck: `${pr} looks stuck. Work out what's left before it can go to review and summarise it.`,
  }[card.why];
  return `${what} Don't push or comment without asking.`;
}
