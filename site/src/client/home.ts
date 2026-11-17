/**
 * The home page's harness switch: Both, or one harness, narrowing the plugins to those that run in
 * it, each showing that harness's picture and install command. The choice is remembered
 * (`prefs.ts`) and shared with the gallery's and the catalogue's switches.
 */
import { readHarness, writeHarness } from "./prefs.ts";

const list = document.querySelector<HTMLElement>("[data-tiles]");
const switches = [...document.querySelectorAll<HTMLButtonElement>("[data-set-h]")];

if (list && switches.length) {
  for (const el of document.querySelectorAll<HTMLElement>("[data-js]")) el.hidden = false;
  list.classList.add("js");
  const tiles = [...list.querySelectorAll<HTMLElement>(".tile")];
  const count = document.querySelector("[data-count]");

  const apply = (h: "claude" | "pi" | null): void => {
    for (const b of switches)
      b.setAttribute(
        "aria-pressed",
        String((b.dataset.setH === "both" ? null : b.dataset.setH) === h),
      );
    if (h) list.dataset.h = h;
    else delete list.dataset.h;
    let shown = 0;
    for (const t of tiles) {
      const has = !h || t.dataset.harnesses!.split(" ").includes(h);
      t.hidden = !has;
      if (has) shown++;
      // The picture of the chosen harness; else the first, which is the plugin's own.
      const pics = [...t.querySelectorAll<HTMLElement>(".tile-pic .crop")];
      const mine = pics.find((p) => p.dataset.h === h) ?? pics[0];
      for (const p of pics) p.hidden = p !== mine;
    }
    if (count) count.textContent = String(shown);
  };

  for (const b of switches)
    b.addEventListener("click", () => {
      const h = b.dataset.setH === "both" ? null : (b.dataset.setH as "claude" | "pi");
      writeHarness(h);
      apply(h);
    });
  apply(readHarness());
}
