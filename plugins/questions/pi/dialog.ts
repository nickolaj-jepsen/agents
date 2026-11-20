import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type Focusable,
  Input,
  Key,
  matchesKey,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import {
  bodyOrigin,
  CARD_NOTE_LABEL,
  cardChoice,
  cardHeading,
  cardNote,
  cardSections,
  chipRow,
  clamp,
  digitChoice,
  fit,
  type Hint,
  markdownLines,
  modalFrame,
  paint,
  tokens,
  widthCap,
} from "../../../kit/pi/ui.ts";
import { type Question, type QuestionsResult, type QuestionAnswer } from "./types.ts";

const MIN_WIDTH = 28;
const RESERVED_ROWS = 10;
const MAX_ROWS = 24;
const FRAME_ROWS = 2 * bodyOrigin.y;
const GAP = " ".repeat(tokens.gutter);

type Item =
  | { kind: "option"; index: number }
  | { kind: "custom" }
  | { kind: "note" }
  | { kind: "done" }
  | { kind: "review"; question: number }
  | { kind: "send" }
  | { kind: "cancel" };

type Tab = { kind: "question"; index: number } | { kind: "review" };

/** What the user has said so far for one question; picks and text exclude each other. */
interface Draft {
  picked: number[];
  text: string;
}

/** A rendered row and the click target it carries, if any. */
interface BodyRow {
  text: string;
  hit?: Item;
  /**
   * Columns from the row's start that belong to the target. The pointer has to
   * be over the row's own text, not merely on its line: the rest of the line is
   * dialog space, and hovering it must not move the cursor.
   */
  hitTo?: number;
}

const isAnswered = (draft: Draft) => draft.picked.length > 0 || draft.text.trim() !== "";

/** A row that carries a pointer target over the text it actually draws. */
function target(text: string, item: Item): BodyRow {
  return { text, hit: item, hitTo: visibleWidth(text.replace(/\s+$/, "")) };
}

/**
 * A previous round's answer as a draft: options it names are picked, anything
 * else is what the user typed, which is where those answers came from.
 */
function draftFrom(question: Question, values: readonly string[]): Draft {
  const picked: number[] = [];
  const typed: string[] = [];
  for (const value of values) {
    const index = question.options.findIndex((option) => option.label === value);
    if (index >= 0) picked.push(index);
    else typed.push(value);
  }
  const sorted = [...new Set(picked)].sort((left, right) => left - right);
  return {
    // A single-select answer is one option; a multi-select answer keeps every pick.
    picked: question.multiSelect ? sorted : sorted.slice(0, 1),
    text: typed.join(", "),
  };
}

