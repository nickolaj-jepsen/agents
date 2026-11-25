// The work queue: GitHub reviews asked of you, your own PRs that need you and your
// Linear issues, as cards in the right panel, split into Work (Linear and
// Digital-Udvikling) and Personal. Click a card to open it in the browser;
// right-click for worktree, agent and copy actions.
//
// One copy fetches (the layout's 0px `feed` block, so the header's count is there
// before the panel first opens); every copy reads the same module-level store and
// redraws when the feed publishes `shared("workqueue")`. The same mod opened as a
// popup with `props().menu` is a card's menu.

import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import {
  theme,
  props,
  run,
  exec,
  home,
  panes,
  spaces,
  shared,
  setShared,
  openOverlay,
  closeOverlay,
  notify,
  readTextFile,
  knownAgents,
} from "herdr";
import { WORK_ORG, ago, build, needs, parseClones, task } from "./queue.js";

const ICON = (name) => `mods/workspace-chrome/${name}.svg`;
const OWN = (name) => `mods/workqueue/${name}.svg`;
const CAP = 6;
const EVERY = { gh: 120000, linear: 300000, clones: 600000 };
// Written by home-manager from the linear-api-key secret.
const KEY_FILE = () => `${home()}/.config/workqueue/linear-api-key`;
const AGENT = { work: "claude-work", personal: "claude" };

const PR = `
  number title url isDraft createdAt updatedAt headRefName additions deletions mergeable reviewDecision
  repository { nameWithOwner owner { login } }
  author { login }
  reviewRequests(first: 20) { nodes { requestedReviewer { __typename ... on User { login } ... on Team { slug } } } }
  latestReviews(first: 20) { totalCount nodes { state } }
  reviewThreads(first: 30) { nodes { isResolved } }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  timelineItems(last: 8, itemTypes: [REVIEW_REQUESTED_EVENT, PULL_REQUEST_REVIEW, READY_FOR_REVIEW_EVENT]) {
    nodes { __typename
      ... on ReviewRequestedEvent { createdAt requestedReviewer { __typename ... on User { login } } }
      ... on PullRequestReview { submittedAt }
      ... on ReadyForReviewEvent { createdAt } }
  }`;
const GH_QUERY = `query {
  viewer { login }
  direct: search(query: "is:pr is:open archived:false user-review-requested:@me", type: ISSUE, first: 50) { nodes { ... on PullRequest { ${PR} } } }
  review: search(query: "is:pr is:open archived:false review-requested:@me", type: ISSUE, first: 50) { nodes { ... on PullRequest { ${PR} } } }
  mine: search(query: "is:pr is:open archived:false author:@me", type: ISSUE, first: 60) { nodes { ... on PullRequest { ${PR} } } }
}`;
const LINEAR_QUERY = `query {
  viewer { assignedIssues(first: 100, filter: { state: { type: { in: ["triage", "unstarted", "started"] } } }) {
    nodes { identifier title url priority branchName updatedAt state { name type } attachments(first: 10) { nodes { url } } }
  } }
}`;
// Clones worth matching a PR to, as `folder<TAB>origin` (the folders New space offers).
const CLONES = `for d in "$HOME/nixos" "$HOME"/dev/*/ "$HOME"/dev/devenv-tilt/projects/*/; do
  d=\${d%/}; [ -e "$d/.git" ] || continue
  u=$(git -C "$d" remote get-url origin 2>/dev/null) && printf '%s\\t%s\\n' "$d" "$u"
done`;

const lastLine = (r, what) => (r.stderr || r.stdout || `${what} failed`).trim().split("\n").pop();
const message = (e) => String(e?.message ?? e);
const base = (path) => (path ?? "").replace(/\/+$/, "").split("/").pop();

// Shared by every copy of this source version (a save starts a fresh one).
const store = {
  gh: null,
  linear: null, // issue nodes; null: no key or not loaded yet
  clones: null, // owner/repo -> folders
  errors: {},
  at: {}, // kind -> when it last loaded
  busy: {},
  tabs: build(null, null, Date.now()),
  rev: null,
  feeding: false,
};

