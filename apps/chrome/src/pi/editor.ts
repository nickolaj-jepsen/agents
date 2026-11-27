/**
 * pi's editor with the frame's top border and the decorators' styling. It draws plainly once its
 * session has ended, and tells the bridge about every edit, so a feature like spellfix can check
 * the draft as it is written.
 *
 * The border is also where the frame's mouse controls are: a click on a chip or the context pill
 * is the keystroke that does the same, and everything else on the editor — click-to-place-cursor
 * included — stays pi's.
 */
import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import type { Region } from "../lib/line.ts";
import { regionAt } from "../lib/line.ts";
import type { ChromeAction } from "./actions.ts";
import type { BorderLine } from "./border.ts";
import type { EditorHooks, PromptDraft } from "./editor-hooks.ts";
import type { ChromeState } from "./state.ts";

type Border = (text: string) => string;

/** What pi shows while it works, retries, compacts or summarises a branch; pi animates it. */
export type BorderStatus = NonNullable<Parameters<CustomEditor["setWorkingStatusIndicator"]>[0]>;

/** What the frame draws on the editor's row above the draft. */
export type Painters = {
  top: (
    width: number,
    hidden: number,
    border: Border,
    status: BorderStatus | undefined,
  ) => BorderLine;
};

/** pi's editor with the frame's top border and the decorators' styling. */
export class PromptEditor extends CustomEditor implements PromptDraft {
  private status: BorderStatus | undefined;
  private topRegions: Region[] = [];

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    private readonly chrome: ChromeState,
    private readonly painters: Painters,
    private readonly hooks: EditorHooks,
    /** What a control on the top border does, by the name its region carries. */
    private readonly controls: Record<string, ChromeAction>,
  ) {
    // pi embeds its working status in the top border only for an editor that asks.
    super(tui, theme, keybindings, { embedWorkingStatus: true });
    hooks.attach(this);
  }

  override setWorkingStatusIndicator(indicator: BorderStatus | undefined): void {
    this.status = indicator;
    super.setWorkingStatusIndicator(indicator);
  }

  protected override renderTopBorder(width: number, hidden: number): string {
    if (!this.chrome.live || width <= 0) return super.renderTopBorder(width, hidden);
    // pi reassigns borderColor as the thinking level or bash mode changes.
    const top = this.painters.top(width, hidden, (text) => this.borderColor(text), this.status);
    this.topRegions = top.regions;
    // The footer renders after the editor, and reads this as "the border carried the meters".
    this.chrome.borderDrawn = true;
    return top.line;
  }

  override render(width: number): string[] {
    const lines = super.render(width);
    if (!this.chrome.live) return lines;
    // Line 0 is the border, whose label is no prompt text to spellcheck.
    for (let i = 1; i < lines.length; i++) lines[i] = this.hooks.decorateLine(lines[i]!);
    return lines;
  }

  override handleInput(data: string): void {
    super.handleInput(data);
    this.hooks.edited(this);
  }

  override setText(text: string): void {
    super.setText(text);
    this.hooks.edited(this);
  }

  // pi's clipboard paste lands here once read, after its keystroke's check has run.
  override insertTextAtCursor(text: string): void {
    super.insertTextAtCursor(text);
    this.hooks.edited(this);
  }

  override handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type === "move") {
      // Leaving the border downward is the only exit pi reports for it.
      this.chrome.setHover(event.y === 0 ? regionAt(this.topRegions, event.x)?.id : undefined);
      return super.handleMouse(event);
    }
    // Only a control on the top border: the rest keeps pi's behaviour, including
    // click-to-place-cursor in the input.
    if (event.y === 0) {
      const plain = event.button === "left" && !event.alt && !event.shift && !event.ctrl;
      const region = plain ? regionAt(this.topRegions, event.x) : undefined;
      const ctx = this.chrome.ctx;
      const action = region && ctx ? this.controls[region.action] : undefined;
      if (ctx && action) {
        void Promise.resolve()
          .then(() => action(ctx))
          .catch((error: unknown) => ctx.ui.notify(`chrome: ${String(error)}`, "error"));
        return { handled: true };
      }
    }
    return super.handleMouse(event);
  }

  replaceText(text: string): void {
    // pi-tui's paste map and counter are private, and setText clears them.
    const self = this as unknown as { pastes: Map<number, string>; pasteCounter: number };
    const pastes = new Map(self.pastes);
    const counter = self.pasteCounter;
    this.setText(text);
    for (const [id, paste] of pastes) self.pastes.set(id, paste);
    self.pasteCounter = counter;
  }

  requestRender(): void {
    this.tui.requestRender();
  }
}
