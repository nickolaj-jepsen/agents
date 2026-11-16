/**
 * The developer pages' controls. Every page is complete without them (both harnesses, the
 * narrowest size, side by side); this adds the harness switch, the size and layout switches, the
 * flip, "only differences" and the sidebar filter. A choice lives in the URL's query (`h`, `size`,
 * `lay`, `diff`), so a link shows what it says; the harness is remembered across the site, the
 * size and layout for the next page. The one key is `f`, which flips the stories in flip layout.
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
  diff: q.get("diff") === "1",
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

function syncUrl(): void {
  const u = new URL(location.href);
  const set = (k: string, v: string | null) =>
    v ? u.searchParams.set(k, v) : u.searchParams.delete(k);
  set("h", state.h === "both" ? null : state.h);
  set("size", $$("[data-sizes]").length && state.size ? state.size : null);
  set("lay", stages.length && state.lay !== "side" ? state.lay : null);
  set("diff", state.diff ? "1" : null);
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

const flipShown = new WeakMap<HTMLElement, string>();
const rendered = (stage: HTMLElement) => $$(".cell", stage).filter((c) => $$(".view", c).length);

/** A story's layout: one picture is always alone. */
const layoutOf = (stage: HTMLElement) =>
  state.h === "both" && rendered(stage).length > 1 ? state.lay : "side";

function setFlip(stage: HTMLElement, h: string | null): void {
  if (h) flipShown.set(stage, h);
  for (const c of $$(".cell", stage))
    c.classList.toggle("flip-off", layoutOf(stage) === "flip" && c.dataset.h !== h);
}

function flipOther(stage: HTMLElement): void {
  const cells = rendered(stage);
  if (layoutOf(stage) !== "flip" || cells.length < 2) return;
  const other = cells.find((c) => c.dataset.h !== flipShown.get(stage));
  if (other) setFlip(stage, other.dataset.h!);
}

function applyLayout(): void {
  press("[data-set-lay]", "data-set-lay", state.lay);
  document.querySelector("[data-actual]")?.setAttribute("aria-pressed", String(state.actual));
  for (const stage of stages) {
    const lay = layoutOf(stage);
    stage.dataset.lay = lay;
    stage.classList.toggle("actual", state.actual);
    const btn = stage.querySelector<HTMLElement>("[data-flip]");
    if (btn) btn.hidden = lay !== "flip";
    setFlip(
      stage,
      lay === "flip" ? (flipShown.get(stage) ?? rendered(stage)[0]?.dataset.h ?? null) : null,
    );
  }
  store.set("lay", state.lay === "side" ? null : state.lay);
}

for (const stage of stages) {
  stage.querySelector("[data-flip]")?.addEventListener("click", () => flipOther(stage));
  // A click on the picture shows the other harness in the same place.
  stage.addEventListener("click", (e) => {
    if ((e.target as Element).closest(".view")) flipOther(stage);
  });
}

// ---- only differences --------------------------------------------------------------------

const diffBox = document.querySelector<HTMLInputElement>("[data-diff]");
function applyDiff(): void {
  if (diffBox) diffBox.checked = state.diff;
  document.querySelector("table.compat")?.classList.toggle("only-diff", state.diff);
}

// ---- controls ---------------------------------------------------------------------------

function apply(): void {
  applyHarness();
  applySize();
  applyLayout();
  applyDiff();
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
  else return;
  apply();
});
diffBox?.addEventListener("change", () => {
  state.diff = diffBox.checked;
  apply();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "f" || e.ctrlKey || e.metaKey || e.altKey) return;
  if ((e.target as HTMLElement).matches("input, textarea, select, [contenteditable]")) return;
  for (const stage of stages) flipOther(stage);
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
