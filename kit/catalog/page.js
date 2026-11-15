// The catalogue page's script: builds the DOM from the embedded model with createElement and
// textContent only, so nothing in the data is ever parsed as markup.
//
// Routes live in the hash, so a link, a reload and the back button all land on the same view:
//   #/                                    landing: components x harness matrix
//   #/<component>[/stories|compat|props]  one component, one tab (stories by default)
//   #/<component>/s/<state>               one story
// followed by ?h=pi|claude (harness filter; absent means both), size=<w>x<h>,
// lay=side|stack|flip and diff=1 (compatibility: only differences). The filter is read from the
// link alone, so a link always shows what it says; size and layout fall back to the last choice.
const data = JSON.parse(document.getElementById("model").textContent);
const HARNESSES = ["pi", "claude"];
const TITLES = { pi: "pi", claude: "Claude Code" };
const MARK = { pi: "π", claude: "C" };
const GLYPH = { yes: "✓", partial: "~", no: "✗", planned: "○", exists: "✓", none: "✗" };
const LABEL = {
  yes: "yes",
  partial: "partial",
  no: "no",
  planned: "planned",
  exists: "exists",
  none: "not possible",
};
const TABS = [
  ["stories", "Stories"],
  ["compat", "Compatibility"],
  ["props", "Props"],
];
const SITE = "Kit catalogue";
// Crops are the terminal's cells at this many pixels; used when a crop is missing.
const CELL = { w: 10, h: 21 };
// Layout constants shared with page.css: the padding round a render, the gap between the two.
const PAD = 12;
const GAP = 16;
// Renders are never upscaled and never shrunk below this: the text stays readable, and what
// does not fit is clipped (overview) or scrolled (story view) from the top left instead.
const K_MIN = 0.7;
const MAX_ROW = 340;

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === undefined || kid === null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const code = (t, cls) => h("code", { class: cls }, t);
const hc = (k) => "h-" + k;
const sizeKey = (s) => s.w + "x" + s.h;

