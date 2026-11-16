/**
 * The developer pages' controls. Every page is complete without them (both harnesses, the
 * narrowest size, side by side); this adds the harness switch, the size and layout switches, the
 * flip and the sidebar filter. A choice lives in the URL's query (`h`, `size`, `lay`, `flip`), so a
 * link shows what it says; the harness is remembered across the site, the size and layout for the
 * next page. Layout and flip arrange everything on the page that has two harnesses: each story's
 * renders and the props columns. The one key is `f`, which flips them all in flip layout.
 */
import { readHarness, writeHarness } from "./prefs.ts";

const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(`kit-${k}`);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null): void {
    try {
      if (v) localStorage.setItem(`kit-${k}`, v);
      else localStorage.removeItem(`kit-${k}`);
    } catch {}
  },
};

const q = new URLSearchParams(location.search);
const oneOf = <T extends string>(v: string | null, ok: readonly T[]): T | null =>
  v && (ok as readonly string[]).includes(v) ? (v as T) : null;
const state = {
  h: oneOf(q.get("h"), ["both", "pi", "claude"] as const) ?? readHarness() ?? "both",
  size: /^\d+x\d+$/.test(q.get("size") ?? "") ? q.get("size")! : store.get("size"),
  lay: oneOf(q.get("lay") ?? store.get("lay"), ["side", "stack", "flip"] as const) ?? "side",
  /** The harness a flipped page shows, all of it at once. */
  flip: (oneOf(q.get("flip"), ["claude", "pi"] as const) ?? "claude") as "claude" | "pi",
  actual: false,
};

const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  [...root.querySelectorAll<T & Element>(sel)] as T[];

for (const el of $$("[data-js]")) el.hidden = false;

function press(sel: string, attr: string, value: string): void {
  for (const b of $$<HTMLButtonElement>(sel))
    b.setAttribute("aria-pressed", String(b.getAttribute(attr) === value));
}

const stages = $$(".story-stage");
const propCols = $$(".api-cols");

function syncUrl(): void {
  const u = new URL(location.href);
  const set = (k: string, v: string | null) =>
    v ? u.searchParams.set(k, v) : u.searchParams.delete(k);
  const arranged = stages.length > 0 || propCols.length > 0;
  set("h", state.h === "both" ? null : state.h);
  set("size", $$("[data-sizes]").length && state.size ? state.size : null);
  set("lay", arranged && state.lay !== "side" ? state.lay : null);
  set("flip", arranged && state.lay === "flip" && state.flip !== "claude" ? state.flip : null);
  history.replaceState(null, "", u);
}

// ---- harness ---------------------------------------------------------------------------

function applyHarness(): void {
  document.documentElement.dataset.kitH = state.h;
  press("[data-set-h]", "data-set-h", state.h);
  // Layout means two harnesses side by side: with one, it has nothing to arrange.
  for (const el of $$("[data-both]")) el.hidden = state.h !== "both";
}

// ---- size -------------------------------------------------------------------------------

const sizeKeys = [
  ...new Set($$<HTMLButtonElement>("[data-set-size]").map((b) => b.dataset.setSize!)),
];

function applySize(): void {
  const all = $$(".cell");
  if (!all.length) return;
  const w = state.size ? Number(state.size.split("x")[0]) : 0;
  // The wanted size if the page has it, else the one nearest by width.
  const size =
    (state.size && sizeKeys.includes(state.size) ? state.size : null) ??
    (sizeKeys.length
      ? sizeKeys.reduce((a, b) =>
          Math.abs(+b.split("x")[0]! - w) < Math.abs(+a.split("x")[0]! - w) ? b : a,
        )
      : null);
  if (!size) return;
  press("[data-set-size]", "data-set-size", size);
  const sw = Number(size.split("x")[0]);
  for (const cell of all) {
    const views = $$(".view", cell);
    if (!views.length) continue;
    const exact = views.find((v) => v.dataset.size === size);
    const shown =
      exact ??
      views.reduce((a, b) => (Math.abs(+b.dataset.w! - sw) < Math.abs(+a.dataset.w! - sw) ? b : a));
    for (const v of views) {
      v.hidden = v !== shown;
      const tag = v.querySelector<HTMLElement>("[data-near]");
      if (tag) tag.hidden = v.dataset.size === size;
    }
  }
}

