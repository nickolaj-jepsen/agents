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
} from "@earendil-works/pi-tui";
import type { Button } from "@agents/kit-buttons/contract.ts";
import { buttonRow } from "@agents/kit-buttons/terminal.ts";
import { digitChoice } from "@agents/kit-card/contract.ts";
import {
  CARD_INSET,
  choice as choiceRows,
  heading as headingRows,
  note as noteRows,
  NOTE_LABEL,
  sectionsOf,
  steps,
  summary,
} from "@agents/kit-card/terminal.ts";
import { captionFrameLayout, closeOf, type CloseAction } from "@agents/kit-frame/contract.ts";
import { captionFrame } from "@agents/kit-frame/terminal.ts";
import { cellWidth, clamp, span } from "@agents/kit-core/lines.ts";
import {
  cellAt,
  cutPainted,
  draw,
  fitPainted,
  markdownLines,
  paintedWidth,
  paintLine,
  paintText,
  type Cell,
} from "@agents/kit-core/paint/pi.ts";
import { tokens, widthCap } from "@agents/kit-core/tokens.ts";
import { type Question, type QuestionsResult, type QuestionAnswer } from "./types.ts";

const MIN_WIDTH = 28;
const RESERVED_ROWS = 10;
const MAX_ROWS = 24;
const GAP = " ".repeat(tokens.gutter);
/** The cells a card's row keeps for the pointer. */
const INSET = cellWidth(CARD_INSET);

type ChoiceItem = { kind: "option"; index: number } | { kind: "custom" } | { kind: "note" };
type Item = ChoiceItem | { kind: "review"; question: number };

type Tab = { kind: "question"; index: number } | { kind: "review" };

/** The options picked and any write-in (both can be set for a multi-select). */
interface Draft {
  picked: number[];
  text: string;
}

/** Session-owned work, including text that has not been confirmed with Enter. */
export interface QuestionsDraft {
  drafts: Draft[];
  notes: string[];
  tab: number;
  row: number;
  editing?: "answer" | "note";
}

