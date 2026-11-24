/**
 * tui-test's PNG screenshots need outline fonts it can find itself: it scans
 * `~/.local/share/fonts` and a few `/usr` paths, none of which exist on NixOS. So
 * this lays a folder of links to the fonts fontconfig knows and hands that out as
 * `HOME` to the daemon and test worker when they start, never switching it during capture.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const FONT_FAMILIES =
  "Hack Nerd Font Mono,DejaVu Sans Mono,DejaVu Sans,Noto Sans CJK JP,Unifont,Unifont Upper";

const WANTED = [
  "Hack Nerd Font Mono",
  "DejaVu Sans Mono",
  "DejaVu Sans",
  "Noto Sans CJK JP",
  "Unifont",
  // Beyond the basic plane, for the emoji DejaVu lacks, such as U+1F642.
  "Unifont Upper",
];

// The test worker's HOME is for rasterization only; spawned agents still need their real home.
export const realHome = process.env.DRIVE_TEST_REAL_HOME ?? homedir();

const cacheRoot = () =>
  join(process.env.XDG_CACHE_HOME ?? join(realHome, ".cache"), "agent-tools-e2e");

let fontHome: string | undefined;

/** A `HOME` whose `.local/share/fonts` holds the wanted fonts; undefined when fontconfig has none. */
export function fakeFontHome(): string | undefined {
  if (fontHome) return fontHome;
  const root = cacheRoot();
  // The name changes with the list above, so a home laid for an older list is not taken for this
  // one. A home is published whole: one a writer left half-filled is never used.
  const home = join(root, "fonthome-v3");
  if (existsSync(home)) return (fontHome = home);
  mkdirSync(root, { recursive: true });
  const stage = mkdtempSync(join(root, "fonts-"));
  try {
    const dir = join(stage, ".local", "share", "fonts");
    mkdirSync(dir, { recursive: true });
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
    if (readdirSync(dir).length === 0) return undefined;
    try {
      renameSync(stage, home);
    } catch (error) {
      // Another writer finished first. Its non-empty directory cannot be replaced by rename.
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error;
    }
    return (fontHome = home);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
