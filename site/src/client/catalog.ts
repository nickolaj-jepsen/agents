/**
 * The developer pages' controls. Every page is complete without them (both harnesses, the
 * narrowest size); this adds the harness and size switches, and puts a story's text beside its
 * renders where they leave room. A choice lives in the URL's query (`h`, `size`), so a link shows
 * what it says; the harness is remembered across the site, the size for the next page. The one key
 * is `f`, which switches between the harnesses: Claude Code and pi.
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
  u.searchParams.delete("lay");
  history.replaceState(null, "", u);
}

/** The harnesses on screen. */
const shownHarnesses = (): string[] => (state.h === "both" ? ["claude", "pi"] : [state.h]);
const TITLE: Record<string, string> = { claude: "Claude Code", pi: "pi" };
const label = (key: string) => key.replace("x", "×");
const width = (key: string) => Number(key.split("x")[0]);

// ---- harness ---------------------------------------------------------------------------

function applyHarness(): void {
  document.documentElement.dataset.kitH = state.h;
  press("[data-set-h]", "data-set-h", state.h);
}

// ---- size -------------------------------------------------------------------------------

const sizeButtons = $$<HTMLButtonElement>("[data-set-size]");

function applySize(): void {
  if (!sizeButtons.length) return;
  // A size none of the harnesses on screen was drawn at can't be chosen.
  const on = shownHarnesses();
  for (const b of sizeButtons) {
    b.disabled = !(b.dataset.has ?? "").split(" ").some((h) => on.includes(h));
    b.title = b.disabled
      ? `No render at ${label(b.dataset.setSize!)} for ${on.map((h) => TITLE[h]).join(" or ")}`
      : "";
  }
  const keys = sizeButtons.filter((b) => !b.disabled).map((b) => b.dataset.setSize!);
  if (!keys.length) return;
  const w = state.size ? width(state.size) : 0;
  // The wanted size if it can be chosen, else the one nearest by width.
  const size =
    state.size && keys.includes(state.size)
      ? state.size
      : keys.reduce((a, b) => (Math.abs(width(b) - w) < Math.abs(width(a) - w) ? b : a));
  press("[data-set-size]", "data-set-size", size);
  const sw = width(size);
  const near = new Set<string>();
  for (const cell of $$(".cell")) {
    const views = $$(".view", cell);
    if (!views.length) continue;
    const shown =
      views.find((v) => v.dataset.size === size) ??
      views.reduce((a, b) => (Math.abs(+b.dataset.w! - sw) < Math.abs(+a.dataset.w! - sw) ? b : a));
    for (const v of views) v.hidden = v !== shown;
    cell.style.setProperty("--nat", `${shown.dataset.px}px`);
    const exact = shown.dataset.size === size;
    const tag = cell.querySelector<HTMLElement>("[data-sz]");
    if (tag) {
      tag.textContent = label(shown.dataset.size!);
      tag.classList.toggle("off", !exact);
      tag.title = exact ? "" : `No render at ${label(size)}; this is the nearest`;
    }
    if (!exact && on.includes(cell.dataset.h!)) near.add(cell.dataset.h!);
  }
  // One note for the page, not one per render.
  const note = document.querySelector<HTMLElement>("[data-size-note]");
  if (note) {
    note.hidden = near.size === 0;
    note.textContent = near.size
      ? `No ${label(size)} for ${[...near].map((h) => TITLE[h]).join(", ")}: the nearest is shown`
      : "";
  }
}

// ---- the story's text beside its renders ------------------------------------------------

// The renders stand one above the other, each at its own size. Where the widest leaves room, the
// story's line, its features and any harness without a render take the room beside them.
const FRAME = 2 * 8 + 2; // a render's padding and border
const TEXT_ROOM = 18 * 16 + 4 * 8; // the text's 18rem column and the gap before it
function fit(): void {
  const on = shownHarnesses();
  for (const stage of stages) {
    const cells = $$(".cell", stage).filter((c) => on.includes(c.dataset.h!));
    const widest = Math.max(
      0,
      ...cells.map((c) => parseFloat(c.style.getPropertyValue("--nat")) + FRAME),
    );
    stage.toggleAttribute(
      "data-beside",
      cells.length > 0 && widest + TEXT_ROOM <= stage.clientWidth,
    );
  }
}

// ---- controls ---------------------------------------------------------------------------

function apply(): void {
  applyHarness();
  applySize();
  fit();
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
  } else return;
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

// ---- sidebar: the story in view ----------------------------------------------------------

// The current component's stories (and its props) are its sidebar links. The one marked is the last
// whose heading is above a line a third of the way down the screen under the bar, so the mark
// follows what fills the screen, not what has just left it; at the page's end, the last.
const spyLinks = new Map(
  $$<HTMLAnchorElement>(".cat-list > li.here .stories a").map((a) => [a.hash.slice(1), a] as const),
);
const spyTargets = [...spyLinks.keys()]
  .map((id) => document.getElementById(id))
  .filter((el): el is HTMLElement => el !== null);
if (spyTargets.length) {
  let queued = false;
  const update = (): void => {
    queued = false;
    const top = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
    const line = top + (innerHeight - top) / 3;
    let here: string | null = null;
    for (const t of spyTargets) if (t.getBoundingClientRect().top <= line) here = t.id;
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2)
      here = spyTargets[spyTargets.length - 1]!.id;
    for (const [id, a] of spyLinks)
      if (id === here) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
  };
  const queue = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  update();
}

// The column's width decides what fits.
if (stages.length) {
  let queued = false;
  new ResizeObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fit();
    });
  }).observe(stages[0]!.parentElement!);
}

apply();