/** Ignore incompatible session records rather than letting them break the terminal renderer. */
export function isQuestionsDraft(value: unknown): value is QuestionsDraft {
  if (!value || typeof value !== "object") return false;
  const { drafts, notes, tab, row, editing } = value as Partial<QuestionsDraft>;
  return (
    Array.isArray(drafts) &&
    drafts.every(
      (draft) =>
        draft &&
        Array.isArray(draft.picked) &&
        draft.picked.every((index: unknown) => Number.isInteger(index) && (index as number) >= 0) &&
        typeof draft.text === "string",
    ) &&
    Array.isArray(notes) &&
    notes.every((note) => typeof note === "string") &&
    Number.isInteger(tab) &&
    (tab as number) >= 0 &&
    Number.isInteger(row) &&
    (row as number) >= 0 &&
    (editing === undefined || editing === "answer" || editing === "note")
  );
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
  return { text, hit: item, hitTo: paintedWidth(text.replace(/\s+$/, "")) };
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
  /** The controls of the top rule: a step each, and Close or its question. */
  private captionCells: Cell[] = [];
  private hoverTab?: number;
  private hoverClose?: CloseAction;
  private hoverReview?: number;
  private hoverButton?: number;
  /** The row under the mouse: bold, while the pointer stays on the keyboard's row. */
  private hoverRow?: number;
  private reviewOffset = 0;
  private reviewMaxOffset = 0;
  /** The footer's row, the cells of its buttons and what each does, by its place. */
  private footer?: { row: number; cells: Cell[]; acts: (() => void)[] };

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly questions: readonly Question[],
    private readonly done: (result: QuestionsResult) => void,
    /** Answers from an earlier round, preselected so re-answering starts from them. */
    previous: readonly QuestionAnswer[] = [],
    saved?: QuestionsDraft,
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
    this.row = this.firstChoice();
    this.input = new Input({ prompt: "", placeholder: "Your answer" });
    this.noteInput = new Input({ prompt: "", placeholder: "Your note" });
    if (
      isQuestionsDraft(saved) &&
      saved.drafts.length === questions.length &&
      saved.notes.length === questions.length
    ) {
      this.drafts = saved.drafts.map((draft, index) => ({
        ...draft,
        picked: draft.picked.filter((picked) => picked < questions[index]!.options.length),
      }));
      this.notes = [...saved.notes];
      this.tab = Math.max(0, Math.min(saved.tab, this.tabs.length - 1));
      this.row = Math.min(saved.row, Math.max(0, this.items().length - 1));
      if (saved.editing) this.startEditing(saved.editing);
    }
  }

  snapshot(): QuestionsDraft {
    this.keepDraft();
    return {
      drafts: this.drafts.map((draft) => ({ ...draft, picked: [...draft.picked] })),
      notes: [...this.notes],
      tab: this.tab,
      row: this.row,
      ...(this.editing ? { editing: this.editing } : {}),
    };
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

  private items(): ChoiceItem[] {
    const question = this.question;
    if (!question) return [];
    const items: ChoiceItem[] = question.options.map((_, index) => ({ kind: "option", index }));
    items.push({ kind: "custom" });
    items.push({ kind: "note" });
    return items;
  }

  /** Return to the answer already given, or start on the first option. */
  private firstChoice(): number {
    const index = this.questionIndex;
    const draft = index === undefined ? undefined : this.drafts[index];
    return draft?.picked[0] ?? (draft?.text.trim() ? this.question!.options.length : 0);
  }

  private move(step: number): void {
    if (this.editing) return;
    if (this.tabKind.kind === "review") {
      this.scrollReview(step);
      return;
    }
    const items = this.items();
    if (items.length === 0) return;
    this.row = (this.row + (step % items.length) + items.length) % items.length;
    this.warning = undefined;
    this.tui.requestRender();
  }

  private goTab(tab: number): void {
    this.keepDraft();
    this.clearHover();
    this.questionOffset = 0;
    this.previewOffset = 0;
    this.previewFor = undefined;
    this.reviewOffset = 0;
    this.tab = Math.max(0, Math.min(tab, this.tabs.length - 1));
    this.row = this.firstChoice();
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

  private scrollReview(step: number): void {
    const next = Math.max(0, Math.min(this.reviewMaxOffset, this.reviewOffset + step));
    if (next === this.reviewOffset) return;
    this.reviewOffset = next;
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
    this.editingInput.handleInput("\x05"); // continue the saved draft at its end
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
    // replacing them. The footer action confirms the whole set.
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
    if (this.editing) this.stopEditing();
    this.clearHover();
    this.confirming = true;
    this.warning = undefined;
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
      case "review":
        this.goTab(item.question);
        return;
    }
  }

  handleInput(data: string): void {
    if (this.clearHover()) this.tui.requestRender();
    if (this.editing) {
      this.handleEditingInput(data);
      return;
    }
    if (this.confirming) {
      // Enter confirms the discard; any other key keeps the draft.
      if (matchesKey(data, Key.enter)) this.cancel();
      else {
        this.confirming = false;
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
      if (this.tabKind.kind === "review") this.scrollReview(step);
      else if (this.previewMax > 0) this.scrollPreview(step);
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
    if (data === "s" && this.question?.multiSelect) {
      if (!isAnswered(this.drafts[this.questionIndex!]!)) {
        this.warning = "Pick an option or write an answer first";
        this.tui.requestRender();
        return;
      }
      this.advance();
      return;
    }
    if (this.tabKind.kind === "review") {
      if (matchesKey(data, Key.enter)) this.submit();
      else {
        const index = digitChoice(data);
        if (index >= 0 && index < this.questions.length) this.goTab(index);
      }
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

  private clearHover(): boolean {
    const changed =
      this.hoverTab !== undefined ||
      this.hoverReview !== undefined ||
      this.hoverButton !== undefined ||
      this.hoverRow !== undefined ||
      this.hoverClose !== undefined;
    this.hoverTab = this.hoverReview = this.hoverButton = this.hoverClose = undefined;
    this.hoverRow = undefined;
    return changed;
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const x = event.x - captionFrameLayout.x;
    const row = event.y - captionFrameLayout.y;
    const onCaption = event.y === 0 ? cellAt(this.captionCells, event.x)?.hit : undefined;
    const tab =
      !this.confirming && onCaption?.startsWith("step:")
        ? { act: Number(onCaption.slice(5)) }
        : undefined;
    const pressed = this.footer?.row === row ? cellAt(this.footer.cells, x) : undefined;
    const button = pressed && {
      start: pressed.start,
      act: this.footer?.acts[Number(pressed.hit.slice(4))] ?? (() => undefined),
    };
    const close = closeOf(onCaption);
    if (event.type === "move") {
      const item = !this.confirming && x >= 0 ? this.itemAt(x, row) : undefined;
      const review = item?.kind === "review" ? item.question : undefined;
      const over =
        item && !this.editing ? this.items().findIndex((other) => sameItem(other, item)) : -1;
      const hoverRow = over < 0 ? undefined : over;
      if (
        this.hoverTab !== tab?.act ||
        this.hoverButton !== button?.start ||
        this.hoverReview !== review ||
        this.hoverRow !== hoverRow ||
        this.hoverClose !== close
      ) {
        this.hoverClose = close;
        this.hoverTab = tab?.act;
        this.hoverButton = button?.start;
        this.hoverReview = review;
        this.hoverRow = hoverRow;
        this.tui.requestRender();
      }
    }
    if (event.button === "left" && (tab || button || close)) {
      if (event.type === "press") return { handled: true, focus: true };
      if (event.type === "click") {
        if (close === "close") this.askCancel();
        else if (close === "discard") this.handleInput("\r");
        else if (close === "keep") this.handleInput("\x1b");
        else if (tab) this.goTab(tab.act);
        else button?.act();
        return { handled: true };
      }
    }
    if (x < 0 || row < 0) return undefined;
    if (this.confirming) return undefined;
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
    const item = this.itemAt(x, row);
    if (!item) return undefined;
    const index = this.items().findIndex((candidate) => sameItem(candidate, item));
    // The mouse's row was marked above; only a press moves the keyboard's.
    if (event.type === "move") return { handled: true };
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
      // `x` counts from the frame's inset, which the pointer column stands in.
      const prefix =
        cellWidth(field === "note" ? CARD_INSET + NOTE_LABEL : this.writeInLead(index)) - INSET;
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
    this.captionCells = [];
    this.reviewMaxOffset = 0;
    this.footer = undefined;
    this.previewCells = undefined;
    this.previewMax = 0;
    this.questionRows = { start: 0, end: 0 };
    this.questionMaxOffset = 0;
    if (width < MIN_WIDTH) return [clamp("Question: widen terminal; esc cancel", width)[0] ?? ""];
    const { theme, question } = this;
    const hasPreview = question?.options.some((option) => option.preview !== undefined) ?? false;
    const split = hasPreview && width >= tokens.splitFrom;
    const inset = 2 * captionFrameLayout.x;
    const contentWidth = split ? widthCap("split", width) : Math.min(width, tokens.prose + inset);
    const inner = contentWidth - inset;
    const budget = Math.max(
      9,
      Math.min(MAX_ROWS, this.tui.terminal.rows - RESERVED_ROWS) - captionFrameLayout.chrome,
    );
    const rows = question
      ? this.questionBody(question, inner, budget, split, hasPreview)
      : this.reviewBody(inner, budget);
    rows.forEach((row, index) => {
      // The mouse counts from the frame's inset; a question's rows start before it.
      const shift = question ? INSET : 0;
      if (row.hit)
        this.hits.set(index, { item: row.hit, to: (row.hitTo ?? inner + shift) - shift });
    });
    const hover = this.hoverButton === undefined ? undefined : { x: this.hoverButton, y: 0 };
    const actions = this.confirming ? undefined : this.footerActions();
    const buttons = actions && buttonRow(actions.keys, inner, { hover })[0];
    // The frame's own rows, round a body that is painted already: its fields are pi's inputs.
    const [top, gap, notice, footer, bottom] = captionFrame({
      width,
      title: question?.header.trim() || "Questions",
      caption:
        this.tabs.length > 1
          ? (available) =>
              steps(
                this.tabs.map((tab, index) => ({
                  short: tab.kind === "question" ? String(tab.index + 1) : "Review",
                  name: tab.kind === "question" ? this.headerOf(tab.index) : undefined,
                  current: index === this.tab,
                  hovered: index === this.hoverTab,
                  done: tab.kind === "question" && isAnswered(this.drafts[tab.index]!),
                  hit: `step:${index}`,
                })),
                Math.min(widthCap("split", width) - captionFrameLayout.reserved, available),
              )?.spans
          : undefined,
      close: { confirming: this.confirming, hover: this.hoverClose },
      body: [],
      footer: buttons,
      notice: this.warning ? { spans: [span(this.warning, { role: "warning" })] } : undefined,
    }).map((row) => paintLine(theme, row, width));
    this.captionCells = top?.cells ?? [];
    if (actions && footer)
      this.footer = {
        row: rows.length + 1,
        // The footer's cells are the frame's, which sets its rows in.
        cells: footer.cells.map((cell) => ({
          ...cell,
          start: cell.start - captionFrameLayout.x,
          end: cell.end - captionFrameLayout.x,
        })),
        acts: actions.acts,
      };
    // A question's rows bring their own pointer column, which stands in the frame's inset.
    const pad = question ? "" : " ".repeat(captionFrameLayout.x);
    const room = width - 2 * captionFrameLayout.x + (question ? captionFrameLayout.x : 0);
    const set = (text: string) => fitPainted(pad + fitPainted(text, room), width);
    return [
      fitPainted(top?.text ?? "", width),
      set(gap?.text ?? ""),
      ...rows.map(({ text }) => set(text)),
      fitPainted(notice?.text ?? "", width),
      fitPainted(footer?.text ?? "", width),
      bottom?.text ?? "",
    ];
  }

  private headerOf(index: number): string {
    return this.questions[index]!.header.trim() || "Question";
  }

  private questionBody(
    question: Question,
    inner: number,
    budget: number,
    split: boolean,
    hasPreview: boolean,
  ): BodyRow[] {
    const { theme } = this;
    const choiceWidth = split ? Math.floor((inner - GAP.length) * tokens.splitRatio) : inner;
    const multiple = question.multiSelect === true;
    const dim = (line: string) => paintText(theme, line, { role: "dim" });
    const title = draw(
      theme,
      headingRows(
        {
          title: question.question,
          label: this.tabs.length === 1 ? "Q1" : "",
          active: true,
        },
        inner + INSET,
      ),
      inner + INSET,
    );
    const titleRoom = Math.max(2, Math.floor(budget / 4));
    this.questionMaxOffset = Math.max(0, title.length - titleRoom);
    this.questionOffset = Math.min(this.questionOffset, this.questionMaxOffset);
    const shown = title.slice(this.questionOffset, this.questionOffset + titleRoom);
    if (this.questionMaxOffset > 0) {
      const index = this.questionOffset < this.questionMaxOffset ? shown.length - 1 : 0;
      shown[index] = cutPainted(shown[index]!, inner + INSET - 2) + dim(" …");
    }

    this.questionRows = { start: 0, end: shown.length };
    const heading = shown.map((text) => ({ text }));

    const stackedRows = hasPreview && !split ? Math.max(2, Math.min(7, Math.floor(budget / 3))) : 0;
    const room = Math.max(2, budget - heading.length - 1);
    const listRoom = Math.max(2, room - stackedRows);
    const items = this.items();
    const blocks = items.map((item, i) => this.itemBlock(item, i, choiceWidth, Infinity));
    const height = (blocks: BodyRow[][]) => blocks.reduce((n, block) => n + block.length, 0);
    const withoutGaps = (blocks: BodyRow[][]) =>
      blocks.map((block) => (block[0]?.text === "" ? block.slice(1) : block));
    let compact = blocks;
    if (multiple && height(compact) > listRoom) compact = withoutGaps(compact);
    if (height(compact) > listRoom) {
      compact = items.map((item, i) => this.itemBlock(item, i, choiceWidth, 2));
      if (multiple && height(compact) > listRoom) compact = withoutGaps(compact);
    }
    let list = this.window(compact, listRoom);
    if (hasPreview) {
      const left = split ? choiceWidth + GAP.length : 0;
      const preview = this.preview(inner - left, split ? room : stackedRows);
      const top = heading.length + 1 + (split ? 0 : list.length);
      this.previewCells = { top, bottom: top + preview.length, left };
      if (split) {
        list = Array.from({ length: Math.max(list.length, preview.length) }, (_, i) => {
          const row = list[i];
          return {
            ...row,
            text: fitPainted(row?.text ?? "", choiceWidth + INSET) + GAP + (preview[i] ?? ""),
          };
        });
      } else {
        list.push(...preview.map((text) => ({ text: CARD_INSET + text })));
      }
    }
    return sectionsOf<BodyRow>({ text: "" }, heading, list);
  }

  private reviewBody(width: number, room: number): BodyRow[] {
    const blocks = this.questions.map((_, index) => {
      const item = { kind: "review", question: index } as const;
      const answers = this.valuesOf(index);
      const hasWriteIn = Boolean(this.drafts[index]!.text.trim());
      return draw(
        this.theme,
        summary(
          {
            label: String(index + 1),
            title: this.headerOf(index),
            values: answers.map((text, i) => ({
              text,
              literal: hasWriteIn && i === answers.length - 1,
            })),
            note: this.notes[index]?.trim(),
            hovered: index === this.hoverReview,
          },
          width,
        ),
        width,
      ).map((line) => target(line, item));
    });
    const spaced = sectionsOf<BodyRow>({ text: "" }, ...blocks);
    if (spaced.length <= room) return spaced;
    const compact = blocks.flat();
    if (compact.length <= room) return compact;
    const limit = room - 1;
    this.reviewMaxOffset = spaced.length - limit;
    this.reviewOffset = Math.min(this.reviewOffset, this.reviewMaxOffset);
    const end = this.reviewOffset + limit;
    return [
      ...spaced.slice(this.reviewOffset, end),
      {
        text: paintText(this.theme, `Lines ${this.reviewOffset + 1}–${end} of ${spaced.length}`, {
          role: "dim",
        }),
      },
    ];
  }

  /** The footer's buttons, and what the one with `hit` `key:<n>` does. */
  private footerActions(): { keys: Button[]; acts: (() => void)[] } {
    const acts: (() => void)[] = [];
    const action = (label: string, hotkey: string, input: string, isLit = false): Button => {
      acts.push(() => this.handleInput(input));
      return { label, hotkey, isLit, hit: `key:${acts.length - 1}` };
    };
    const enter = (label: string, isLit = false) => action(label, "enter", "\r", isLit);
    const done = (keys: Button[]) => ({ keys, acts });
    if (this.editing) return done([enter("Save", true), action("Back", "esc", "\x1b")]);
    if (this.tabKind.kind === "review") {
      const ready = this.drafts.every(isAnswered);
      return done([enter(ready ? "Send" : "Answer first", ready)]);
    }
    const option = this.items()[this.row]?.kind === "option";
    const lead = this.question?.multiSelect
      ? action(
          this.tabs.length === 1 ? "Send" : "Continue",
          "s",
          "s",
          isAnswered(this.drafts[this.questionIndex!]!),
        )
      : enter(option ? "Choose" : "Edit", true);
    const keys = [action("Note", "n", "n")];
    if (this.previewMax > 0) keys.push({ hotkey: "⇧↑↓", label: "preview" });
    if (this.questionMaxOffset > 0) keys.push({ hotkey: "⇧←→", label: "question" });
    if (this.question?.multiSelect && option) keys.push({ hotkey: "space", label: "toggle" });
    return done([lead, ...keys]);
  }

  private letter(i: number): string {
    return String.fromCharCode(65 + i);
  }

  private writeInLead(i: number): string {
    return `${GAP}${this.letter(i)} › `;
  }

  private itemBlock(item: ChoiceItem, i: number, width: number, detailLines: number): BodyRow[] {
    const { theme, question } = this;
    const dim = (line: string) => paintText(theme, line, { role: "dim" });
    const at = i === this.row;
    const draft = this.drafts[this.questionIndex ?? 0]!;
    const answered = isAnswered(draft);
    const choice = (key: string, text: string, chosen: boolean, literal = false, detail?: string) =>
      draw(
        theme,
        choiceRows(
          {
            key,
            text,
            chosen,
            active: true,
            focused: at,
            hovered: i === this.hoverRow,
            literal,
            multiple: question?.multiSelect,
            detail,
            detailLines,
          },
          width + INSET,
        ),
        width + INSET,
      ).map((line) => target(line, item));
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
          const lead = this.writeInLead(i);
          const field = this.input.render(width + INSET - cellWidth(lead))[0] ?? "";
          return [{ ...target(dim(lead) + field, item), hitTo: width + INSET }];
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
                    dim(CARD_INSET + NOTE_LABEL) +
                      (this.noteInput.render(width - cellWidth(NOTE_LABEL))[0] ?? ""),
                    item,
                  ),
                  hitTo: width + INSET,
                },
              ]
            : draw(
                theme,
                noteRows(
                  {
                    value: note,
                    active: true,
                    answered,
                    max: 3,
                    focused: at,
                    hovered: i === this.hoverRow,
                  },
                  width + INSET,
                ),
                width + INSET,
              ).map((line) => target(line, item));
        return content;
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
      const first = blocks[end++]!;
      used = first.length - (first[0]?.text === "" ? 1 : 0);
      while (end < blocks.length && used + blocks[end]!.length <= limit) {
        used += blocks[end++]!.length;
      }
    }
    const page = blocks.slice(start, end).flat();
    if (page[0]?.text === "") page.shift();
    const rows = page.slice(0, limit);
    if (used > limit) {
      const last = rows.at(-1)!;
      rows[rows.length - 1] = {
        ...last,
        text: last.text + paintText(this.theme, " …", { role: "dim" }),
      };
    }
    while (rows.length < limit) rows.push({ text: "" });
    const above = start ? `↑ ${start} above` : "";
    const below = end < blocks.length ? `↓ ${blocks.length - end} below` : "";
    rows.push({
      text: paintText(this.theme, CARD_INSET + ([above, below].filter(Boolean).join(GAP) || "…"), {
        role: "dim",
      }),
    });
    return rows;
  }

  private preview(width: number, room: number): string[] {
    // The preview follows the mouse while it is on a row, then the keyboard again.
    const shown = this.hoverRow ?? this.row;
    const option = this.question?.options[shown];
    if (this.previewFor !== shown) {
      this.previewFor = shown;
      this.previewOffset = 0;
    }
    const content = option?.preview
      ? markdownLines(this.theme, option.preview, width)
      : [paintText(this.theme, "No preview available", { role: "dim" })];
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
      paintText(this.theme, `Preview${suffix}`, { role: "dim", bold: true }),
      ...content.slice(this.previewOffset, end),
      ...Array<string>(count - (end - this.previewOffset)).fill(""),
    ];
  }
}

/** Two items are the same target when they name the same thing. */
function sameItem(left: ChoiceItem, right: Item): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "option" && right.kind === "option") return left.index === right.index;
  return true;
}
