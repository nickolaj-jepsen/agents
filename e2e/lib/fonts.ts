/**
 * tui-test's PNG screenshots need outline fonts it can find itself: it scans
 * `~/.local/share/fonts` and a few `/usr` paths, none of which exist on NixOS. So
 * this lays a folder of links to the fonts fontconfig knows and hands that out as
 * `HOME` for the one call that rasterizes (and for a daemon, which reads it at start).
 *
 * The families cover Nerd Font icons, box drawing, and the symbols Claude Code and pi
 * draw (`⎿ ⏵ ✳`); Unifont is the last resort for what nothing else has.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, symlinkSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const FONT_FAMILIES =
  "Hack Nerd Font Mono,DejaVu Sans Mono,DejaVu Sans,Noto Sans CJK JP,Unifont";

const WANTED = [
  "Hack Nerd Font Mono",
  "DejaVu Sans Mono",
  "DejaVu Sans",
  "Noto Sans CJK JP",
  "Unifont",
];

export const realHome = homedir();

const cacheRoot = () =>
  join(process.env.XDG_CACHE_HOME ?? join(realHome, ".cache"), "agent-tools-e2e");

let fontHome: string | undefined;

/** A `HOME` whose `.local/share/fonts` holds the wanted fonts; undefined when fontconfig has none. */
export function fakeFontHome(): string | undefined {
  if (fontHome) return fontHome;
  const home = join(cacheRoot(), "fonthome");
  const dir = join(home, ".local", "share", "fonts");
  mkdirSync(dir, { recursive: true });
  if (readdirSync(dir).length === 0) {
    for (const family of WANTED) {
      let out = "";
      try {
        out = execFileSync("fc-list", [family, "file"], { encoding: "utf8" });
      } catch {
        continue;
      }
      for (const line of out.split("\n")) {
        const file = line.split(":")[0]?.trim();
        // Collections and bitmap-only formats aside, link every outline file.
        if (!file || !/\.(ttf|otf|ttc)$/i.test(file)) continue;
        const target = join(dir, file.split("/").pop() ?? "");
        if (!existsSync(target)) symlinkSync(file, target);
      }
    }
  }
  if (readdirSync(dir).length === 0) return undefined;
  fontHome = home;
  return home;
}
