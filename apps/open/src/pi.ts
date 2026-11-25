/**
 * The pi half of open: /open and /git. What a menu holds and what a press does are the shared
 * gathering's (`./lib/gather.ts`), the one Claude Code's mod runs; this gives it node, and draws
 * the menu in a sheet standing on the prompt. Outside pi's terminal UI the menu is a notice in
 * words.
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import {
  buildMenu,
  COMMANDS,
  menuText,
  pressRow,
  problemsText,
  TITLES,
  type Host,
} from "./lib/gather.ts";
import type { MenuKind } from "./lib/menus.ts";
import { nodeHost, nodePressHost } from "./pi/host.ts";
import {
  MenuSheet,
  PromptMark,
  rowsFromPrompt,
  sheetOptions,
  type Pressed,
  type Said,
} from "./pi/sheet.ts";

/** The widget's key: the empty mark above the prompt that the sheet stands on, while one is open. */
const WIDGET = "open";

export default function open(pi: ExtensionAPI) {
  /** Closes the menu that is open. */
  let closeOpen: (() => void) | undefined;

  /** The menu as words, where pi draws no terminal UI. */
  async function tell(ctx: ExtensionCommandContext, kind: MenuKind) {
    const report: Host["report"] = (problems) =>
      ctx.ui.notify(problemsText(problems) ?? "", "warning");
    ctx.ui.notify(menuText(await buildMenu(nodeHost(report), kind, ctx.cwd)), "info");
  }

  async function showMenu(ctx: ExtensionCommandContext, kind: MenuKind) {
    if (ctx.mode !== "tui") return tell(ctx, kind);
    // One at a time: the open sheet has the keyboard, so another can only come from elsewhere.
    if (closeOpen) return;
    // The mark above the prompt: the sheet finds the rule it stands on by it. Mounted only while
    // the menu is open, and drawing no row, so a session without one is unchanged.
    let mark: PromptMark | undefined;
    ctx.ui.setWidget(WIDGET, () => {
      mark = new PromptMark();
      return mark;
    });
    let surface: TUI | undefined;
    // The prompt and what is under it are measured once for a render, which asks several times.
    let measured: number | undefined;
    const below = () => {
      if (measured === undefined) {
        measured = (surface && mark && rowsFromPrompt(surface, mark)) || 0;
        queueMicrotask(() => {
          measured = undefined;
        });
      }
      return measured;
    };
    const title = TITLES[kind];
    try {
      const said = await ctx.ui.custom<Said[] | undefined>(
        (tui, theme, _keybindings, done) => {
          surface = tui;
          closeOpen = () => done(undefined);
          // What open.json got wrong is said in the sheet: pi's notices go to the transcript, under it.
          const report: Host["report"] = (problems) =>
            sheet.say({ text: problemsText(problems) ?? "", tone: "warning" });
          const sheet: MenuSheet = new MenuSheet(
            tui,
            theme,
            { kind, title, rows: null },
            {
              below,
              done,
              async press(row): Promise<Pressed> {
                const said: Said[] = [];
                const host = nodePressHost(report, (text, tone) => said.push({ text, tone }));
                return { outcome: await pressRow(host, row), said };
              },
            },
          );
          void buildMenu(nodeHost(report), kind, ctx.cwd).then(
            (menu) => sheet.show(menu),
            (error) => sheet.show({ kind, title, rows: [], error: String(error) }),
          );
          return sheet;
        },
        { overlay: true, overlayOptions: () => sheetOptions(surface!, below) },
      );
      // What a press that closed the menu said, now that the transcript is in sight.
      for (const { text, tone } of said ?? []) ctx.ui.notify(text, tone);
    } finally {
      closeOpen = undefined;
      ctx.ui.setWidget(WIDGET, undefined);
    }
  }

  for (const { name, kind, description } of COMMANDS)
    pi.registerCommand(name, { description, handler: (_args, ctx) => showMenu(ctx, kind) });

  pi.on("session_shutdown", () => closeOpen?.());
}