// ---- layout, flip, actual size ------------------------------------------------------------

const TITLE = { claude: "Claude Code", pi: "pi" } as const;
const other = (h: "claude" | "pi") => (h === "claude" ? "pi" : "claude");

function applyLayout(): void {
  press("[data-set-lay]", "data-set-lay", state.lay);
  document.querySelector("[data-actual]")?.setAttribute("aria-pressed", String(state.actual));
  const flipping = state.h === "both" && state.lay === "flip";
  for (const b of $$("[data-flip]")) b.hidden = !flipping;
  for (const to of $$("[data-flip-to]")) to.textContent = `to ${TITLE[other(state.flip)]}`;
  // With one harness chosen there is nothing to arrange; with both, flip shows the same one in
  // every story, and a story the harness has no render of shows why.
  const lay = state.h === "both" ? state.lay : "side";
  for (const stage of stages) {
    stage.dataset.lay = lay;
    stage.classList.toggle("actual", state.actual);
    for (const c of $$(".cell", stage))
      c.classList.toggle("flip-off", lay === "flip" && c.dataset.h !== state.flip);
  }
  // The props columns follow too: a harness with no props has its "planned" or "not possible" note.
  for (const cols of propCols) {
    cols.dataset.lay = lay;
    for (const a of $$(".api", cols))
      a.classList.toggle("flip-off", lay === "flip" && a.dataset.h !== state.flip);
  }
  store.set("lay", state.lay === "side" ? null : state.lay);
}

/** Show the other harness, in every story and in the props. */
function flipAll(): void {
  if (state.h !== "both" || state.lay !== "flip") return;
  state.flip = other(state.flip);
  apply();
}

// A click on a picture flips too.
for (const stage of stages)
  stage.addEventListener("click", (e) => {
    if ((e.target as Element).closest(".view")) flipAll();
  });

// ---- controls ---------------------------------------------------------------------------

function apply(): void {
  applyHarness();
  applySize();
  applyLayout();
  syncUrl();
}

document.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>("button");
  if (!b) return;
  if (b.dataset.setH) {
    state.h = b.dataset.setH as typeof state.h;
    writeHarness(state.h);
  } else if (b.dataset.setSize) {
    state.size = b.dataset.setSize;
    store.set("size", state.size);
  } else if (b.dataset.setLay) state.lay = b.dataset.setLay as typeof state.lay;
  else if (b.hasAttribute("data-actual")) state.actual = !state.actual;
  else if (b.hasAttribute("data-flip")) state.flip = other(state.flip);
  else return;
  apply();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "f" || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.target as HTMLElement).matches("input, textarea, select, [contenteditable]")) return;
  flipAll();
});

// ---- sidebar filter ----------------------------------------------------------------------

const filter = document.querySelector<HTMLInputElement>("#cat-q");
const side = document.querySelector<HTMLElement>(".cat-side");
let firstHit: string | null = null;

function applyFilter(): void {
  if (!filter || !side) return;
  const term = filter.value.trim().toLowerCase();
  side.classList.toggle("filtering", term !== "");
  firstHit = null;
  let any = false;
  for (const li of $$(":scope > li[data-text]", side.querySelector(".cat-list")!)) {
    const nameHit = !term || li.dataset.text!.includes(term);
    let n = 0;
    for (const s of $$(":scope .stories > li", li)) {
      const hit = !term || nameHit || s.dataset.text!.includes(term);
      s.hidden = !hit;
      if (hit) {
        n++;
        if (term && !nameHit && !firstHit) firstHit = s.querySelector("a")!.href;
      }
    }
    li.hidden = !(nameHit || n > 0);
    if (!li.hidden) any = true;
    if (term && nameHit && !firstHit) firstHit = li.querySelector("a")!.href;
  }
  side.querySelector<HTMLElement>(".nomatch")!.hidden = any;
}
filter?.addEventListener("input", applyFilter);
filter?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && firstHit) location.href = firstHit;
});

apply();
