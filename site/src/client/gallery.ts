/**
 * A plugin's gallery: one item on the stage, the thumbnails choosing it, the harness switch
 * narrowing both to one harness, and a picture at its actual size in a dialog. The harness is
 * remembered (`agents-h`, shared with the catalogue's switch).
 */
import { readHarness, writeHarness } from "./prefs.ts";

for (const g of document.querySelectorAll<HTMLElement>("[data-gallery]")) gallery(g);

function gallery(root: HTMLElement): void {
  root.classList.add("js");
  for (const el of root.querySelectorAll<HTMLElement>("[data-js]")) el.hidden = false;
  const items = [...root.querySelectorAll<HTMLElement>(".g-item")];
  const thumbs = [...root.querySelectorAll<HTMLButtonElement>("[data-show]")];
  const switches = [...root.querySelectorAll<HTMLButtonElement>("[data-set-h]")];
  const has = new Set(items.map((i) => i.dataset.h));
  const pref = readHarness();
  let h = pref && has.has(pref) ? pref : (root.dataset.default ?? "claude");
  let current = -1;

  const shown = () => items.filter((i) => switches.length === 0 || i.dataset.h === h);

  function show(i: number): void {
    if (i === current) return;
    const old = items[current];
    old?.querySelector("video")?.pause();
    current = i;
    for (const [n, it] of items.entries()) it.hidden = n !== i;
    for (const t of thumbs) t.setAttribute("aria-pressed", String(Number(t.dataset.show) === i));
  }

  function setHarness(next: string): void {
    h = next;
    for (const b of switches) b.setAttribute("aria-pressed", String(b.dataset.setH === h));
    for (const t of thumbs)
      t.closest("li")!.hidden = switches.length > 0 && t.closest("li")!.dataset.h !== h;
    const first = shown()[0];
    current = -1;
    if (first) show(items.indexOf(first));
  }

  for (const t of thumbs) t.addEventListener("click", () => show(Number(t.dataset.show)));
  for (const b of switches)
    b.addEventListener("click", () => {
      setHarness(b.dataset.setH!);
      writeHarness(h);
    });
  setHarness(h);

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

  // ---- actual size ------------------------------------------------------------------------
  const dialog = root.querySelector<HTMLDialogElement>("dialog.lightbox")!;
  const big = dialog.querySelector("img")!;
  const pictures = () => shown().filter((i) => i.querySelector(".plate.zoom img"));
  function open(item: HTMLElement): void {
    const img = item.querySelector<HTMLImageElement>(".plate img")!;
    big.src = img.currentSrc || img.src;
    // The picture's own pixels: the point of this view.
    big.width = Number(img.getAttribute("width"));
    big.height = Number(img.getAttribute("height"));
    big.alt = img.alt;
    dialog.querySelector(".lb-cap")!.textContent = img.alt;
    const list = pictures();
    dialog.querySelector(".lb-pos")!.textContent =
      list.length > 1 ? `${list.indexOf(item) + 1} of ${list.length}` : "";
    for (const b of dialog.querySelectorAll<HTMLButtonElement>("[data-lb=prev], [data-lb=next]"))
      b.hidden = list.length < 2;
    show(items.indexOf(item));
    if (!dialog.open) dialog.showModal();
  }
  function lbStep(d: number): void {
    const list = pictures();
    const at = list.indexOf(items[current]!);
    const next = list[(at + d + list.length) % list.length];
    if (next) open(next);
  }
  for (const it of items) {
    const img = it.querySelector<HTMLImageElement>(".plate.zoom img");
    img?.addEventListener("click", () => open(it));
  }
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-zoom]"))
    b.addEventListener("click", () => open(items[Number(b.dataset.zoom)]!));
  dialog.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("[data-lb]");
    if (b?.dataset.lb === "close") dialog.close();
    else if (b?.dataset.lb === "prev") lbStep(-1);
    else if (b?.dataset.lb === "next") lbStep(1);
    else if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") lbStep(-1);
    else if (e.key === "ArrowRight") lbStep(1);
  });
}
