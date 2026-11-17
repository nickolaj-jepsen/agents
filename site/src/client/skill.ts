/**
 * A skill page: the SKILL.md folds to its first screen (whole without script), and the contents mark
 * the heading in view.
 */

const file = document.querySelector<HTMLElement>(".file.js");
const toggle = file?.querySelector<HTMLButtonElement>(".file-toggle");

function set(open: boolean): void {
  if (!file || !toggle) return;
  file.classList.toggle("collapsed", !open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.textContent = open ? "Show less" : `Read all of SKILL.md (${toggle.dataset.lines} lines)`;
}

const clip = file?.querySelector<HTMLElement>(".file-clip");
if (file && toggle && clip && clip.scrollHeight <= clip.clientHeight + 12 * 8) {
  file.classList.remove("collapsed");
  toggle.hidden = true;
} else if (file && toggle) {
  toggle.addEventListener("click", () => {
    const open = file.classList.contains("collapsed");
    set(open);
    // Closing: the frame's top goes back into view when it has scrolled above the screen.
    if (!open) {
      const top = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
      if (file.getBoundingClientRect().top < top) file.scrollIntoView({ block: "start" });
    }
  });

  const reveal = (id: string): void => {
    const t = id && document.getElementById(decodeURIComponent(id));
    if (t && file.contains(t)) set(true);
  };
  // A link to a heading opens the file first, so the browser finds the heading in place.
  document.addEventListener("click", (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    if (a) reveal(a.hash.slice(1));
  });
  addEventListener("hashchange", () => {
    reveal(location.hash.slice(1));
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  });
  if (location.hash) {
    reveal(location.hash.slice(1));
    document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }
}

// The contents: the last heading above a line a third of the way down under the masthead.
const links = new Map(
  [...document.querySelectorAll<HTMLAnchorElement>(".toc a")].map(
    (a) => [a.hash.slice(1), a] as const,
  ),
);
const targets = [...links.keys()]
  .map((id) => document.getElementById(id))
  .filter((el): el is HTMLElement => el !== null);
if (targets.length) {
  let queued = false;
  const update = (): void => {
    queued = false;
    const top = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop);
    const line = top + (innerHeight - top) / 3;
    let here: string | null = null;
    for (const t of targets)
      if (t.offsetParent !== null && t.getBoundingClientRect().top <= line) here = t.id;
    for (const [id, a] of links)
      if (id === here) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    // Keep the marked entry inside the rail's own scroll.
    const cur = links.get(here ?? "");
    const nav = cur?.closest<HTMLElement>(".toc");
    if (cur && nav && nav.scrollHeight > nav.clientHeight) {
      const r = cur.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      if (r.top < n.top || r.bottom > n.bottom) nav.scrollTop += r.top - n.top - n.height / 3;
    }
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