const store = {
  get(k) {
    try {
      return localStorage.getItem("kit-" + k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      if (v) localStorage.setItem("kit-" + k, v);
      else localStorage.removeItem("kit-" + k);
    } catch {}
  },
};

const byId = new Map(data.components.map((c) => [c.id, c]));
const validH = (v) => (v === "pi" || v === "claude" ? v : "both");
const validLay = (v) => (v === "side" || v === "stack" || v === "flip" ? v : null);
const validSize = (v) => (/^\d+x\d+$/.test(v || "") ? v : null);
const prefs = {
  h: "both",
  size: validSize(store.get("size")),
  lay: validLay(store.get("layout")),
  diff: false,
};

// ---- routing -----------------------------------------------------------------------------

const enc = encodeURIComponent;
function dec(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parse() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map(dec);
  const q = new URLSearchParams(query);
  const route = { view: "home" };
  const c = byId.get(parts[0]);
  if (c) {
    route.c = c;
    if (parts[1] === "s" && parts[2] !== undefined) {
      const story = c.stories.find((s) => s.state === parts[2]);
      if (story) return finish({ view: "story", c, story }, q);
    }
    route.view = "component";
    route.tab = TABS.some(([t]) => t === parts[1]) ? parts[1] : "stories";
  }
  return finish(route, q);
}

function finish(route, q) {
  prefs.h = validH(q.get("h"));
  prefs.diff = q.get("diff") === "1";
  prefs.size = validSize(q.get("size")) || prefs.size;
  prefs.lay = validLay(q.get("lay")) || prefs.lay;
  store.set("size", prefs.size);
  store.set("layout", prefs.lay);
  return route;
}

/** The canonical hash for a route (a link target) with the given preferences. */
function hashFor(route, p = prefs) {
  let path = "#/";
  if (route.c) {
    path += enc(route.c.id);
    if (route.story) path += "/s/" + enc(route.story.state);
    else if (route.tab && route.tab !== "stories") path += "/" + route.tab;
  }
  const q = [];
  if (p.h !== "both") q.push("h=" + p.h);
  if (route.story || route.tab === "stories") {
    if (p.size) q.push("size=" + p.size);
    if (route.story && p.lay) q.push("lay=" + p.lay);
  }
  if (route.tab === "compat" && p.diff) q.push("diff=1");
  return path + (q.length ? "?" + q.join("&") : "");
}

const to = (route) => hashFor(route);
const storyRoute = (c, story) => ({ view: "story", c, story });
const compRoute = (c, tab) => ({ view: "component", c, tab });

function go(route, next) {
  location.hash = hashFor(route, { ...prefs, ...next });
}

// ---- data helpers ------------------------------------------------------------------------

const visible = () => (prefs.h === "both" ? HARNESSES : [prefs.h]);

function sizesOf(stories, harnesses) {
  const out = [];
  for (const s of stories)
    for (const k of harnesses)
      for (const x of (s.by[k] || { shots: [] }).shots)
        if (!out.some((o) => o.w === x.w && o.h === x.h)) out.push({ w: x.w, h: x.h });
  return out.sort((a, b) => a.w - b.w || a.h - b.h);
}

/** The wanted size when offered, else the nearest by width; the preference itself is kept. */
function effectiveSize(sizes) {
  if (!sizes.length) return null;
  const want = prefs.size;
  const exact = sizes.find((s) => sizeKey(s) === want);
  if (exact) return exact;
  const w = want ? Number(want.split("x")[0]) : 0;
  return sizes.reduce((a, b) => (Math.abs(b.w - w) < Math.abs(a.w - w) ? b : a));
}

const shotAt = (story, k, size) =>
  size && story.by[k] && story.by[k].shots.find((s) => s.w === size.w && s.h === size.h);

/** The shot at the size, else the nearest one by width (marked `near`), else nothing. */
function shotNear(story, k, size) {
  const shots = (story.by[k] && story.by[k].shots) || [];
  const exact = shotAt(story, k, size);
  if (exact || !shots.length || !size) return exact ? { shot: exact } : null;
  const near = shots.reduce((a, b) => (Math.abs(b.w - size.w) < Math.abs(a.w - size.w) ? b : a));
  return { shot: near, near: true };
}

/** Pixel size of a shot's picture. */
function pixelsOf(shot) {
  if (shot.pw) return { w: shot.pw, h: shot.ph };
  return shot.crop
    ? { w: shot.w * CELL.w, h: shot.h * CELL.h }
    : { w: 78 + shot.w * CELL.w, h: 104 + shot.h * CELL.h };
}

function storyAbout(story) {
  return HARNESSES.map((k) => story.by[k] && story.by[k].about).find(Boolean);
}

/** What stands in for a render a harness does not have: a kind and one line of reason. */
function whyNot(c, story, k, size) {
  const i = c.impl[k];
  const own = story.by[k];
  if (i.state === "none")
    return { kind: "none", text: "not possible: " + (story.missing[k] || i.reason || "") };
  if (own && own.shots.length)
    return {
      kind: "plan",
      text:
        "no render at " +
        (size ? sizeKey(size) : "this size") +
        "; has " +
        own.shots.map(sizeKey).join(", "),
    };
  if (own && own.hasStory) return { kind: "plan", text: "story has no render yet" };
  return { kind: "plan", text: "no story yet" };
}

/** filled: has a render; hollow: planned or not rendered yet; struck: the harness cannot. */
function renderState(c, story, k) {
  if (c.impl[k].state === "none") return "none";
  return story.by[k] && story.by[k].shots.length ? "on" : "plan";
}

const MARK_TEXT = {
  on: "has a render",
  plan: "no render yet",
  none: "not possible",
};

function mark(k, state, what) {
  return h(
    "span",
    {
      class: "mk " + state,
      title: TITLES[k] + ": " + what,
      role: "img",
      "aria-label": TITLES[k] + ": " + what,
    },
    MARK[k],
  );
}

const implState = (c, k) => ({ exists: "on", planned: "plan", none: "none" })[c.impl[k].state];
const implText = { on: "implemented", plan: "planned", none: "not possible" };

function marks(pairs) {
  return h("span", { class: "marks" }, pairs);
}

const kind = (s) => (s === "yes" || s === "exists" ? "yes" : s === "none" ? "no" : s);

// ---- small pieces ------------------------------------------------------------------------

function status(s) {
  return h(
    "span",
    { class: "status " + kind(s) },
    h("span", { "aria-hidden": "true" }, GLYPH[s]),
    LABEL[s],
  );
}

function segmented(label, items, current, onPick) {
  return h(
    "div",
    { class: "seg", role: "group", "aria-label": label },
    items.map(([value, text, title]) =>
      h(
        "button",
        {
          type: "button",
          title,
          "aria-pressed": String(value === current),
          "data-fk": label + value,
          on: { click: () => onPick(value) },
        },
        text,
      ),
    ),
  );
}

/** One button per size; a size one harness lacks says which harness has it. */
function sizeSwitcher(route, sizes, current, stories) {
  if (!sizes.length) return null;
  const items = sizes.map((s) => {
    const have = visible().filter((k) => stories.some((st) => shotAt(st, k, s)));
    const only = have.length === 1 && prefs.h === "both" ? have[0] : null;
    return [
      sizeKey(s),
      only ? [sizeKey(s), h("span", { class: "only" }, MARK[only])] : sizeKey(s),
      only ? "Only " + TITLES[only] + " has a render at this size" : undefined,
    ];
  });
  return h(
    "div",
    { class: "ctl" },
    h("span", { class: "label" }, "Terminal size"),
    segmented("Size", items, sizeKey(current), (v) => go(route, { size: v })),
  );
}

// ---- landing -----------------------------------------------------------------------------

function counts(c, k) {
  const n = { yes: 0, partial: 0, no: 0 };
  for (const f of c.features) n[f.support[k].status === "planned" ? "no" : f.support[k].status]++;
  return n;
}

function countChips(n) {
  return h(
    "span",
    { class: "counts" },
    [
      ["yes", "✓", "yes"],
      ["partial", "~", "partial"],
      ["no", "✗", "no"],
    ].map(([s, g, t]) =>
      h(
        "span",
        { class: "count " + s + (n[s] ? "" : " zero"), title: n[s] + " " + t },
        h("span", { "aria-hidden": "true" }, g),
        " " + n[s],
        h("span", { class: "sr" }, " " + t),
      ),
    ),
  );
}

const differs = (f) => f.support.pi.status !== f.support.claude.status;
const rendersOf = (c, k) => c.stories.filter((s) => s.by[k] && s.by[k].shots.length).length;

function matrix() {
  const total = {
    pi: { yes: 0, partial: 0, no: 0, r: 0 },
    claude: { yes: 0, partial: 0, no: 0, r: 0 },
  };
  let totalDiff = 0;
  let totalStories = 0;
  const rows = data.components.map((c) => {
    const nd = c.features.filter(differs).length;
    totalDiff += nd;
    totalStories += c.stories.length;
    return h(
      "tr",
      null,
      h("th", { scope: "row" }, h("a", { href: to(compRoute(c, "stories")) }, c.name)),
      HARNESSES.map((k) => {
        const n = counts(c, k);
        const r = rendersOf(c, k);
        total[k].r += r;
        for (const s of ["yes", "partial", "no"]) total[k][s] += n[s];
        return h(
          "td",
          { class: hc(k) },
          h(
            "div",
            { class: "cellrow" },
            status(c.impl[k].state),
            c.impl[k].state === "none" ? null : countChips(n),
          ),
          c.impl[k].state === "none"
            ? h("div", { class: "note" }, c.impl[k].reason)
            : h(
                "div",
                { class: "note" },
                r + " of " + c.stories.length + " stories rendered · ",
                c.impl[k].exports.map((e, i) => [i ? ", " : "", code(e)]),
              ),
        );
      }),
      h(
        "td",
        null,
        nd
          ? h(
              "a",
              { href: hashFor(compRoute(c, "compat"), { ...prefs, diff: true }) },
              nd + " of " + c.features.length,
            )
          : h("span", { class: "dim" }, "none"),
      ),
    );
  });
  const foot = h(
    "tr",
    { class: "total" },
    h("th", { scope: "row" }, "All"),
    HARNESSES.map((k) =>
      h(
        "td",
        { class: hc(k) },
        h("div", { class: "cellrow" }, countChips(total[k])),
        h("div", { class: "note" }, total[k].r + " of " + totalStories + " stories rendered"),
      ),
    ),
    h("td", null, totalDiff + " features"),
  );
  return h(
    "div",
    { class: "scroll" },
    h(
      "table",
      { class: "matrix" },
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", null, "Component"),
          HARNESSES.map((k) => h("th", { class: hc(k) }, TITLES[k])),
          h("th", null, "Features that differ"),
        ),
      ),
      h("tbody", null, rows),
      h("tfoot", null, foot),
    ),
  );
}

