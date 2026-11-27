/**
 * pi's editor with the frame's top border and the decorators' styling. It draws plainly once its
 * session has ended, and tells the bridge about every edit, so a feature like spellfix can check
 * the draft as it is written.
 */
import { CustomEditor, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import type { EditorHooks, PromptDraft } from "./editor-hooks.ts";
import type { ChromeState } from "./state.ts";

type Border = (text: string) => string;

/** What pi shows while it works, retries, compacts or summarises a branch; pi animates it. */
export type BorderStatus = NonNullable<Parameters<CustomEditor["setWorkingStatusIndicator"]>[0]>;

/** What the frame draws on the editor's row above the draft. */
export type Painters = {
  top: (width: number, hidden: number, border: Border, status: BorderStatus | undefined) => string;
};

/** pi's editor with the frame's top border and the decorators' styling. */
export class PromptEditor extends CustomEditor implements PromptDraft {
  private status: BorderStatus | undefined;

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    private readonly chrome: ChromeState,
    private readonly painters: Painters,
    private readonly hooks: EditorHooks,
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
    return this.painters.top(width, hidden, (text) => this.borderColor(text), this.status);
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
