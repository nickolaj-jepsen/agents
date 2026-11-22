/**
 * A plugin's gallery: one item on the stage, the thumbnails choosing it, the harness switch
 * narrowing both to one harness, and within Claude Code the surface switch to its terminal or its
 * VS Code pictures.
 */
import { readHarness, readSurface, writeHarness, writeSurface } from "./prefs.ts";

for (const g of document.querySelectorAll<HTMLElement>("[data-gallery]")) gallery(g);

function gallery(root: HTMLElement): void {
  root.classList.add("js");
  for (const el of root.querySelectorAll<HTMLElement>("[data-js]")) el.hidden = false;
  for (const v of root.querySelectorAll<HTMLVideoElement>("video")) controls(v);
  const items = [...root.querySelectorAll<HTMLElement>(".g-item")];
  const thumbs = [...root.querySelectorAll<HTMLButtonElement>("[data-show]")];
  const switches = [...root.querySelectorAll<HTMLButtonElement>("[data-set-h]")];
  const surfaces = [...root.querySelectorAll<HTMLButtonElement>("[data-set-s]")];
  const surfaceBar = root.querySelector<HTMLElement>("[data-surfaces]");
  const has = new Set(items.map((i) => i.dataset.h));
  const pref = readHarness();
  let h = pref && has.has(pref) ? pref : (root.dataset.default ?? "claude");
  // The terminal first, as the demo is, unless the visitor chose VS Code before.
  let s = (surfaces.length > 0 && readSurface()) || "terminal";
  let current = -1;

  // The surface narrows Claude Code's items only; pi's are all its terminal's.
  const isShown = (i: HTMLElement) =>
    (switches.length === 0 || i.dataset.h === h) &&
    (surfaces.length === 0 || i.dataset.h !== "claude" || i.dataset.s === s);
  const shown = () => items.filter(isShown);

  function show(i: number): void {
    if (i === current) return;
    const old = items[current];
    // A hidden video is paused by the page's own observer (site.ts), so autoplay carries on when it
    // is shown again; with reduced motion nothing else would pause it.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches)
      old?.querySelector("video")?.pause();
    current = i;
    for (const [n, it] of items.entries()) it.hidden = n !== i;
    for (const t of thumbs) t.setAttribute("aria-pressed", String(Number(t.dataset.show) === i));
  }

  /** Narrows the stage and the thumbnails to the harness and surface chosen, and shows the first. */
  function narrow(): void {
    for (const b of switches) b.setAttribute("aria-pressed", String(b.dataset.setH === h));
    for (const b of surfaces) b.setAttribute("aria-pressed", String(b.dataset.setS === s));
    // A choice within Claude Code: gone while pi is shown.
    if (surfaceBar) surfaceBar.hidden = h !== "claude";
    for (const t of thumbs) t.closest("li")!.hidden = !isShown(items[Number(t.dataset.show)]!);
    const first = shown()[0];
    current = -1;
    if (first) show(items.indexOf(first));
  }

  for (const t of thumbs) t.addEventListener("click", () => show(Number(t.dataset.show)));
  for (const b of switches)
    b.addEventListener("click", () => {
      h = b.dataset.setH!;
      writeHarness(h);
      narrow();
    });
  for (const b of surfaces)
    b.addEventListener("click", () => {
      s = b.dataset.setS!;
      writeSurface(s);
      narrow();
    });
  narrow();

  // Swipe on the stage steps through what is shown.
  let x0: number | null = null;
  const stage = root.querySelector<HTMLElement>(".g-stage")!;
  stage.addEventListener("touchstart", (e) => (x0 = e.touches[0]?.clientX ?? null), {
    passive: true,
  });
  stage.addEventListener("touchend", (e) => {
    const x1 = e.changedTouches[0]?.clientX;
    if (x0 === null || x1 === undefined || Math.abs(x1 - x0) < 48) return;
    step(x1 < x0 ? 1 : -1);
    x0 = null;
  });
  function step(d: number): void {
    const list = shown();
    const at = list.indexOf(items[current]!);
    const next = list[(at + d + list.length) % list.length];
    if (next) show(items.indexOf(next));
  }
}

function clock(t: number): string {
  return Number.isFinite(t)
    ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`
    : "0:00";
}

/** Swaps the browser's controls for the site's: play or pause, the time and a seek slider. */
function controls(v: HTMLVideoElement): void {
  const frame = v.parentElement;
  if (!frame) return;
  v.removeAttribute("controls");
  v.controls = false;
  v.preload = "metadata";

  const bar = document.createElement("div");
  bar.className = "vc";
  const play = document.createElement("button");
  play.type = "button";
  const time = document.createElement("span");
  time.className = "vc-time";
  time.setAttribute("aria-hidden", "true");
  const seek = document.createElement("input");
  seek.type = "range";
  seek.className = "vc-seek";
  seek.min = "0";
  seek.max = "1000";
  seek.step = "10";
  seek.value = "0";
  seek.disabled = true;
  seek.setAttribute("aria-label", "Seek");
  bar.append(play, time, seek);
  frame.append(bar);

  const sync = (): void => {
    const d = v.duration;
    const ready = Number.isFinite(d) && d > 0;
    seek.disabled = !ready;
    const f = ready ? v.currentTime / d : 0;
    if (document.activeElement !== seek || !seeking) seek.value = String(Math.round(f * 1000));
    seek.style.setProperty("--p", `${f * 100}%`);
    seek.setAttribute("aria-valuetext", `${clock(v.currentTime)} of ${clock(d)}`);
    time.textContent = `${clock(v.currentTime)} / ${clock(d)}`;
    play.textContent = v.paused ? "play" : "pause";
    play.setAttribute("aria-label", `${v.paused ? "Play" : "Pause"} the demo`);
    if (v.paused) bar.dataset.paused = "";
    else delete bar.dataset.paused;
  };
  let seeking = false;
  const toggle = (): void => void (v.paused ? v.play().catch(() => {}) : v.pause());
  play.addEventListener("click", toggle);
  v.addEventListener("click", toggle);
  seek.addEventListener("input", () => {
    seeking = true;
    if (Number.isFinite(v.duration)) v.currentTime = (Number(seek.value) / 1000) * v.duration;
    sync();
  });
  seek.addEventListener("change", () => (seeking = false));
  for (const e of ["timeupdate", "play", "pause", "loadedmetadata", "durationchange", "seeked"])
    v.addEventListener(e, sync);
  sync();
}