const LOADERS = {
  async gh() {
    const r = await exec("gh", ["api", "graphql", "-f", `query=${GH_QUERY}`], { timeout: 90000 });
    if (r.code !== 0) throw new Error(lastLine(r, "gh api"));
    const j = JSON.parse(r.stdout);
    if (!j.data) throw new Error(j.errors?.[0]?.message ?? "GitHub returned no data");
    store.gh = j.data;
  },
  async linear() {
    const key = (await readTextFile(KEY_FILE()).catch(() => null))?.trim();
    if (!key) {
      store.linear = null;
      return;
    }
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      // Personal API keys go in raw; Linear rejects them with a Bearer prefix.
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({ query: LINEAR_QUERY }),
    });
    const j = JSON.parse(await res.text());
    if (!j.data) throw new Error(j.errors?.[0]?.message ?? `Linear answered ${res.status}`);
    store.linear = j.data.viewer.assignedIssues.nodes;
  },
  async clones() {
    const r = await exec("sh", ["-c", CLONES], { timeout: 20000 });
    store.clones = parseClones(r.stdout);
  },
};

function hash(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Rebuilds the cards and, when anything shown changed, tells every mod (the header's
// count, the panel) through shared state.
function publish() {
  store.tabs = build(store.gh, store.linear, Date.now());
  const shown = Object.values(store.tabs).flatMap((t) =>
    Object.values(t)
      .flat()
      .map((c) => [c.key, c.highlight, c.who, c.signals, c.title]),
  );
  const rev = hash(JSON.stringify([shown, store.errors]));
  if (rev === store.rev) return;
  store.rev = rev;
  setShared("workqueue", {
    work: needs(store.tabs.work),
    personal: needs(store.tabs.personal),
    rev,
  });
}

// Loads one source unless it's already loading; resolves when it's in the store.
function refresh(kind) {
  store.busy[kind] ??= LOADERS[kind]()
    .then(
      () => {
        store.errors[kind] = null;
        store.at[kind] = Date.now();
      },
      (e) => (store.errors[kind] = message(e)),
    )
    .finally(() => {
      store.busy[kind] = null;
      publish();
    });
  return store.busy[kind];
}

// Panes read once per render; the space (and the pane's folder) working on `card`'s
// branch in one of its repo's checkouts, if one is open on this computer.
function spaceFor(card, ps) {
  if (!card.branch) return null;
  const roots = card.repo ? (store.clones?.[card.repo] ?? []) : null;
  const trees = `${home()}/worktrees/`;
  const under = (cwd) =>
    !roots ||
    roots.some(
      (r) => cwd === r || cwd.startsWith(`${r}/`) || cwd.startsWith(`${trees}${base(r)}/`),
    );
  for (const s of spaces()) {
    if (s.machine) continue;
    const ids = new Set(s.tabs.map((c) => c.id));
    const p = ps.find((p) => ids.has(p.tab) && p.branch === card.branch && p.cwd && under(p.cwd));
    if (p) return { space: s, cwd: p.cwd };
  }
  return null;
}

// The worktree for `card` in the clone at `repo`, made or reopened by wt. A PR's head is
// fetched into a local branch first (forks too); a Linear branch starts off the default.
async function worktree(card, repo) {
  const sh = (cmd, args, timeout = 20000) => exec(cmd, args, { cwd: repo, timeout });
  const ok = (r, what) => {
    if (r.code !== 0) throw new Error(lastLine(r, what));
    return r;
  };
  const list = await sh("wt", ["list", "--json"]).catch(() => null);
  if (list?.code === 0) {
    const trees = JSON.parse(list.stdout).repos?.[0]?.worktrees ?? [];
    const open = trees.find((w) => w.branch === card.branch && w.open);
    if (open) return open.path;
  }
  const pr = card.kind === "linear" ? (card.pr?.open ? card.pr.number : null) : card.number;
  const has =
    (await sh("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${card.branch}`])).code === 0;
  if (pr && !has)
    ok(
      await sh("git", ["fetch", "--quiet", "origin", `pull/${pr}/head:${card.branch}`], 60000),
      "git fetch",
    );
  const r = ok(await sh("wt", ["new", card.branch], 120000), "wt new");
  return r.stdout.trim().split("\n").pop();
}

const workClones = () =>
  Object.entries(store.clones ?? {})
    .filter(([repo]) => repo.startsWith(`${WORK_ORG}/`))
    .map(([repo, paths]) => ({ repo, path: paths[0] }))
    .sort((a, b) => a.repo.localeCompare(b.repo));

export default class WorkQueue extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.menu = p.menu ?? null;
    if (this.menu) {
      this.busy = null;
      this.picking = null; // "worktree" | "agent": choosing a repo for a Linear issue
      return;
    }
    this.feed = Boolean(p.feed);
    this.tab = localStorage.getItem("tab") === "personal" ? "personal" : "work";
    this.open = new Set();
    if (store.feeding) return;
    store.feeding = true;
    for (const kind of ["clones", "gh", "linear"]) {
      cx.spawn(async () => {
        await refresh(kind);
      });
      cx.timer.every(EVERY[kind], (cx) =>
        cx.spawn(async () => {
          await refresh(kind);
        }),
      );
    }
  }

  async close() {
    if (!this.menu && store.feeding && this.feed) store.feeding = false;
  }

  render() {
    if (this.menu) return this.renderMenu();
    if (this.feed) return div();
    return this.renderPanel();
  }

  // ---- the panel ----

  renderPanel() {
    const t = theme();
    shared("workqueue"); // redraw with the feed
    const ps = panes();
    const tabs = store.tabs;
    const tab = tabs[this.tab];
    const segment = (id, label) => {
      const on = this.tab === id;
      const n = needs(tabs[id]);
      return h_flex()
        .id(`wq-tab-${id}`)
        .flex_1()
        .h(24)
        .gap(6)
        .items_center()
        .justify_center()
        .rounded(6)
        .text_size(12)
        .bg(on ? t.selected : t.background)
        .text_color(on ? t.foreground : t.muted)
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          this.tab = id;
          localStorage.setItem("tab", id);
          cx.notify();
        })
        .child(label)
        .when(n > 0, (el) =>
          el.child(
            div()
              .text_size(11)
              .text_color(on ? t.muted : t.dim)
              .child(String(n)),
          ),
        );
    };
    const body = [];
    const section = (id, label, cards, kinds) => {
      if (!cards.length && !(id === "linear" && store.errors.linear)) return;
      body.push(this.sectionHead(id, label, cards.length, kinds, t));
      const all = this.open.has(id);
      const shown = all ? cards : cards.slice(0, CAP);
      for (const c of shown) body.push(this.card(c, t, ps));
      if (cards.length > CAP)
        body.push(
          this.fold(id, all ? "Show fewer" : `${cards.length - CAP} more`, t, () => {
            if (all) this.open.delete(id);
            else this.open.add(id);
          }),
        );
    };
    section("review", "Review", tab.review, ["gh"]);
    section("mine", "Mine", tab.mine, ["gh"]);
    if (tab.dormant.length) {
      const all = this.open.has("dormant");
      if (!tab.mine.length) body.push(this.sectionHead("mine", "Mine", 0, ["gh"], t));
      body.push(
        this.fold("dormant", `${tab.dormant.length} dormant`, t, () => {
          if (all) this.open.delete("dormant");
          else this.open.add("dormant");
        }),
      );
      if (all) for (const c of tab.dormant) body.push(this.card(c, t, ps, true));
    }
    if (this.tab === "work") section("linear", "Linear", tab.linear, ["linear"]);
    const failed = !store.gh && store.errors.gh;
    if (failed) body.unshift(this.failed(t));
    else if (!body.length)
      body.push(
        div()
          .pt(24)
          .w_full()
          .flex()
          .justify_center()
          .text_color(t.dim)
          .child(store.gh ? "Nothing needs you." : "Loading…"),
      );
    // Over cards from an earlier load: say they may be stale, quietly.
    if (store.errors.gh && store.gh)
      body.unshift(this.problem("gh", `GitHub: ${store.errors.gh}`, t));
    return v_flex()
      .id("wq-root")
      .size_full()
      .min_h(0)
      .gap(10)
      .bg(t.canvas)
      .text_size(12)
      .child(
        h_flex()
          .flex_none()
          .p(2)
          .gap(2)
          .rounded(8)
          .bg(t.background)
          .child(segment("work", "Work"))
          .child(segment("personal", "Personal")),
      )
      .child(
        v_flex().id("wq-scroll").flex_1().min_h(0).gap(6).overflow_y_scrollbar().children(body),
      );
  }

  failed(t) {
    return v_flex()
      .id("wq-failed")
      .pt(24)
      .px(12)
      .gap(6)
      .items_center()
      .child(div().text_color(t.blocked).child("Couldn't load GitHub"))
      .child(
        div()
          .text_size(11)
          .text_color(t.dim)
          .whitespace_normal()
          .text_center()
          .child(store.errors.gh),
      )
      .child(
        div()
          .id("wq-retry")
          .px(10)
          .h(24)
          .flex()
          .items_center()
          .rounded(6)
          .text_size(11.5)
          .bg(t.background)
          .text_color(t.foreground)
          .cursor_pointer()
          .hover((s) => s.bg(t.selected))
          .when(Boolean(store.busy.gh), (el) => el.text_color(t.dim))
          .on_click((_e, cx) =>
            cx.spawn(async (cx) => {
              const work = refresh("gh");
              cx.notify();
              await work;
              cx.notify();
            }),
          )
          .child(store.busy.gh ? "Retrying…" : "Retry"),
      );
  }

  problem(kind, text, t) {
    return div()
      .id(`wq-problem-${kind}`)
      .px(4)
      .text_size(11)
      .text_color(t.dim)
      .tooltip(text)
      .truncate()
      .child(text);
  }

  sectionHead(id, label, count, kinds, t) {
    const busy = kinds.some((k) => store.busy[k]);
    const error = kinds.map((k) => store.errors[k]).find(Boolean);
    return h_flex()
      .id(`wq-head-${id}`)
      .flex_none()
      .h(22)
      .mt(6)
      .px(4)
      .gap(6)
      .items_center()
      .text_size(11.5)
      .font_semibold()
      .text_color(t.muted)
      .cursor_pointer()
      .tooltip(
        [
          error && `${label}: ${error}`,
          ...kinds.map((k) => store.at[k] && `Updated ${ago(Date.now() - store.at[k])} ago`),
          "Click to refresh",
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => {
        for (const k of kinds)
          cx.spawn(async (cx) => {
            const work = refresh(k);
            cx.notify();
            await work;
            cx.notify();
          });
      })
      .child(label)
      .when(count > 0, (el) => el.child(div().font_normal().text_color(t.dim).child(String(count))))
      .child(div().flex_1())
      .when(busy, (el) => el.child(svg(ICON("spinner")).size(11).text_color(t.dim).spin(900)))
      .when(!busy && Boolean(error), (el) =>
        el.child(div().text_color(t.blocked).font_normal().child("!")),
      );
  }

  fold(id, label, t, toggle) {
    const open = this.open.has(id);
    return h_flex()
      .id(`wq-fold-${id}`)
      .flex_none()
      .h(24)
      .px(10)
      .gap(6)
      .items_center()
      .rounded(6)
      .text_size(11.5)
      .text_color(t.dim)
      .cursor_pointer()
      .hover((s) => s.bg(t.background).text_color(t.muted))
      .on_click((_e, cx) => {
        toggle();
        cx.notify();
      })
      .child(svg(ICON(open ? "chevron-down" : "chevron-right")).size(11))
      .child(label);
  }

  card(c, t, ps, quiet = false) {
    const tone = (name) => t[name] ?? t.muted;
    const at = spaceFor(c, ps);
    const status = at?.space.status ?? (at ? "idle" : null);
    const dim = c.team || quiet;
    const h = c.highlight;
    // Colour stays rare: an alarm is a dot beside plain text; only "ready" is green text.
    const alarm = h.tone === "blocked";
    const chip = (text, color) =>
      div()
        .flex_none()
        .px(5)
        .rounded(4)
        .bg(color + "22")
        .text_size(10.5)
        .text_color(color)
        .child(text);
    const top = h_flex()
      .h(16)
      .gap(6)
      .items_center()
      .text_size(11)
      .font_medium()
      .when(h.priority === "urgent", (el) => el.child(chip("Urgent", t.blocked)))
      .when(h.priority === "high", (el) => el.child(chip("High", t.muted)))
      .when(alarm, (el) => el.child(div().size(6).flex_none().rounded(3).bg(t.blocked)))
      .child(
        div()
          .text_color(alarm ? t.foreground : tone(h.tone))
          .truncate()
          .child(h.text),
      )
      .child(div().flex_1())
      .when(Boolean(status), (el) => el.child(this.dot(status, at, t)));
    const meta = h_flex()
      .h(16)
      .gap(6)
      .items_center()
      .text_size(11)
      .child(div().flex_none().text_color(t.muted).child(c.where))
      .when(Boolean(c.who), (el) =>
        el.child(div().min_w(0).truncate().text_color(t.dim).child(`· ${c.who}`)),
      )
      .child(div().flex_1())
      .children(c.signals.map((s) => this.signal(s, t)));
    return v_flex()
      .id(`wq-${c.key}`)
      .flex_none()
      .px(10)
      .py(8)
      .gap(3)
      .rounded(8)
      .bg(t.background)
      .cursor_pointer()
      .hover((s) => s.bg(t.selected))
      .on_click((_e, cx) => cx.open_url(c.url))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        openOverlay({
          mod: "workqueue",
          kind: "popup",
          width: 240,
          height: 204,
          props: { menu: c, tab: this.tab },
        });
      })
      .child(top)
      .child(
        div()
          .max_h(34)
          .overflow_hidden()
          .whitespace_normal()
          .line_height("17px")
          .text_size(12.5)
          .text_color(dim ? t.muted : t.foreground)
          .tooltip(c.title)
          .child(c.title),
      )
      .child(meta);
  }

  dot(status, at, t) {
    const mark =
      status === "working"
        ? svg(ICON("spinner")).size(10).text_color(t.working).spin(900)
        : div()
            .size(6)
            .rounded(3)
            .bg(status === "idle" ? t.dim : t[status]);
    return h_flex()
      .id(`wq-dot-${at.space.id}`)
      .size(16)
      .flex_none()
      .items_center()
      .justify_center()
      .rounded(4)
      .hover((s) => s.bg(t.border))
      .tooltip(`${at.space.name}: ${status}`)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run("space.select", { id: at.space.id });
      })
      .child(mark);
  }

  signal(s, t) {
    const color = t[s.tone] ?? t.dim;
    const icon = (path, text) =>
      h_flex()
        .flex_none()
        .gap(2)
        .items_center()
        .text_color(color)
        .tooltip(s.tip ?? "")
        .child(svg(path).size(11))
        .when(text !== undefined, (el) => el.child(String(text)));
    switch (s.kind) {
      case "ci":
        return icon(ICON(s.state === "failing" ? "x" : s.state === "pending" ? "clock" : "check"));
      case "diff":
        return div()
          .flex_none()
          .text_color(t.dim)
          .tooltip("Lines added and removed")
          .child(`+${s.added} −${s.removed}`);
      case "approved":
        return icon(ICON("circle-check"), s.count);
      case "changes":
        return icon(ICON("square-pen"), s.count);
      case "threads":
        return icon(OWN("message"), s.count);
      default:
        return div()
          .flex_none()
          .text_color(color)
          .tooltip(s.tip ?? "")
          .child(s.text);
    }
  }

  // ---- a card's menu ----

  act(id, cx, work) {
    if (this.busy) return;
    this.busy = id;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await work();
      } catch (e) {
        // A toast outlives the popup (Esc, a click beside it) and isn't clipped by it.
        notify({ title: "Couldn't open the worktree", body: message(e), level: "error" });
      }
      closeOverlay(props()?.overlay);
    });
  }

  // Into the card's worktree: its open space, or a new one. `repo`: the clone to make
  // it in (a Linear issue's pick); PRs use their own repo's clone.
  async enter(card, repo, agent) {
    const at = spaceFor(card, panes());
    let folder = at?.cwd;
    if (!folder) {
      const clone = repo ?? store.clones?.[card.repo]?.[0];
      if (!clone) throw new Error(`${card.repo ?? "The repo"} isn't cloned on this computer`);
      folder = await worktree(card, clone);
    }
    if (!agent) {
      if (at) run("space.select", { id: at.space.id });
      else run("space.new", { folder });
      return;
    }
    const key = AGENT[props()?.tab] ?? AGENT.work;
    const known = await knownAgents().catch(() => []);
    const found = known.find((a) => a.key === key);
    const argv = found?.run ?? [key];
    const first = task(card);
    if (at) {
      run("space.select", { id: at.space.id });
      run("tab.new", { space: at.space.id, folder, name: found?.name, argv, task: first });
    } else run("space.new", { folder, argv, task: first });
  }

  // A Linear issue without a known repo asks which work clone to use.
  needsPick(card) {
    if (card.kind !== "linear") return false;
    return !spaceFor(card, panes());
  }

  renderMenu() {
    const t = theme();
    const c = this.menu;
    if (this.picking) return this.renderPicker(t, c);
    const pr = c.kind !== "linear";
    const go = (id, agent) => (_e, cx) => {
      if (this.needsPick(c)) {
        this.picking = id;
        cx.notify();
        return;
      }
      this.act(id, cx, () => this.enter(c, null, agent));
    };
    const copy = (text) => (_e, cx) => {
      cx.write_to_clipboard(text);
      closeOverlay(props()?.overlay);
    };
    const items = [
      {
        id: "open",
        path: "mods/nested-spaces/open.svg",
        label: pr ? "Open in browser" : "Open in Linear",
        click: (_e, cx) => {
          cx.open_url(c.url);
          closeOverlay(props()?.overlay);
        },
      },
      {
        id: "worktree",
        icon: "folder",
        label: pr ? "Open worktree" : "Start worktree in…",
        click: go("worktree", false),
      },
      { id: "agent", icon: "terminal", label: "Start agent in worktree", click: go("agent", true) },
      c.branch && { id: "branch", icon: "git-branch", label: "Copy branch", click: copy(c.branch) },
      pr
        ? { id: "url", icon: "files", label: "Copy URL", click: copy(c.url) }
        : { id: "id", icon: "files", label: "Copy ID", click: copy(c.id) },
    ].filter(Boolean);
    return v_flex()
      .w_full()
      .p(6)
      .gap(1)
      .bg(t.popover)
      .text_size(12)
      .child(
        div()
          .px(8)
          .pt(3)
          .pb(5)
          .truncate()
          .text_size(11)
          .text_color(t.dim)
          .child(pr ? c.where : `${c.id} · ${c.title}`),
      )
      .children(
        items.map((i) =>
          h_flex()
            .id(`wq-menu-${i.id}`)
            .h(30)
            .flex_none()
            .px(8)
            .gap(9)
            .items_center()
            .rounded(6)
            .text_color(this.busy && this.busy !== i.id ? t.dim : t.foreground)
            .cursor_pointer()
            .hover((s) => s.bg(t.hover))
            .on_click(i.click)
            .child(
              svg(i.path ?? ICON(i.icon))
                .size(13)
                .text_color(t.muted),
            )
            .child(div().flex_1().child(i.label))
            .when(this.busy === i.id, (el) => el.child(this.spinner(t))),
        ),
      );
  }

  spinner(t) {
    return svg(ICON("spinner")).size(12).flex_none().text_color(t.muted).spin(900);
  }

  renderPicker(t, c) {
    const clones = workClones();
    const linked = clones.find((k) => k.repo === c.repo);
    const rows = linked ? [linked, ...clones.filter((k) => k !== linked)] : clones;
    const agent = this.picking === "agent";
    return v_flex()
      .w_full()
      .h(222)
      .p(6)
      .gap(1)
      .bg(t.popover)
      .text_size(12)
      .child(
        div().px(8).pt(3).pb(5).text_size(11).text_color(t.dim).child(`${c.id} in which repo?`),
      )
      .child(
        v_flex()
          .id("wq-pick")
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .children(
            rows.map((k) =>
              h_flex()
                .id(`wq-pick-${k.repo}`)
                .h(28)
                .flex_none()
                .px(8)
                .gap(8)
                .items_center()
                .rounded(6)
                .text_color(this.busy && this.busy !== k.repo ? t.dim : t.foreground)
                .cursor_pointer()
                .hover((s) => s.bg(t.hover))
                .on_click((_e, cx) => this.act(k.repo, cx, () => this.enter(c, k.path, agent)))
                .child(div().flex_1().truncate().child(base(k.repo)))
                .when(k === linked, (el) =>
                  el.child(div().text_size(10.5).text_color(t.dim).child(`PR #${c.number}`)),
                )
                .when(this.busy === k.repo, (el) => el.child(this.spinner(t))),
            ),
          )
          .when(!rows.length, (el) =>
            el.child(div().px(8).py(6).text_color(t.dim).child("No work repos cloned here.")),
          ),
      );
  }
}
