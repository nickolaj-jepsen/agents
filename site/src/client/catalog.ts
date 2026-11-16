/**
 * The developer pages' controls. Every page is complete without them (both harnesses, the
 * narrowest size, side by side); this adds the harness switch, the size and layout switches, the
 * sidebar filter. A choice lives in the URL's query (`h`, `size`, `lay`), so a link shows what it
 * says; the harness is remembered across the site, the size and layout for the next page. The
 * layout arranges everything on the page that has two harnesses: each story's renders and the
 * props columns. The one key is `f`, which switches between the harnesses: Claude Code and pi.
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
  lay: oneOf(q.get("lay") ?? store.get("lay"), ["side", "stack"] as const) ?? "side",
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
  history.replaceState(null, "", u);
}

// ---- harness ---------------------------------------------------------------------------

function applyHarness(): void {
  document.documentElement.dataset.kitH = state.h;
  press("[data-set-h]", "data-set-h", state.h);
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

// ---- layout, actual size ------------------------------------------------------------

function applyLayout(): void {
  // The layout buttons are the switch's "both": pressed only while both harnesses are shown.
  for (const b of $$<HTMLButtonElement>("[data-set-lay]"))
    b.setAttribute("aria-pressed", String(state.h === "both" && b.dataset.setLay === state.lay));
  document.querySelector("[data-actual]")?.setAttribute("aria-pressed", String(state.actual));
  // With one harness chosen there is nothing to arrange.
  const lay = state.h === "both" ? state.lay : "side";
  for (const stage of stages) {
    stage.dataset.lay = lay;
    stage.classList.toggle("actual", state.actual);
  }
  // The props columns follow too: a harness with no props has its "planned" or "not possible" note.
  for (const cols of propCols) cols.dataset.lay = lay;
  store.set("lay", state.lay === "side" ? null : state.lay);
}

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
  } else if (b.dataset.setLay) {
    state.lay = b.dataset.setLay as typeof state.lay;
    state.h = "both";
    writeHarness(null);
  } else if (b.hasAttribute("data-actual")) state.actual = !state.actual;
  else return;
  apply();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "f" || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.target as HTMLElement).matches("input, textarea, select, [contenteditable]")) return;
  // Claude Code, then pi, then back; from both, Claude Code.
  state.h = state.h === "claude" ? "pi" : "claude";
  writeHarness(state.h);
  apply();
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