function legend() {
  return h(
    "div",
    { class: "legend" },
    [
      ["yes", "works"],
      ["partial", "works with a caveat"],
      ["no", "the engine cannot"],
      ["planned", "can, not built yet"],
    ].map(([s, t]) => h("span", null, status(s), " " + t)),
  );
}

/** The key to the little π / C marks in the sidebar and on the page. */
function markKey() {
  return h(
    "p",
    { class: "markkey" },
    h("span", null, mark("pi", "on", "has it"), " pi"),
    h("span", null, mark("claude", "on", "has it"), " Claude Code"),
    h("span", { class: "dim" }, "filled has it · outline not yet · struck not possible"),
  );
}

function homeView() {
  return [
    h(
      "div",
      { class: "head" },
      h("h1", { tabindex: "-1" }, SITE),
      h(
        "p",
        { class: "lead" },
        "Each kit component in pi and in Claude Code: what it supports, its props from source, and its renders side by side. Pick a component, or press ",
        h("kbd", null, "/"),
        " to filter.",
      ),
      markKey(),
    ),
    h("section", { class: "section" }, matrix()),
  ];
}

// ---- component: stories, compatibility, props --------------------------------------------

/** A render's figure: label, picture clipped to a window, or the reason there is none. */
function cell(c, story, k, size, opts) {
  const pick = shotNear(story, k, size);
  const label = h(
    "figcaption",
    null,
    h("strong", null, TITLES[k]),
    story.by[k] && story.by[k].settings ? code(story.by[k].settings) : null,
  );
  if (!pick) {
    const why = whyNot(c, story, k, size);
    return h(
      "figure",
      { class: "cell gone " + hc(k) },
      label,
      h("div", { class: "view" }, h("span", { class: "mk " + why.kind }, MARK[k]), why.text),
    );
  }
  const px = pixelsOf(pick.shot);
  const img = h("img", {
    loading: "lazy",
    src: pick.shot.crop || pick.shot.src,
    width: px.w,
    height: px.h,
    alt: TITLES[k] + " " + story.id + " at " + pick.shot.w + "x" + pick.shot.h,
  });
  const clip = h("span", { class: "clip" }, "clipped, open for all");
  const view = h("div", { class: "view" }, img, opts && opts.clip ? clip : null);
  return h(
    "figure",
    { class: "cell " + hc(k) },
    label,
    view,
    pick.near
      ? h(
          "p",
          { class: "tag" },
          "no render at " + sizeKey(size) + "; showing " + sizeKey(pick.shot),
        )
      : null,
  );
}