export class QuestionsDialog implements Component, Focusable {
  private readonly tabs: Tab[];
  private readonly drafts: Draft[];
  /** The answer field and the note field, each with its own cursor, undo and paste. */
  private readonly input: Input;
  private readonly noteInput: Input;
  private tab = 0;
  private row = 0;
  private editing: "answer" | "note" | undefined;
  /** One note per question, included with its answer in the result. */
  private readonly notes: string[];
  /** First line of a question too tall for the frame, and how far it can go. */
  private questionOffset = 0;
  private questionMaxOffset = 0;
  /** The question's rows in the last frame, for wheeling over its text. */
  private questionRows: { start: number; end: number } = { start: 0, end: 0 };
  private warning: string | undefined;
  /** Esc asks once before it throws the answers away; this is that question being pending. */
  private confirming = false;
  /**
   * How far the preview is scrolled, how far it can go, and which row it belongs to.
   * The box prints the position; these are what the keys and the wheel move.
   */
  private previewOffset = 0;
  private previewMax = 0;
  private previewFor: number | undefined;
  private previewCells: { top: number; bottom: number; left: number } | undefined;
  private closed = false;
  private isFocused = false;
  private hits = new Map<number, { item: Item; to: number }>();
  private tabCells: { start: number; end: number; tab: number }[] = [];
  private tabRow = -1;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly questions: readonly Question[],
    private readonly done: (result: QuestionsResult) => void,
    /** Answers from an earlier round, preselected so re-answering starts from them. */
    previous: readonly QuestionAnswer[] = [],
  ) {
    this.tabs = questions.map((_, index) => ({ kind: "question", index }) as const);
    // The review step earns its rows only when there is more than one answer to check.
    if (questions.length > 1) this.tabs.push({ kind: "review" });
    // A round answers its questions in order and skips the ones left blank, so
    // the header and the question text together are what pair them back up.
    const was = (question: Question) =>
      previous.find(
        (answer) => answer.header === question.header && answer.question === question.question,
      );
    this.drafts = questions.map((question) => {
      const answer = was(question);
      return answer ? draftFrom(question, answer.values) : { picked: [], text: "" };
    });
    this.notes = questions.map((question) => was(question)?.note ?? "");
    // Start on the answer this round already has: its first pick, or the row its typed text sits on.
    const first = this.drafts[0];
    const typed = first?.text.trim()
      ? this.items().findIndex((item) => item.kind === "custom")
      : -1;
    this.row = first?.picked[0] ?? Math.max(0, typed);
    this.input = new Input({ prompt: "", placeholder: "Your answer" });
    this.noteInput = new Input({ prompt: "", placeholder: "Your note" });
  }

  /** Inline rather than an overlay: the transcript stays readable behind it. */
  get focused(): boolean {
    return this.isFocused;
  }

  set focused(value: boolean) {
    this.isFocused = value;
    this.input.focused = value && this.editing === "answer";
    this.noteInput.focused = value && this.editing === "note";
  }

  invalidate(): void {}

  /** The field being edited; only meaningful while `editing` is set. */
  private get editingInput(): Input {
    return this.editing === "note" ? this.noteInput : this.input;
  }

  private get tabKind(): Tab {
    return this.tabs[this.tab] ?? this.tabs[0]!;
  }

  /** The question the current tab edits, if it edits one. */
  private get questionIndex(): number | undefined {
    const kind = this.tabKind;
    return kind.kind === "question" ? kind.index : undefined;
  }

  private get question(): Question | undefined {
    const index = this.questionIndex;
    return index === undefined ? undefined : this.questions[index];
  }

  private items(): Item[] {
    const question = this.question;
    if (!question) {
      return [
        ...this.questions.map((_, index) => ({ kind: "review", question: index }) as Item),
        { kind: "send" },
        { kind: "cancel" },
      ];
    }
    const items: Item[] = question.options.map((_, index) => ({ kind: "option", index }));
    items.push({ kind: "custom" });
    items.push({ kind: "note" });
    if (question.multiSelect) items.push({ kind: "done" });
    return items;
  }

  private move(step: number): void {
    if (this.editing) return;
    const items = this.items();
    if (items.length === 0) return;
    this.row = (this.row + (step % items.length) + items.length) % items.length;
    this.warning = undefined;
    this.tui.requestRender();
  }

  private goTab(tab: number): void {
    this.keepDraft();
    this.questionOffset = 0;
    this.previewOffset = 0;
    this.previewFor = undefined;
    this.tab = Math.max(0, Math.min(tab, this.tabs.length - 1));
    // The review tab exists to be sent, so enter offers to send it rather than
    // to walk back into a question the user has already answered.
    this.row = Math.max(
      0,
      this.tabKind.kind === "review" ? this.items().findIndex((item) => item.kind === "send") : 0,
    );
    this.editing = undefined;
    this.input.focused = false;
    this.noteInput.focused = false;
    this.warning = undefined;
    this.tui.requestRender();
  }

  private cycleTab(step: number): void {
    if (this.tabs.length < 2) return;
    this.goTab((this.tab + step + this.tabs.length) % this.tabs.length);
  }

  /** Move a question too tall for the frame; idle when the whole text is on screen. */
  private scrollQuestion(step: number): void {
    if (this.questionMaxOffset === 0) return;
    const next = Math.max(0, Math.min(this.questionMaxOffset, this.questionOffset + step));
    if (next === this.questionOffset) return;
    this.questionOffset = next;
    this.tui.requestRender();
  }

  private scrollPreview(step: number): void {
    const next = Math.max(0, Math.min(this.previewMax, this.previewOffset + step));
    if (next === this.previewOffset) return;
    this.previewOffset = next;
    this.tui.requestRender();
  }

  private startEditing(field: "answer" | "note"): void {
    const index = this.questionIndex;
    if (index === undefined) return;
    if (this.editing === field) return;
    this.keepDraft();
    this.editing = field;
    this.row = this.items().findIndex(
      (item) => item.kind === (field === "note" ? "note" : "custom"),
    );
    this.warning = undefined;
    this.input.focused = this.isFocused && field === "answer";
    this.noteInput.focused = this.isFocused && field === "note";
    this.editingInput.setValue(field === "note" ? this.notes[index]! : this.drafts[index]!.text);
    this.tui.requestRender();
  }

  /** Leaving the field, or the tab, keeps what was typed as a draft on the row. */
  private keepDraft(): void {
    const index = this.questionIndex;
    if (this.editing === undefined || index === undefined) return;
    if (this.editing === "note") this.notes[index] = this.noteInput.getValue();
    else this.saveWriteIn(index, this.input.getValue());
  }

  private saveWriteIn(index: number, text: string): void {
    const draft = this.drafts[index]!;
    this.drafts[index] = {
      picked: !text.trim() || this.questions[index]!.multiSelect ? draft.picked : [],
      text,
    };
  }

  private stopEditing(): void {
    this.keepDraft();
    this.editing = undefined;
    this.input.focused = false;
    this.noteInput.focused = false;
    this.warning = undefined;
    this.tui.requestRender();
  }

  /**
   * Save the field and, for an answer, move on.
   *
   * A note saves in place: it is commentary on a question, not the decision, so
   * entering one must not carry the user off the tab they were reading.
   */
  private commitText(): void {
    const index = this.questionIndex;
    if (index === undefined) return;
    const text = this.editingInput.getValue().trim();
    if (this.editing === "note") {
      this.notes[index] = text;
      this.editing = undefined;
      this.input.focused = false;
      this.noteInput.focused = false;
      this.warning = undefined;
      this.tui.requestRender();
      return;
    }
    if (!text) {
      this.warning = "Type an answer, or press esc to go back";
      this.tui.requestRender();
      return;
    }
    // A typed answer joins the picks of a multi-select question instead of
    // replacing them, and does not carry the user off a tab whose answer the
    // Done row still has to confirm.
    const keepPicks = this.question?.multiSelect === true;
    this.saveWriteIn(index, text);
    this.editing = undefined;
    this.input.focused = false;
    if (keepPicks) {
      this.warning = undefined;
      this.tui.requestRender();
      return;
    }
    this.advance();
  }

  /** Take an option: a single-select answer is complete, a multi-select one is a toggle. */
  private choose(index: number): void {
    const question = this.question;
    const at = this.questionIndex;
    if (!question || at === undefined) return;
    const draft = this.drafts[at]!;
    if (question.multiSelect) {
      const picked = draft.picked.includes(index)
        ? draft.picked.filter((candidate) => candidate !== index)
        : [...draft.picked, index].sort((left, right) => left - right);
      // Toggling an option says nothing about the answer typed in the row below.
      this.drafts[at] = { picked, text: draft.text };
      this.warning = undefined;
      this.tui.requestRender();
      return;
    }
    this.drafts[at] = { picked: [index], text: "" };
    this.advance();
  }

  /** The answers one question contributes, options first and a typed one last. */
  private valuesOf(index: number): string[] {
    const draft = this.drafts[index]!;
    const options = this.questions[index]!.options;
    const text = draft.text.trim();
    return [
      ...draft.picked.flatMap((picked) => {
        const option = options[picked];
        return option ? [option.label] : [];
      }),
      ...(text ? [text] : []),
    ];
  }

  /** Move on the way a click on an option would: to the next open question, else to review. */
  private advance(): void {
    this.warning = undefined;
    if (this.tabs.length === 1) {
      this.submit();
      return;
    }
    const open = this.drafts.findIndex((draft) => !isAnswered(draft));
    this.goTab(open >= 0 ? open : this.tabs.length - 1);
  }

  private submit(): void {
    const open = this.drafts.findIndex((draft) => !isAnswered(draft));
    if (open >= 0) {
      this.goTab(open);
      this.warning = `Answer question ${open + 1} first`;
      this.tui.requestRender();
      return;
    }
    const answers: QuestionAnswer[] = [];
    this.questions.forEach((question, index) => {
      const values = this.valuesOf(index);
      if (values.length > 0) {
        const note = this.notes[index]?.trim() ?? "";
        answers.push({
          header: question.header,
          question: question.question,
          values,
          ...(note ? { note } : {}),
        });
      }
    });
    this.finish({ answers, cancelled: false });
  }

  private cancel(): void {
    this.finish({ answers: [], cancelled: true });
  }

  /** Esc asks once: an accidental key must not throw away the answers already given. */
  private askCancel(): void {
    this.confirming = true;
    this.warning = "Cancel without answering?";
    this.tui.requestRender();
  }

  private finish(result: QuestionsResult): void {
    if (this.closed) return;
    this.closed = true;
    this.focused = false;
    this.done(result);
  }

  /** The action a row performs, whichever way it was reached. */
  private activate(item: Item): void {
    if (this.editing !== undefined && item.kind !== this.editing) this.stopEditing();
    switch (item.kind) {
      case "option":
        this.choose(item.index);
        return;
      case "custom":
        this.startEditing("answer");
        return;
      case "note":
        this.startEditing("note");
        return;
      case "done":
        if (!isAnswered(this.drafts[this.questionIndex ?? 0]!)) {
          this.warning = "Pick an option or write an answer first";
          this.tui.requestRender();
          return;
        }
        this.advance();
        return;
      case "review":
        this.goTab(item.question);
        return;
      case "send":
        this.submit();
        return;
      case "cancel":
        this.cancel();
        return;
    }
  }

  handleInput(data: string): void {
    if (this.editing) {
      this.handleEditingInput(data);
      return;
    }
    if (this.confirming) {
      // Enter is the answer to the question on the hint line; anything else,
      // esc included, is the user saying they did not mean it.
      if (matchesKey(data, Key.enter)) this.cancel();
      else {
        this.confirming = false;
        this.warning = undefined;
        this.tui.requestRender();
      }
      return;
    }
    // Ctrl+C stays an immediate cancel: it is the key for "stop", not "ask".
    if (matchesKey(data, "ctrl+c")) {
      this.cancel();
      return;
    }
    if (matchesKey(data, Key.escape)) {
      this.askCancel();
      return;
    }
    if (matchesKey(data, Key.up) || data === "k") {
      this.move(-1);
      return;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.move(1);
      return;
    }
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
      this.cycleTab(1);
      return;
    }
    if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
      this.cycleTab(-1);
      return;
    }
    // Shift+arrows, not the page keys: fullscreen's own viewport listener
    // claims PageUp/PageDown before a focused inline component sees them.
    if (matchesKey(data, Key.shift("up")) || matchesKey(data, Key.shift("down"))) {
      const step = matchesKey(data, Key.shift("down")) ? 3 : -3;
      if (this.previewMax > 0) this.scrollPreview(step);
      else this.scrollQuestion(step);
      return;
    }
    if (matchesKey(data, Key.shift("left")) || matchesKey(data, Key.shift("right"))) {
      this.scrollQuestion(matchesKey(data, Key.shift("right")) ? 3 : -3);
      return;
    }
    if (data === "n" && this.question) {
      this.startEditing("note");
      return;
    }
    if (matchesKey(data, Key.enter)) {
      const item = this.items()[this.row];
      if (item) this.activate(item);
      return;
    }
    if (data === " ") {
      const item = this.items()[this.row];
      const question = this.question;
      if (item?.kind === "option" && question?.multiSelect) this.choose(item.index);
      return;
    }
    const slot = /^[a-e]$/i.test(data) ? data.toUpperCase().charCodeAt(0) - 65 : digitChoice(data);
    const item = this.question && slot >= 0 ? this.items()[slot] : undefined;
    if (item && (item.kind === "option" || item.kind === "custom")) {
      this.row = slot;
      this.activate(item);
    }
  }

  private handleEditingInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.stopEditing();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.commitText();
      return;
    }
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
      this.cycleTab(matchesKey(data, Key.tab) ? 1 : -1);
      return;
    }
    this.editingInput.handleInput(data);
    this.tui.requestRender();
  }

  /**
   * The target under the pointer: the row under it, when the pointer is over
   * that row's own text rather than the empty part of its line.
   */
  private itemAt(x: number, row: number): Item | undefined {
    const hit = this.hits.get(row);
    return hit && x < hit.to ? hit.item : undefined;
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const row = event.y - bodyOrigin.y;
    const x = event.x - bodyOrigin.x;
    if (x < 0 || row < 0 || this.confirming) return undefined;
    if (event.type === "wheel" && event.wheelDelta) {
      const step = event.wheelDelta < 0 ? -1 : 1;
      const pane = this.previewCells;
      // A pane with nothing to scroll is not a scroll target: the wheel keeps
      // doing what it does everywhere else.
      if (this.previewMax > 0 && pane && row >= pane.top && row < pane.bottom && x >= pane.left) {
        this.scrollPreview(step);
        return { handled: true };
      }
      const overText = row >= this.questionRows.start && row < this.questionRows.end;
      if (overText && this.questionMaxOffset > 0) {
        this.scrollQuestion(step);
        return { handled: true };
      }
      this.move(step);
      return { handled: true };
    }
    // A tab row is a strip of chips, so it hit-tests by column, not by row.
    if (row === this.tabRow) {
      const cell = this.tabCells.find((candidate) => x >= candidate.start && x < candidate.end);
      if (!cell) return undefined;
      if (event.type === "press") return { handled: true, focus: true };
      if (event.type === "click") {
        this.goTab(cell.tab);
        return { handled: true };
      }
      return undefined;
    }
    const item = this.itemAt(x, row);
    if (!item) return undefined;
    const index = this.items().findIndex((candidate) => sameItem(candidate, item));
    if (event.type === "move") {
      if (!this.editing && index >= 0 && index !== this.row) {
        this.row = index;
        this.warning = undefined;
        this.tui.requestRender();
      }
      return { handled: true };
    }
    if (event.button !== "left" || (event.type !== "press" && event.type !== "click")) {
      return undefined;
    }
    // Both text rows are fields: a press highlights, and the click that follows
    // opens the field, or places the cursor when it is already open.
    if (item.kind === "custom" || item.kind === "note") {
      const field = item.kind === "note" ? "note" : "answer";
      if (event.type === "press") {
        if (index >= 0) {
          this.row = index;
          this.tui.requestRender();
        }
        return { handled: true, focus: true };
      }
      if (this.editing !== field) {
        this.startEditing(field);
        return { handled: true };
      }
      const prefix = field === "note" ? visibleWidth(CARD_NOTE_LABEL) : 4;
      return (
        this.editingInput.handleMouse?.({ ...event, x: Math.max(0, x - prefix), y: 0 }) ?? {
          handled: true,
        }
      );
    }
    if (index >= 0) this.row = index;
    if (event.type === "press") {
      if (index >= 0) {
        this.warning = undefined;
        this.tui.requestRender();
      }
      return { handled: true, focus: true };
    }
    this.activate(item);
    return { handled: true };
  }

  render(width: number): string[] {
    this.hits.clear();
    this.tabCells = [];
    this.tabRow = -1;
    this.previewCells = undefined;
    this.previewMax = 0;
    this.questionRows = { start: 0, end: 0 };
    this.questionMaxOffset = 0;
    if (width < MIN_WIDTH) return [clamp("Question: widen terminal; esc cancel", width)[0] ?? ""];
    const { theme, question } = this;
    const hasPreview = question?.options.some((option) => option.preview !== undefined) ?? false;
    const split = hasPreview && width >= tokens.splitFrom;
    const frameWidth = widthCap(split ? "split" : "reading", width);
    const inner = Math.min(split ? Infinity : tokens.prose, frameWidth - 2 * bodyOrigin.x);
    const choiceWidth = split ? Math.floor((inner - GAP.length) * tokens.splitRatio) : inner;
    const budget = Math.max(
      9,
      Math.min(MAX_ROWS, this.tui.terminal.rows - RESERVED_ROWS) - FRAME_ROWS,
    );
    const rows: BodyRow[] = [];
    const answered =
      this.questionIndex !== undefined && isAnswered(this.drafts[this.questionIndex]!);
    const dim = (line: string) => paint(theme, "dim", line);
    const title = question
      ? cardHeading(theme, inner, question.question, `Q${this.tab + 1}`, true, answered)
      : cardHeading(theme, inner, "Review your answers", "Answers", true, false);
    const titleRoom = Math.max(2, Math.floor(budget / 4));
    this.questionMaxOffset = Math.max(0, title.length - titleRoom);
    this.questionOffset = Math.min(this.questionOffset, this.questionMaxOffset);
    const shown = title.slice(this.questionOffset, this.questionOffset + titleRoom);
    if (this.questionMaxOffset > 0) {
      const index = this.questionOffset < this.questionMaxOffset ? shown.length - 1 : 0;
      shown[index] = truncateToWidth(shown[index]!, inner - 2, "") + dim(" …");
    }

    if (this.tabs.length > 1) {
      const chips = this.tabs.map((tab, index) => ({
        key: index === this.tab ? tokens.glyph.pointer : " ",
        label:
          tab.kind === "review"
            ? "Review"
            : `Q${index + 1}${isAnswered(this.drafts[index]!) ? tokens.glyph.done : ""}`,
        act: index,
      }));
      const strip = chipRow(theme, chips);
      if (visibleWidth(strip.text) <= inner) {
        this.tabRow = rows.length;
        this.tabCells = (strip.cells ?? []).map(({ start, end, act }) => ({
          start,
          end,
          tab: act,
        }));
        rows.push({ text: strip.text });
      }
    }
    this.questionRows = { start: rows.length, end: rows.length + shown.length };
    const heading = shown.map((text) => ({ text }));

    const stackedRows = hasPreview && !split ? Math.max(2, Math.min(7, Math.floor(budget / 3))) : 0;
    const room = Math.max(2, budget - rows.length - heading.length - 1);
    const listRoom = Math.max(2, room - stackedRows);
    const items = this.items();
    const blocks = items.map((item, i) => this.itemBlock(item, i, choiceWidth, Infinity));
    const total = blocks.reduce((n, block) => n + block.length, 0);
    const compact =
      total > listRoom ? items.map((item, i) => this.itemBlock(item, i, choiceWidth, 2)) : blocks;
    let list = this.window(compact, listRoom);
    if (hasPreview) {
      const left = split ? choiceWidth + GAP.length : 0;
      const preview = this.preview(inner - left, split ? room : stackedRows);
      const top = rows.length + heading.length + 1 + (split ? 0 : list.length);
      this.previewCells = { top, bottom: top + preview.length, left };
      if (split) {
        list = Array.from({ length: Math.max(list.length, preview.length) }, (_, i) => {
          const row = list[i];
          return {
            ...row,
            text: fit(row?.text ?? "", choiceWidth) + GAP + (preview[i] ?? ""),
          };
        });
      } else {
        list.push(...preview.map((text) => ({ text })));
      }
    }
    rows.push(...cardSections<BodyRow>({ text: "" }, heading, list));
    rows.forEach((row, index) => {
      if (row.hit) this.hits.set(index, { item: row.hit, to: row.hitTo ?? inner });
    });
    const titleLabel = question?.header ?? "Questions";
    return modalFrame(theme, {
      width: frameWidth,
      title: titleLabel,
      body: rows.map(({ text }) => text),
      hints: this.hints(),
      notice: this.warning ? paint(theme, "warning", this.warning) : undefined,
    });
  }

  private hints(): Hint[] {
    const hint = (key: string, label: string, essential = false) => ({ key, label, essential });
    if (this.confirming) return [hint("enter", "yes", true), hint("esc", "no", true)];
    if (this.editing) return [hint("enter", "save", true), hint("esc", "back", true)];
    const choices = this.question ? this.question.options.length + 1 : 0;
    return [
      hint("esc", "cancel", true),
      ...(choices ? [hint(`A–${this.letter(choices - 1)}/1–${choices}`, "pick")] : []),
      hint("↑↓", "move"),
      ...(this.previewMax > 0 ? [hint("⇧↑↓", "preview")] : []),
      ...(this.questionMaxOffset > 0 ? [hint("⇧←→", "text")] : []),
      hint("enter", this.items()[this.row]?.kind === "send" ? "send" : "select"),
      ...(this.question?.multiSelect ? [hint("space", "toggle")] : []),
      ...(this.tabs.length > 1 ? [hint("tab/←→", "tabs")] : []),
      ...(choices ? [hint("n", "note")] : []),
    ];
  }

  private letter(i: number): string {
    return String.fromCharCode(65 + i);
  }

  private itemBlock(item: Item, i: number, width: number, detailLines: number): BodyRow[] {
    const { theme, question } = this;
    const dim = (line: string) => paint(theme, "dim", line);
    const at = i === this.row;
    const pointer = at ? paint(theme, "accent", tokens.glyph.pointer) + " " : GAP;
    const draft = this.drafts[this.questionIndex ?? 0]!;
    const action = (text: string) =>
      target(pointer + (at ? theme.bold(paint(theme, "accent", text)) : text), item);
    const lines = (text: string, max: number) => clamp(text, width - GAP.length, { max });
    const answered = isAnswered(draft);
    const choice = (key: string, text: string, chosen: boolean, literal = false, detail?: string) =>
      cardChoice(theme, width, {
        key,
        text,
        chosen,
        active: true,
        focused: at,
        answered,
        literal,
        multiple: question?.multiSelect,
        detail,
        detailLines,
      }).map((line) => target(line, item));
    switch (item.kind) {
      case "option": {
        const option = question!.options[item.index]!;
        return choice(
          this.letter(item.index),
          option.label,
          draft.picked.includes(item.index),
          false,
          option.description,
        );
      }
      case "custom": {
        if (this.editing === "answer") {
          const field = this.input.render(width - 4)[0] ?? "";
          return [{ ...target(dim(`${this.letter(i)} › `) + field, item), hitTo: width }];
        }
        return choice(
          this.letter(i),
          draft.text.trim() || "Write your own answer",
          Boolean(draft.text.trim()),
          true,
        );
      }
      case "note": {
        const note = this.notes[this.questionIndex ?? 0]?.trim() ?? "";
        const content =
          this.editing === "note"
            ? [
                {
                  ...target(
                    dim(CARD_NOTE_LABEL) +
                      (this.noteInput.render(width - visibleWidth(CARD_NOTE_LABEL))[0] ?? ""),
                    item,
                  ),
                  hitTo: width,
                },
              ]
            : cardNote(theme, width, note, true, answered, 3).map((line, index) =>
                target(at && index === 0 ? theme.underline(line) : line, item),
              );
        return detailLines === Infinity ? [{ text: "" }, ...content] : content;
      }
      case "done":
        return [action("Done")];
      case "send":
        return [action("Send")];
      case "cancel":
        return [action("Cancel")];
      case "review": {
        const values = this.valuesOf(item.question);
        const header = this.questions[item.question]!.header;
        const note = this.notes[item.question]?.trim();
        return [
          ...lines(header + (values.length ? ` ${tokens.glyph.done}` : ""), 1).map((line) =>
            action(line),
          ),
          ...lines(values.join(", ") || "Unanswered", 2).map((line) =>
            target(GAP + dim(line), item),
          ),
          ...(note ? lines(`Note: ${note}`, 2).map((line) => target(GAP + dim(line), item)) : []),
        ];
      }
    }
  }

  /** Keep choices whole when possible and leave the focused block in view. */
  private window(blocks: BodyRow[][], room: number): BodyRow[] {
    const all = blocks.flat();
    if (all.length <= room) return all;
    const limit = Math.max(1, room - 1);
    // Choose pages independent of the pointer so a press cannot move its click target.
    let start = 0;
    let end = 0;
    let used = 0;
    while (end <= this.row) {
      start = end;
      used = blocks[end++]!.length;
      while (end < blocks.length && used + blocks[end]!.length <= limit) {
        used += blocks[end++]!.length;
      }
    }
    const rows = blocks.slice(start, end).flat().slice(0, limit);
    if (used > limit) {
      const last = rows.at(-1)!;
      rows[rows.length - 1] = { ...last, text: last.text + paint(this.theme, "dim", " …") };
    }
    while (rows.length < limit) rows.push({ text: "" });
    const above = start ? `↑ ${start} above` : "";
    const below = end < blocks.length ? `↓ ${blocks.length - end} below` : "";
    rows.push({ text: paint(this.theme, "dim", [above, below].filter(Boolean).join(GAP) || "…") });
    return rows;
  }

  private preview(width: number, room: number): string[] {
    const option = this.question?.options[this.row];
    if (this.previewFor !== this.row) {
      this.previewFor = this.row;
      this.previewOffset = 0;
    }
    const content = option?.preview
      ? markdownLines(this.theme, option.preview, width)
      : [paint(this.theme, "dim", "No preview available")];
    const limit = Math.max(1, room - 1);
    // Hold the preview at one height across choices, even for the placeholder.
    const count = Math.min(
      limit,
      Math.max(
        1,
        ...(this.question?.options.map(({ preview }) =>
          preview ? markdownLines(this.theme, preview, width).length : 1,
        ) ?? []),
      ),
    );
    this.previewMax = Math.max(0, content.length - count);
    this.previewOffset = Math.min(this.previewOffset, this.previewMax);
    const end = Math.min(content.length, this.previewOffset + count);
    const suffix = this.previewMax ? `  ${this.previewOffset + 1}–${end} of ${content.length}` : "";
    return [
      this.theme.bold(paint(this.theme, "dim", `Preview${suffix}`)),
      ...content.slice(this.previewOffset, end),
      ...Array<string>(count - (end - this.previewOffset)).fill(""),
    ];
  }
}

/** Two items are the same target when they name the same thing. */
function sameItem(left: Item, right: Item): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "option" && right.kind === "option") return left.index === right.index;
  if (left.kind === "review" && right.kind === "review") return left.question === right.question;
  return true;
}
