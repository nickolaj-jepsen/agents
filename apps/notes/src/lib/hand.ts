/**
 * Handing a note to something else: the app a file goes to, the browser an HTML note goes to,
 * and the size past which a note is not read in the harness. Pure: a harness loads the apps
 * (`@agents/launch`), starts the command and reads the file.
 */
import { type App, choices, type Installed, preferred } from "@agents/launch/apps.ts";

/** A note larger than this is not read in the harness. */
export const MAX_READ_BYTES = 256 * 1024;

/** `1.2 MiB`, `300 KiB`: a file's size in the fewest letters. */
export const sizeText = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
    : `${Math.max(1, Math.round(bytes / 1024))} KiB`;

/** Why a note of `bytes` is not read here; nothing for one that is. */
export const tooLarge = (bytes: number): string | undefined =>
  bytes > MAX_READ_BYTES
    ? `This note is ${sizeText(bytes)}, too large to read here. Open hands it to an app.`
    : undefined;

/** The `file://` link of a path, each part of it encoded. */
export const fileUrl = (path: string) =>
  `file://${path.split("/").map(encodeURIComponent).join("/")}`;

/** Where a note is handed: the default app for a file, or the browser. */
export type Way = "app" | "browser";

export type Handed =
  /** The command to start, detached, the folder it starts in, and the app's name. */
  | { argv: string[]; cwd?: string; label: string }
  /** Why nothing can run, for the person. */
  | { problem: string };

/**
 * The command that opens `file` the given way: the first installed app that takes a file, or
 * the first that takes a link.
 */
export function handOff(
  apps: readonly App[],
  installed: Installed,
  file: string,
  way: Way,
): Handed {
  const offered =
    way === "browser"
      ? choices(apps, installed, { kind: "url", url: fileUrl(file) })
      : choices(apps, installed, { kind: "file", file });
  const choice = preferred(offered);
  if (choice?.argv) return { argv: choice.argv, cwd: choice.cwd, label: choice.app.label };
  return {
    problem:
      way === "browser"
        ? "No app that opens a link is installed, so there is nothing to open the note in."
        : "No app that opens a file is installed. Add one to ~/.config/agents/open.json.",
  };
}
