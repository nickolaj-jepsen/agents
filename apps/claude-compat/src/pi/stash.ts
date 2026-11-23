/**
 * Claude Code's ctrl+s prompt stash: ctrl+s parks the draft and clears the
 * editor, ctrl+s on an empty editor restores it, and submitting a prompt
 * restores it too.
 *
 * The stash is saved in one file per repository, keyed by its main checkout so a
 * worktree shares it, and so outlives /new, /clear, /resume, /fork, /reload and
 * the process itself.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { line, span, truncateSpans } from "@agents/kit-core/lines.ts";
import { paintLines } from "@agents/kit-core/paint/pi.ts";

type Held = { text: string; at: string };

const WIDGET_KEY = "stash";
const PREVIEW_CHARS = 60;

const preview = (text: string) => {
  const first = text.trim().split("\n")[0] ?? "";
  return first.length > PREVIEW_CHARS ? `${first.slice(0, PREVIEW_CHARS)}…` : first;
};

/** The stash's line: the words Claude Code uses, dim, cut to the width pi gives the widget. */
class StashLine implements Component {
  constructor(
    private readonly theme: Theme,
    private readonly text: string,
  ) {}

  invalidate() {}

  render(width: number): string[] {
    const drawn = line(truncateSpans([span(this.text, { role: "dim" })], width));
    return paintLines(this.theme, [drawn], width).lines;
  }
}

// A print, JSON or RPC run has no editor; its prompt must not consume the stash.
const hasEditor = (ctx: ExtensionContext) => ctx.mode === "tui" && ctx.hasUI;

const real = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

const git = (cwd: string, args: string[]) => {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
};

/** Main checkout of `cwd`, shared by every worktree of a repository; unset outside git. */
const gitMain = (cwd: string): string | undefined => {
  const out = git(cwd, [
    "rev-parse",
    "--path-format=absolute",
    "--show-toplevel",
    "--git-common-dir",
  ]);
  const [top, common] = out?.split("\n") ?? [];
  if (!top) return undefined;
  // A bare common dir has no main checkout; treat the worktree as its own main.
  return real(common && basename(common) === ".git" ? dirname(common) : top);
};

const fileFor = (cwd: string) => {
  // Outside git the directory stands for itself.
  const root = gitMain(cwd) ?? real(cwd);
  // A hash rather than a name: a checkout's path can outrun the filename limit.
  const key = createHash("sha256").update(root).digest("hex").slice(0, 16);
  return join(getAgentDir(), "prompt-stash", `${key}.json`);
};

const readStash = (path: string): Held | undefined => {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<Held>;
    return typeof parsed.text === "string" && typeof parsed.at === "string"
      ? { text: parsed.text, at: parsed.at }
      : undefined;
  } catch {
    return undefined;
  }
};

const writeStash = (path: string, stash: Held | undefined) => {
  try {
    if (!stash) return rmSync(path, { force: true });
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(stash, null, 2)}\n`);
    renameSync(tmp, path);
  } catch {
    // A stash that is not saved still works for this session.
  }
};

export default function (pi: ExtensionAPI) {
  let stash: Held | undefined;
  let file: string | undefined;

  // A widget rather than setStatus so the preview keeps its own line.
  const show = (ctx: ExtensionContext) => {
    const text =
      stash === undefined ? undefined : `stashed (ctrl+s restores): ${preview(stash.text)}`;
    ctx.ui.setWidget(
      WIDGET_KEY,
      text === undefined ? undefined : (_tui, theme) => new StashLine(theme, text),
    );
  };

  const park = (text: string | undefined) => {
    if (!file) return;
    stash = text === undefined ? undefined : { text, at: new Date().toISOString() };
    writeStash(file, stash);
  };

  pi.on("session_start", (_event, ctx) => {
    if (!hasEditor(ctx)) return;
    file = fileFor(ctx.sessionManager.getCwd());
    stash = readStash(file);
    show(ctx);
  });

  // Editor-only; pi's pickers move their ctrl+s save actions to alt+s.
  pi.registerShortcut("ctrl+s", {
    description: "Stash the prompt until the next submit",
    handler: (ctx) => {
      const text = ctx.ui.getEditorText();
      if (text.trim()) {
        ctx.ui.setEditorText(stash?.text ?? "");
        park(text);
      } else if (stash) {
        ctx.ui.setEditorText(stash.text);
        park(undefined);
      }
      show(ctx);
    },
  });

  pi.on("input", (event, ctx) => {
    // The editor is already cleared by the time input handlers run; anything in it is newly typed.
    if (!hasEditor(ctx) || event.source !== "interactive" || !stash) return;
    if (ctx.ui.getEditorText().trim()) return;
    ctx.ui.setEditorText(stash.text);
    park(undefined);
    show(ctx);
  });
}