/** Same scale for every render on the page, never above 1 and never below K_MIN. */
function fitRows(list, cells) {
  const inner = list.clientWidth - 2 * PAD - 2 - 2 * PAD;
  const widest = Math.max(1, ...cells.map((x) => x.w));
  const cap = Math.min(widest, 960);
  const two = list.dataset.both === "1";
  const side = two ? (inner + 2 * PAD - GAP) / 2 - 2 * PAD : inner;
  const stack = two && side / cap < 0.75;
  const col = stack ? inner : side;
  const k = Math.max(K_MIN, Math.min(1, col / cap));
  list.classList.toggle("stack", stack);
  for (const x of cells) {
    x.img.style.width = Math.round(x.w * k) + "px";
    x.img.style.height = Math.round(x.h * k) + "px";
    const clipped = x.w * k > col + 1 || x.h * k > MAX_ROW + 1;
    x.view.classList.toggle("clipped", clipped);
  }
  const note = list.parentElement && list.parentElement.querySelector(".scale");
  if (note) note.textContent = "Shown at " + Math.round(k * 100) + "% of actual size";
}

function storiesTab(c) {
  const route = compRoute(c, "stories");
  if (!c.stories.length) return h("p", { class: "dim" }, "No stories yet.");
  const sizes = sizesOf(c.stories, visible());
  const size = effectiveSize(sizes);
  const list = h("ul", { class: "rows", "data-both": prefs.h === "both" ? "1" : "0" });
  const cells = [];
  for (const s of c.stories) {
    const figs = visible().map((k) => cell(c, s, k, size, { clip: true }));
    for (const fig of figs) {
      const img = fig.querySelector("img");
      if (img)
        cells.push({
          img,
          view: fig.querySelector(".view"),
          w: Number(img.getAttribute("width")),
          h: Number(img.getAttribute("height")),
        });
    }
    list.append(
      h(
        "li",
        null,
        h(
          "a",
          { class: "row", href: to(storyRoute(c, s)), "data-fk": "card-" + s.id },
          h(
            "span",
            { class: "rhead" },
            h("span", { class: "title" }, s.state),
            storyAbout(s) ? h("span", { class: "about" }, storyAbout(s)) : null,
            h("span", { class: "grow" }),
            h("span", { class: "open" }, "Open →"),
          ),
          h("span", { class: "pair" }, figs),
        ),
      ),
    );
  }
  zoomers.push(() => fitRows(list, cells));
  return [
    h(
      "div",
      { class: "bar" },
      sizeSwitcher(route, sizes, size || { w: 0, h: 0 }, c.stories),
      h("span", { class: "grow" }),
      h("span", { class: "dim scale" }),
    ),
    list,
  ];
}

function featureCell(c, f, k) {
  const s = f.support[k];
  const sid = f.story[k];
  const story = sid && c.stories.find((x) => x.id === sid);
  return h(
    "td",
    { class: hc(k) + " st-" + s.status, "data-label": TITLES[k] },
    status(s.status),
    s.note ? h("div", { class: "note" }, s.note) : null,
    story && (s.status === "yes" || s.status === "partial")
      ? h(
          "div",
          { class: "cell-story" },
          h("a", { href: to(storyRoute(c, story)) }, "See " + story.state + " →"),
        )
      : null,
  );
}

function compatTab(c) {
  if (!c.features.length) return h("p", { class: "dim" }, "No features listed.");
  const both = prefs.h === "both";
  const diff = both && prefs.diff;
  const nd = c.features.filter(differs).length;
  const shown = c.features.filter((f) => !diff || differs(f));
  const rows = shown.map((f) =>
    h(
      "tr",
      { class: both && differs(f) ? "differs" : "" },
      h(
        "th",
        { scope: "row" },
        f.label,
        both && differs(f) ? h("span", { class: "flag" }, "differs") : null,
      ),
      HARNESSES.map((k) => featureCell(c, f, k)),
    ),
  );
  return [
    h(
      "div",
      { class: "bar" },
      h(
        "span",
        { class: "dim" },
        both
          ? nd + " of " + c.features.length + " features differ between pi and Claude Code"
          : c.features.length + " features",
      ),
      h("span", { class: "grow" }),
      both
        ? h(
            "label",
            { class: "check" },
            h("input", {
              type: "checkbox",
              checked: diff,
              "data-fk": "diff",
              on: { change: (e) => go(compRoute(c, "compat"), { diff: e.target.checked }) },
            }),
            " Only differences",
          )
        : null,
    ),
    legend(),
    rows.length
      ? h(
          "div",
          { class: "scroll" },
          h(
            "table",
            { class: "compat" },
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", null, "Feature"),
                HARNESSES.map((k) => h("th", { class: hc(k) }, TITLES[k])),
              ),
            ),
            h("tbody", null, rows),
          ),
        )
      : h("p", { class: "dim" }, "No differences: both harnesses agree on every feature."),
  ];
}

function propRow(r, kind) {
  const decl = h(
    "div",
    { class: "decl" },
    code(r.name, "name"),
    r.optional ? code("?") : null,
    r.type ? [code(kind === "param" ? ": " : ": "), code(r.type, "type")] : null,
    r.default !== undefined ? [code(" = "), code(r.default, "def")] : null,
  );
  return h("div", { class: "prop" }, decl, r.doc ? h("p", { class: "doc" }, r.doc) : null);
}

