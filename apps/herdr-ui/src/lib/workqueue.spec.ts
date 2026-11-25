import { expect, test } from "vitest";
import { build, mineReason, needs, parseClones, task, workingMs } from "../mods/workqueue/queue.js";

// What this spec reads of a card: `queue.js` is plain JavaScript, which Herdr loads as it is, so
// its cards are inferred loosely and the spec names the fields it looks at.
type Card = { id: string; team: boolean; branch: string | null; who: string | null };
type Tab = Record<"review" | "mine" | "dormant" | "linear", Card[]>;
type Tabs = Record<"work" | "personal", Tab>;

/** The nth card of a section, which is there: a section's length is asserted before it is read. */
const at = <T>(cards: T[], n = 0): T => cards[n] as T;

const DAY = 86400000;
// Local Wednesday noon, and the Monday noon after the weekend.
const wed = new Date(2026, 10, 25, 12).getTime();
const mon = new Date(2026, 10, 30, 12).getTime();

const pr = (over: Record<string, unknown> = {}) => ({
  number: 1,
  title: "t",
  url: `https://github.com/o/r/pull/${over.number ?? 1}`,
  isDraft: false,
  createdAt: new Date(wed - 20 * DAY).toISOString(),
  updatedAt: new Date(wed).toISOString(),
  headRefName: "b",
  additions: 1,
  deletions: 0,
  mergeable: "MERGEABLE",
  reviewDecision: null,
  repository: { nameWithOwner: "Digital-Udvikling/r", owner: { login: "Digital-Udvikling" } },
  author: { login: "me" },
  reviewRequests: { nodes: [] },
  latestReviews: { totalCount: 0, nodes: [] },
  reviewThreads: { nodes: [] },
  commits: { nodes: [] },
  timelineItems: { nodes: [] },
  ...over,
});

test("weekends don't count toward waiting", () => {
  expect(workingMs(wed, mon)).toBe(3 * DAY);
  const sat = new Date(2026, 10, 28, 9).getTime();
  expect(workingMs(sat, sat + DAY)).toBe(0);
});

test("conflicts and failing CI come before review state", () => {
  const failing = { nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }] };
  expect(mineReason(pr({ mergeable: "CONFLICTING", commits: failing }), wed)?.why).toBe("conflict");
  expect(mineReason(pr({ commits: failing, reviewDecision: "CHANGES_REQUESTED" }), wed)?.why).toBe(
    "ci",
  );
  expect(mineReason(pr({ reviewDecision: "APPROVED" }), wed)?.why).toBe("ready");
});

test("a pending review shows only after 3 working days", () => {
  const asked = (at: number) =>
    pr({
      reviewRequests: { nodes: [{ requestedReviewer: { login: "a" } }] },
      timelineItems: {
        nodes: [{ __typename: "ReviewRequestedEvent", createdAt: new Date(at).toISOString() }],
      },
    });
  // Friday to Wednesday is 3 working days: not yet.
  expect(mineReason(asked(wed - 5 * DAY), wed)).toBeNull();
  expect(mineReason(asked(wed - 6 * DAY), wed)?.why).toBe("pending");
});

test("drafts and PRs without reviewers are stuck once quiet", () => {
  expect(mineReason(pr({ isDraft: true }), wed + DAY)).toBeNull();
  expect(mineReason(pr({ isDraft: true }), mon + 2 * DAY)?.text).toBe("Stuck · draft");
  expect(mineReason(pr(), mon + 2 * DAY)?.text).toBe("Stuck · no reviewers");
});

test("PRs split into Work and Personal by owner, old ones fold as dormant", () => {
  const personal = pr({
    number: 2,
    mergeable: "CONFLICTING",
    repository: { nameWithOwner: "me/x", owner: { login: "me" } },
  });
  const old = pr({ number: 3, isDraft: true, updatedAt: new Date(wed - 40 * DAY).toISOString() });
  const review = pr({
    number: 4,
    author: { login: "else" },
    reviewRequests: { nodes: [{ requestedReviewer: { login: "me" } }] },
  });
  const tabs = build(
    {
      viewer: { login: "me" },
      direct: { nodes: [review] },
      review: { nodes: [review] },
      mine: { nodes: [personal, old] },
    },
    null,
    wed,
  ) as Tabs;
  expect(tabs.personal.mine.length).toBe(1);
  expect(tabs.work.dormant.length).toBe(1);
  expect(tabs.work.review.length).toBe(1);
  expect(at(tabs.work.review).team).toBe(false);
  expect(needs(tabs.work)).toBe(1);
});

test("Linear issues sort started first, then by priority, and pick up an open PR", () => {
  const open = pr({ number: 9, headRefName: "feat/x" });
  const issue = (id: string, type: string, priority: number, attachments: string[] = []) => ({
    identifier: id,
    title: id,
    url: `https://linear.app/x/${id}`,
    priority,
    branchName: `nij/${id}`,
    updatedAt: new Date(wed).toISOString(),
    state: { name: type, type },
    attachments: { nodes: attachments.map((url) => ({ url })) },
  });
  const tabs = build(
    { viewer: { login: "me" }, mine: { nodes: [open] } },
    [
      issue("A", "unstarted", 1),
      issue("B", "started", 3, [open.url]),
      issue("C", "started", 2),
      issue("D", "triage", 0),
    ],
    wed,
  ) as Tabs;
  expect(tabs.work.linear.map((c) => c.id)).toEqual(["C", "B", "A", "D"]);
  const b = at(tabs.work.linear, 1);
  expect(b.branch).toBe("feat/x");
  expect(b.who).toBe("PR #9");
  expect(task(b)).toMatch(/^Work on B: B\./);
});

test("clones map to their origin, the one named like the repo first", () => {
  const clones = parseClones(
    "/h/dev/agents-x\tgit@github.com:o/agents.git\n/h/dev/agents\tgit@github.com:o/agents.git\n/h/p/r\thttps://github.com/O/r\n",
  ) as Record<string, string[]>;
  expect(clones["o/agents"]).toEqual(["/h/dev/agents", "/h/dev/agents-x"]);
  expect(clones["O/r"]).toEqual(["/h/p/r"]);
});
