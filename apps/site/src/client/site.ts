/**
 * What the pages do in the browser: copy buttons, install panels that close like menus, and a demo
 * video that plays while it is on screen.
 */

async function copy(button: HTMLButtonElement, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
  const label = button.textContent;
  button.textContent = "copied";
  button.dataset.done = "";
  setTimeout(() => {
    button.textContent = label;
    delete button.dataset.done;
  }, 1600);
}

function copyButton(text: () => string, name: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "copy";
  b.textContent = "copy";
  b.setAttribute("aria-label", name);
  b.addEventListener("click", () => void copy(b, text()));
  return b;
}

// Commands rendered with their own button (Command.astro) start hidden, for visitors without script.
for (const b of document.querySelectorAll<HTMLButtonElement>("button.copy[data-copy]")) {
  b.hidden = false;
  b.addEventListener("click", () => void copy(b, b.dataset.copy ?? ""));
}

// Shell listings in markdown bodies get one too.
for (const pre of document.querySelectorAll<HTMLPreElement>(
  '.prose pre[data-language="bash"], .prose pre[data-language="sh"], .prose pre[data-language="shell"]',
)) {
  const wrap = document.createElement("div");
  wrap.className = "listing";
  const head = document.createElement("div");
  head.className = "listing-head";
  const lang = document.createElement("span");
  lang.textContent = pre.dataset.language ?? "";
  pre.replaceWith(wrap);
  wrap.append(head, pre);
  head.append(
    lang,
    copyButton(
      () =>
        (pre.textContent ?? "")
          .split("\n")
          .map((line) => line.replace(/\s+#\s.*$/, ""))
          .join("\n")
          .trim(),
      "Copy the commands",
    ),
  );
}

// An open install panel closes on Escape, a click outside it, or another one opening.
const installs = [...document.querySelectorAll<HTMLDetailsElement>("details.inst")];
for (const d of installs)
  d.addEventListener("toggle", () => {
    if (d.open) for (const o of installs) if (o !== d) o.open = false;
  });
document.addEventListener("click", (e) => {
  for (const d of installs) if (d.open && !d.contains(e.target as Node)) d.open = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = installs.find((d) => d.open);
  if (!open) return;
  open.open = false;
  open.querySelector("summary")?.focus();
});

const calm = matchMedia("(prefers-reduced-motion: reduce)");
const videos = document.querySelectorAll<HTMLVideoElement>("video[data-autoplay]");
if (videos.length && "IntersectionObserver" in window) {
  // Pauses the observer made itself; any other pause or seek is the visitor's, and ends autoplay.
  const ours = new WeakSet<HTMLVideoElement>();
  const touched = new WeakSet<HTMLVideoElement>();
  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.target as HTMLVideoElement;
        if (calm.matches || touched.has(v)) continue;
        if (e.isIntersecting) void v.play().catch(() => {});
        else if (!v.paused) {
          ours.add(v);
          v.pause();
        }
      }
    },
    { threshold: 0.5 },
  );
  for (const v of videos) {
    v.addEventListener("pause", () => {
      if (ours.has(v)) ours.delete(v);
      else touched.add(v);
    });
    v.addEventListener("seeking", () => touched.add(v));
    seen.observe(v);
  }
}