function rowsBlock(rows, title, kind) {
  return h(
    "div",
    { class: "block" },
    h("h4", null, title),
    h(
      "div",
      { class: "props" },
      rows.map((r) => propRow(r, kind)),
    ),
  );
}

function apiColumn(c, k) {
  const api = c.api[k];
  const col = h("section", { class: "api " + hc(k) }, h("h2", null, TITLES[k]));
  if (!api) {
    const i = c.impl[k];
    col.append(
      h(
        "p",
        { class: "missing" },
        i.state === "none" ? "Not possible: " + i.reason : "Planned: the kit does not exist yet.",
      ),
    );
    return col;
  }
  for (const e of api.exports) {
    const block = h("div", { class: "block" }, h("pre", { class: "sig" }, code(e.signature)));
    if (e.doc) block.append(h("p", { class: "doc dim" }, e.doc));
    col.append(block);
    if (e.params.length) col.append(rowsBlock(e.params, "Parameters", "param"));
    if (e.members.length) col.append(rowsBlock(e.members, "Members", "member"));
  }
  for (const t of api.types) {
    const block = h("div", { class: "block" }, h("pre", { class: "sig" }, code(t.signature)));
    if (t.doc) block.append(h("p", { class: "doc dim" }, t.doc));
    col.append(block);
    if (t.rows.length) col.append(rowsBlock(t.rows, "Properties", "prop"));
  }
  return col;
}

function propsTab(c) {
  const shown = visible();
  const withApi = shown.filter((k) => c.api[k]);
  const cols = withApi.length === 1 && shown.length > 1 ? withApi : shown;
  const out = [
    h(
      "div",
      { class: "cols" },
      cols.map((k) => apiColumn(c, k)),
    ),
  ];
  const hidden = shown.filter((k) => !cols.includes(k));
  for (const k of hidden) out.push(h("p", { class: "missing" }, TITLES[k] + ": no props."));
  if (withApi.length === 1 && shown.length > 1) {
    const k = shown.find((x) => !c.api[x]);
    const i = c.impl[k];
    out.push(
      h(
        "p",
        { class: "missing" },
        TITLES[k] +
          ": " +
          (i.state === "none"
            ? "not possible, " + i.reason
            : "planned, the kit does not exist yet."),
      ),
    );
  }
  return out;
}

function componentView(route) {
  const c = route.c;
  const tab = route.tab;
  const body = { stories: storiesTab, compat: compatTab, props: propsTab }[tab](c);
  return [
    h(
      "div",
      { class: "head" },
      h("h1", { tabindex: "-1" }, c.name),
      h("p", { class: "lead" }, c.purpose),
      h(
        "div",
        { class: "pillrow" },
        HARNESSES.map((k) =>
          h(
            "span",
            { class: "impl " + hc(k) },
            mark(k, implState(c, k), implText[implState(c, k)]),
            h("span", null, TITLES[k]),
            status(c.impl[k].state),
            c.impl[k].state === "none" ? h("span", { class: "dim" }, c.impl[k].reason) : null,
          ),
        ),
      ),
    ),
    h(
      "nav",
      { class: "tabs", "aria-label": c.name + " sections" },
      TABS.map(([t, text]) =>
        h(
          "a",
          {
            href: to(compRoute(c, t)),
            "aria-current": t === tab ? "page" : undefined,
            "data-fk": "tab-" + t,
          },
          text,
          t === "stories" ? h("span", { class: "n" }, String(c.stories.length)) : null,
          t === "compat" ? h("span", { class: "n" }, String(c.features.length)) : null,
        ),
      ),
    ),
    h("section", { class: "section" }, body),
  ];
}

// ---- story view --------------------------------------------------------------------------

let zoomers = [];
window.addEventListener("resize", () => zoomers.forEach((f) => f()));

// Which render the flip view shows, and whether to show it at its actual size when it is
// shrunk to fit; both survive stepping from story to story.
let flipShown = null;
let actual = false;

function demonstrates(c, story) {
  const fs = c.features.filter((f) => HARNESSES.some((k) => f.story[k] === story.id));
  if (!fs.length) return null;
  return h(
    "p",
    { class: "dim" },
    "Demonstrates: ",
    fs.map((f, i) => [i ? "; " : "", h("a", { href: to(compRoute(c, "compat")) }, f.label)]),
  );
}

function footer(shot) {
  const px = pixelsOf(shot);
  return h(
    "footer",
    null,
    h("span", null, "terminal " + shot.w + "x" + shot.h),
    h("span", null, Math.round(px.w / CELL.w) + "×" + Math.round(px.h / CELL.h) + " cells shown"),
    h("a", { href: shot.src, target: "_blank", rel: "noopener" }, "Full terminal"),
  );
}

