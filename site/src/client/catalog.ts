/**
 * The catalogue pages' controls. Every page is complete without them (both harnesses, the
 * narrowest size, side by side); this adds the harness switch, the size and layout switches, the
 * flip, "only differences", the sidebar filter and the keys. A choice lives in the URL's query
 * (`h`, `size`, `lay`, `diff`), so a link shows what it says, and the last harness, size and layout
 * are remembered for the next page.
 */

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
  h: oneOf(q.get("h") ?? store.get("h"), ["both", "pi", "claude"] as const) ?? "both",
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

function syncUrl(): void {
  const u = new URL(location.href);
  const set = (k: string, v: string | null) =>
    v ? u.searchParams.set(k, v) : u.searchParams.delete(k);
  set("h", state.h === "both" ? null : state.h);
  set("size", $$("[data-sizes]").length && state.size ? state.size : null);
  set("lay", stage && state.lay !== "side" ? state.lay : null);
  set("diff", state.diff ? "1" : null);
  history.replaceState(null, "", u);
}

// ---- harness ---------------------------------------------------------------------------

function applyHarness(): void {
  document.documentElement.dataset.kitH = state.h;
  press("[data-set-h]", "data-set-h", state.h);
  store.set("h", state.h === "both" ? null : state.h);
}

// ---- size -------------------------------------------------------------------------------

const sizes = $$<HTMLButtonElement>("[data-set-size]").map((b) => b.dataset.setSize!);
const sizeKeys = [...new Set(sizes)];

function applySize(): void {
  if (!sizeKeys.length) return;
  const want = state.size && sizeKeys.includes(state.size) ? state.size : null;
  // The wanted size if the page has it, else the one nearest by width.
  const w = state.size ? Number(state.size.split("x")[0]) : 0;
  const size =
    want ??
    sizeKeys.reduce((a, b) =>
      Math.abs(+b.split("x")[0]! - w) < Math.abs(+a.split("x")[0]! - w) ? b : a,
    );
  press("[data-set-size]", "data-set-size", size);
  const sw = Number(size.split("x")[0]);
  for (const cell of $$(".cell")) {
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
  clipCheck();
}

// ---- layout, flip, actual size (the story page) -----------------------------------------

const stage = document.querySelector<HTMLElement>(".story-stage");
let flipShown: string | null = null;

function cellsWithRenders(): HTMLElement[] {
  return stage ? $$(".cell", stage).filter((c) => $$(".view", c).length > 0) : [];
}

/** The layout in effect: one picture is always side by side, alone. */
const layout = () => (state.h === "both" && cellsWithRenders().length > 1 ? state.lay : "side");

function setFlip(h: string | null): void {
  if (!stage) return;
  if (h) flipShown = h;
  for (const c of $$(".cell", stage))
    c.classList.toggle("flip-off", layout() === "flip" && c.dataset.h !== h);
}

function flipOther(): void {
  const cells = cellsWithRenders();
  if (layout() !== "flip" || cells.length < 2) return;
  const other = cells.find((c) => c.dataset.h !== flipShown);
  if (other) setFlip(other.dataset.h!);
}

function applyLayout(): void {
  if (!stage) return;
  const lay = layout();
  stage.dataset.lay = lay;
  press("[data-set-lay]", "data-set-lay", state.lay);
  stage.classList.toggle("actual", state.actual);
  const actual = document.querySelector("[data-actual]");
  actual?.setAttribute("aria-pressed", String(state.actual));
  const hint = stage.querySelector<HTMLElement>(".flip-hint");
  if (hint) hint.hidden = lay !== "flip";
  if (lay === "flip") setFlip(flipShown ?? cellsWithRenders()[0]?.dataset.h ?? null);
  else setFlip(null);
  store.set("lay", state.lay === "side" ? null : state.lay);
}

if (stage) {
  // Holding the picture shows the other harness until it is let go.
  let held: string | null = null;
  stage.addEventListener("pointerdown", (e) => {
    if (layout() !== "flip" || e.button !== 0 || !(e.target as Element).closest(".view")) return;
    held = flipShown;
    flipOther();
  });
  const release = () => {
    if (held) setFlip(held);
    held = null;
  };
  for (const ev of ["pointerup", "pointerleave", "pointercancel"])
    stage.addEventListener(ev, release);
}

// ---- overview rows: mark a render cut short ------------------------------------------------

function clipCheck(): void {
  for (const v of $$(".pair.clip .view")) {
    if (v.hidden) continue;
    v.classList.toggle("clipped", v.scrollHeight > v.clientHeight + 1);
  }
}
for (const img of $$<HTMLImageElement>(".pair.clip img")) img.addEventListener("load", clipCheck);
addEventListener("resize", clipCheck);

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
  if (b.dataset.setH) state.h = b.dataset.setH as typeof state.h;
  else if (b.dataset.setSize) {
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
  if (e.key === "Escape") {
    if (filter.value) {
      filter.value = "";
      applyFilter();
    } else filter.blur();
  }
});

// ---- keys -------------------------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target as HTMLElement;
  if (t.matches("input, textarea, select, [contenteditable]")) return;
  if (e.key === "/" && filter) {
    e.preventDefault();
    filter.focus();
    filter.select();
    return;
  }
  const h = ({ 1: "both", 2: "pi", 3: "claude" } as const)[e.key as "1" | "2" | "3"];
  if (h) {
    state.h = h;
    apply();
    return;
  }
  if (!stage) return;
  if (e.key === "f" && layout() === "flip") {
    flipOther();
    return;
  }
  const dir =
    e.key === "ArrowLeft" || e.key === "k"
      ? "prev"
      : e.key === "ArrowRight" || e.key === "j"
        ? "next"
        : null;
  const link = dir && document.querySelector<HTMLAnchorElement>(`[data-key="${dir}"]`);
  if (link) {
    e.preventDefault();
    location.href = link.href;
  }
});

apply();