function storyView(route) {
  const { c, story } = route;
  const idx = c.stories.indexOf(story);
  const prev = c.stories[idx - 1];
  const next = c.stories[idx + 1];
  const shown = visible();
  const sizes = sizesOf([story], shown);
  const size = effectiveSize(sizes);
  const picks = shown.map((k) => ({ k, shot: shotAt(story, k, size) }));
  const have = picks.filter((p) => p.shot);
  const explicit = have.length < 2 ? "side" : prefs.lay;
  const mainW = main.clientWidth - 2 * parseFloat(getComputedStyle(main).paddingLeft || "0");
  const widestAll = Math.max(1, ...have.map((p) => pixelsOf(p.shot).w));
  // Side by side while that keeps the text at 75% or more, else one above the other.
  const autoLay = (W) => ((W - GAP) / 2 - 2 * PAD - 2 >= 0.75 * widestAll ? "side" : "stack");
  const lay = explicit || autoLay(mainW);
  const flipping = lay === "flip";
  if (!flipShown || !have.some((p) => p.k === flipShown)) flipShown = have[0] && have[0].k;

  const panels = [];
  const fit = [];
  const imgs = new Map();
  for (const p of have) {
    const px = pixelsOf(p.shot);
    const img = h("img", {
      src: p.shot.crop || p.shot.src,
      width: px.w,
      height: px.h,
      alt: TITLES[p.k] + " " + story.id + " at " + p.shot.w + "x" + p.shot.h,
    });
    imgs.set(p.k, img);
    fit.push({ k: p.k, img, w: px.w, h: px.h });
    if (!flipping)
      panels.push(
        h(
          "section",
          { class: "panel " + hc(p.k) },
          h(
            "header",
            null,
            h("h2", null, TITLES[p.k]),
            story.by[p.k] && story.by[p.k].settings ? code(story.by[p.k].settings) : null,
          ),
          h("div", { class: "stage" }, img),
          footer(p.shot),
        ),
      );
  }

  const gone = picks
    .filter((p) => !p.shot)
    .map((p) => {
      const why = whyNot(c, story, p.k, size);
      return h(
        "p",
        { class: "gone-row " + hc(p.k) },
        h("span", { class: "mk " + why.kind }, MARK[p.k]),
        h("strong", null, TITLES[p.k]),
        " " + why.text,
      );
    });

  let flipView = null;
  let setFlip = () => {};
  if (flipping) {
    const stage = h("div", { class: "stage flip" });
    const box = h("div", { class: "flipbox" }, [...imgs.values()]);
    stage.append(box);
    const caption = h("div", { class: "flipcap" });
    const foot = h("div", { class: "flipfoot" });
    setFlip = (k) => {
      flipShown = k;
      for (const [hk, img] of imgs) img.classList.toggle("off", hk !== k);
      const p = have.find((x) => x.k === k);
      caption.replaceChildren(
        segmented(
          "Showing",
          have.map((x) => [x.k, TITLES[x.k]]),
          k,
          (v) => setFlip(v),
        ),
        story.by[k] && story.by[k].settings ? code(story.by[k].settings) : null,
      );
      foot.replaceChildren(footer(p.shot));
    };
    // Holding the picture shows the other harness until it is let go.
    const other = () => have.find((x) => x.k !== flipShown).k;
    let held = null;
    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      held = flipShown;
      setFlip(other());
    });
    const release = () => {
      if (held) setFlip(held);
      held = null;
    };
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointerleave", release);
    stage.addEventListener("pointercancel", release);
    flipView = h("section", { class: "panel flipper" }, caption, stage, foot);
    setFlip(flipShown);
    flipView.flip = () => setFlip(other());
    currentFlip = flipView.flip;
  } else currentFlip = null;

  const wrap = h(
    "div",
    { class: "compare " + (flipping ? "flipping" : "") },
    flipping ? flipView : panels,
  );
  const note = h("p", { class: "dim scale" });
  const toggle = h("button", {
    type: "button",
    class: "btn",
    "aria-pressed": "false",
    on: {
      click: () => {
        actual = !actual;
        relayout();
      },
    },
  });

  function relayout() {
    const W = wrap.clientWidth;
    const widest = Math.max(1, ...fit.map((x) => x.w));
    const two = fit.length === 2 && !flipping;
    const chrome = 2 * PAD + 2;
    const mode = explicit || autoLay(W);
    const stack = mode !== "side" || !two;
    const col = stack ? W - chrome : (W - GAP) / 2 - chrome;
    const fitK = Math.max(K_MIN, Math.min(1, col / widest));
    const k = actual ? 1 : fitK;
    wrap.classList.toggle("stack", stack);
    for (const x of fit) {
      x.img.style.width = Math.round(x.w * k) + "px";
      x.img.style.height = Math.round(x.h * k) + "px";
    }
    if (flipping) {
      const box = wrap.querySelector(".flipbox");
      box.style.width = Math.round(widest * k) + "px";
      box.style.height = Math.round(Math.max(...fit.map((x) => x.h)) * k) + "px";
    }
    const shrunk = Math.round(fitK * 100);
    note.textContent = "Both shown at " + Math.round(k * 100) + "% of actual size";
    note.hidden = k === 1;
    if (fit.length === 1) note.textContent = "Shown at " + Math.round(k * 100) + "% of actual size";
    toggle.hidden = fitK >= 1 && !actual;
    toggle.textContent = actual ? "Fit to width (" + shrunk + "%)" : "Actual size";
    toggle.setAttribute("aria-pressed", String(actual));
  }
  zoomers.push(relayout);

  const nav = (dir, target, label) =>
    target
      ? h(
          "a",
          {
            class: "btn",
            href: to(storyRoute(c, target)),
            rel: dir,
            title: target.state + " (" + (dir === "prev" ? "←  k" : "→  j") + ")",
            "data-fk": "nav-" + dir,
          },
          label,
        )
      : h("span", { class: "btn", "aria-disabled": "true" }, label);

  return [
    h(
      "div",
      { class: "head" },
      h("h1", { tabindex: "-1" }, story.state),
      storyAbout(story) ? h("p", { class: "lead" }, storyAbout(story)) : null,
      demonstrates(c, story),
    ),
    h(
      "div",
      { class: "bar" },
      sizes.length ? sizeSwitcher(route, sizes, size, [story]) : null,
      have.length > 1
        ? h(
            "div",
            { class: "ctl" },
            h("span", { class: "label" }, "Layout"),
            segmented(
              "Layout",
              [
                ["side", "Side by side"],
                ["stack", "Stacked"],
                ["flip", "Flip"],
              ],
              lay,
              (v) => go(route, { lay: v }),
            ),
          )
        : null,
      toggle,
      note,
      h("span", { class: "grow" }),
      h("span", { class: "dim" }, idx + 1 + " of " + c.stories.length),
      nav("prev", prev, "← Previous"),
      nav("next", next, "Next →"),
    ),
    have.length
      ? [
          wrap,
          flipping
            ? h(
                "p",
                { class: "dim" },
                "Hold the picture, or press f, to see the other harness in the same place.",
              )
            : null,
        ]
      : null,
    gone,
  ];
}
let currentFlip = null;

// ---- shell -------------------------------------------------------------------------------

const app = document.getElementById("app");
const q = h("input", {
  id: "q",
  type: "search",
  placeholder: "Filter",
  autocomplete: "off",
  spellcheck: "false",
  "aria-label": "Filter components and stories",
});
const nav = h("nav", { id: "nav", "aria-label": "Components" });
const crumbs = h("nav", { class: "crumbs", "aria-label": "Breadcrumb" });
const harnessSlot = h("div", { class: "ctl" });
const main = h("main", { id: "main", tabindex: "-1" });
const menu = h(
  "button",
  { type: "button", id: "menu", class: "btn", "aria-controls": "side", "aria-expanded": "false" },
  "Menu",
);
const side = h(
  "aside",
  { id: "side", "aria-label": "Navigation" },
  h("div", { class: "brand" }, SITE),
  h("div", { class: "search" }, q, h("kbd", null, "/")),
  nav,
  h(
    "div",
    { class: "keys" },
    markKey(),
    h(
      "p",
      null,
      h("kbd", null, "/"),
      " filter  ",
      h("kbd", null, "←"),
      h("kbd", null, "→"),
      " or ",
      h("kbd", null, "k"),
      h("kbd", null, "j"),
      " previous and next story  ",
      h("kbd", null, "f"),
      " flip  ",
      h("kbd", null, "1"),
      h("kbd", null, "2"),
      h("kbd", null, "3"),
      " both, pi, Claude Code",
    ),
  ),
);
const skip = h("a", { class: "skip", href: "#", on: {} }, "Skip to content");
skip.addEventListener("click", (e) => {
  e.preventDefault();
  main.focus();
});
app.append(
  skip,
  h(
    "div",
    { class: "app" },
    side,
    h(
      "div",
      { class: "content" },
      h("header", { class: "topbar" }, menu, crumbs, harnessSlot),
      main,
    ),
  ),
  h("div", { id: "scrim", on: { click: () => setNav(false) } }),
);

function setNav(open) {
  document.body.classList.toggle("nav-open", open);
  menu.setAttribute("aria-expanded", String(open));
}
menu.addEventListener("click", () => setNav(!document.body.classList.contains("nav-open")));

// Sidebar: built once; route changes only move aria-current and the open component.
const ul = h("ul");
const home = h("a", { href: "#/", class: "comp" }, "Overview");
ul.append(h("li", null, home));
const compItems = data.components.map((c) => {
  const comp = h(
    "a",
    { class: "comp" },
    h("span", { class: "name" }, c.name),
    marks(HARNESSES.map((k) => mark(k, implState(c, k), implText[implState(c, k)]))),
  );
  const stories = c.stories.map((s) => {
    const a = h(
      "a",
      null,
      h("span", { class: "name" }, s.state),
      marks(
        HARNESSES.map((k) => {
          const st = renderState(c, s, k);
          return mark(k, st, MARK_TEXT[st]);
        }),
      ),
    );
    return { s, a, li: h("li", null, a), text: s.state.toLowerCase() };
  });
  const list = h(
    "ul",
    { class: "stories" },
    stories.map((x) => x.li),
  );
  const li = h("li", null, comp, list);
  return { c, comp, stories, list, li };
});
ul.append(...compItems.map((x) => x.li));
nav.append(ul, h("p", { class: "nomatch dim", hidden: true }, "No match."));

let current = { view: "home" };
let firstHit = null;
function syncSide(route) {
  current = route;
  home.href = hashFor({ view: "home" });
  home.setAttribute("aria-current", route.view === "home" ? "page" : "false");
  const term = q.value.trim().toLowerCase();
  let any = false;
  firstHit = null;
  for (const it of compItems) {
    it.comp.href = to(compRoute(it.c, "stories"));
    const here = route.c === it.c;
    it.comp.removeAttribute("aria-current");
    if (here) it.comp.setAttribute("aria-current", route.view === "story" ? "true" : "page");
    const nameHit = !term || (it.c.name + " " + it.c.id).toLowerCase().includes(term);
    let n = 0;
    for (const st of it.stories) {
      st.a.href = to(storyRoute(it.c, st.s));
      if (here && route.story === st.s) st.a.setAttribute("aria-current", "page");
      else st.a.removeAttribute("aria-current");
      const hit = !term || nameHit || st.text.includes(term);
      st.li.hidden = !hit;
      if (hit) {
        n++;
        if (!nameHit && !firstHit) firstHit = st.a.href;
      }
    }
    const showComp = nameHit || n > 0;
    it.li.hidden = !showComp;
    it.list.hidden = !(term ? showComp : here);
    if (showComp) any = true;
    if (nameHit && term && !firstHit) firstHit = it.comp.href;
  }
  nav.querySelector(".nomatch").hidden = any;
}
q.addEventListener("input", () => syncSide(current));
q.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && firstHit) {
    location.hash = new URL(firstHit).hash;
    q.blur();
    setNav(false);
  }
});

function harnessControl() {
  harnessSlot.replaceChildren(
    h("span", { class: "label" }, "Show"),
    segmented(
      "Harness",
      [
        ["both", "Both", "Both harnesses (1)"],
        ["pi", "pi", "pi only (2)"],
        ["claude", "Claude Code", "Claude Code only (3)"],
      ],
      prefs.h,
      (v) => go(current, { h: v }),
    ),
  );
}

function breadcrumbs(route) {
  const sep = () => h("span", { class: "sep", "aria-hidden": "true" }, "/");
  const parts = [];
  if (route.view === "home") parts.push(h("span", { "aria-current": "page" }, SITE));
  else {
    parts.push(h("a", { href: hashFor({ view: "home" }) }, SITE), sep());
    if (route.view === "component")
      parts.push(
        h("span", { "aria-current": "page" }, route.c.name),
        sep(),
        TABS.find(([t]) => t === route.tab)[1],
      );
    else
      parts.push(
        h("a", { href: to(compRoute(route.c, "stories")) }, route.c.name),
        sep(),
        h("span", { "aria-current": "page" }, route.story.state),
      );
  }
  crumbs.replaceChildren(...parts);
}

let lastPath = null;
function render() {
  const route = parse();
  const canon = hashFor(route);
  if ((location.hash || "#/") !== canon) history.replaceState(null, "", canon);
  document.body.dataset.show = prefs.h;
  const path = canon.split("?")[0];
  const focusKey = document.activeElement && document.activeElement.dataset.fk;
  const wasInShell =
    side.contains(document.activeElement) || harnessSlot.contains(document.activeElement);

  zoomers = [];
  current = route;
  const view = { home: homeView, component: componentView, story: storyView }[route.view](route);
  main.replaceChildren(...[view].flat(Infinity).filter(Boolean));
  harnessControl();
  breadcrumbs(route);
  syncSide(route);
  setNav(false);
  zoomers.forEach((f) => f());
  document.title =
    (route.view === "story" ? route.story.id : route.view === "component" ? route.c.name : "") +
    (route.view === "home" ? "" : " · ") +
    SITE;

  const changed = path !== lastPath;
  lastPath = path;
  if (changed) window.scrollTo(0, 0);
  const again = focusKey && main.querySelector('[data-fk="' + CSS.escape(focusKey) + '"]');
  if (again) again.focus({ preventScroll: true });
  else if (changed && !wasInShell) {
    const h1 = main.querySelector("h1");
    if (h1) h1.focus({ preventScroll: true });
  }
}
window.addEventListener("hashchange", render);

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  const typing =
    t instanceof HTMLElement && t.matches("input, textarea, select, [contenteditable]");
  if (e.key === "Escape") {
    if (document.activeElement === q) {
      if (q.value) {
        q.value = "";
        syncSide(current);
      } else q.blur();
    }
    setNav(false);
    return;
  }
  if (typing) return;
  if (e.key === "/") {
    e.preventDefault();
    setNav(true);
    q.focus();
    q.select();
    return;
  }
  const filter = { 1: "both", 2: "pi", 3: "claude" }[e.key];
  if (filter) {
    e.preventDefault();
    go(current, { h: filter });
    return;
  }
  if (current.view !== "story") return;
  if (e.key === "f" && currentFlip) {
    e.preventDefault();
    currentFlip();
    return;
  }
  const { c, story } = current;
  const i = c.stories.indexOf(story);
  const prev = e.key === "ArrowLeft" || e.key === "k";
  const next = e.key === "ArrowRight" || e.key === "j";
  const target = prev ? c.stories[i - 1] : next ? c.stories[i + 1] : null;
  if (target) {
    e.preventDefault();
    go(storyRoute(c, target));
  }
});

render();
