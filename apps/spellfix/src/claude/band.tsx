import type { Picker, Report } from "./types.d.ts";
import type { StatusBandTerminal } from "@agents/kit-band/contract.ts";
import { statusBand as statusBandGui } from "@agents/kit-band/gui.tsx";
import { statusBand as statusBandLines } from "@agents/kit-band/terminal.ts";
import type { Button } from "@agents/kit-buttons/contract.ts";
import { buttonRow as buttonRowGui } from "@agents/kit-buttons/gui.tsx";
import { buttonRow as buttonRowLines } from "@agents/kit-buttons/terminal.ts";
import { sections } from "@agents/kit-card/gui.tsx";
import { span, type Line, type Span } from "@agents/kit-core/lines.ts";
import type { NoticeStatus } from "@agents/kit-notice/contract.ts";
import { notice as noticeGui } from "@agents/kit-notice/gui.tsx";
import { notice as noticeLines } from "@agents/kit-notice/terminal.ts";
import type { Gui } from "@agents/kit-core/paint/gui.tsx";
import { paintLines, ring, stack } from "@agents/kit-core/paint/claude.tsx";

/** What the band draws from: the mod's atoms and whether a personal dictionary is set. */
export type BandView = {
  picker: Picker | null;
  report: Report | null;
  added: string[];
  isBusy: boolean;
  count: number;
  hasPersonal: boolean;
  /** The control the keyboard is on, once the band has it (`ui.focus`); none until then. */
  focus: string | null;
};

/** What a press does: `toggle` opens or closes the picker; the others answer one of its keys. */
export type BandActions = {
  toggle: () => unknown;
  pick: (key: string) => unknown;
  answer: (key: string) => unknown;
};

/** The elements of a terminal event, which the kit paints its lines with. */
type Els = Parameters<typeof paintLines>[0];

const arrows = (change: string) => change.replace("→", " → ");

/** The control that opens the picker, or closes it. */
const TOGGLE = "spellfix";

/**
 * The controls the keyboard steps through, in the order Tab takes them: the picks, the actions,
 * and the count line last.
 */
export function focusOrder(v: BandView): string[] {
  const { picker: p } = v;
  const toggle = p || (!v.isBusy && v.count > 0) ? [TOGGLE] : [];
  if (p) {
    const ai = p.isAiDone && !p.ai ? [] : ["ai"];
    return [
      ...ai,
      ...suggestionButtons(p).map((b) => b.hit as string),
      ...pickerActions(v, p).map((b) => b.hit as string),
      ...toggle,
    ];
  }
  return [...(isMarked(v) ? reportActions.map((b) => b.hit as string) : []), ...toggle];
}

/** The control that has the keyboard's focus: the one it moved to, else the first. */
export const focusOf = (v: BandView): string | undefined => {
  const order = focusOrder(v);
  return v.focus !== null && order.includes(v.focus) ? v.focus : order[0];
};

/**
 * What a control of the band does, by its `hit`: the keys the picker answers, or those of the
 * report and the auto-added notice, which share `8` for undo.
 */
export function bandPress(v: BandView, a: BandActions): (hit: string) => unknown {
  return (hit) => {
    if (hit === TOGGLE) return a.toggle();
    if (hit === "ai") return a.pick("1");
    if (hit === "skip") return a.pick("s");
    if (hit === "all") return a.pick("a");
    if (hit === "add") return a.pick("d");
    if (hit === "undo") return v.picker ? a.pick("8") : a.answer("8");
    if (hit === "dismiss") return a.answer("9");
    const suggestion = /^s(\d+)$/.exec(hit);
    if (suggestion) return a.pick(String(Number(suggestion[1]) + 2));
    return undefined;
  };
}

// ---- what the band says and offers, the same on every surface

/** The count line's words; a picker opened on a typo only Haiku found has no count. */
const countText = (n: number) => (n > 0 ? `${n} misspelled` : "A typo only Haiku found");

const note = (text: string, status: NoticeStatus, isCut = false) => ({ text, status, isCut });
type Note = ReturnType<typeof note>;

/** Haiku's pick: its answer is a word to insert, until then it says what it waits for. */
const aiButton = (p: Picker, label: string): Button => ({
  hotkey: "1",
  label,
  hit: "ai",
  isLiteral: p.isAiDone,
});

const suggestionButtons = (p: Picker): Button[] =>
  p.suggestions.map((s, i) => ({ hotkey: String(i + 2), label: s, hit: `s${i}`, isLiteral: true }));

const pickerActions = (v: BandView, p: Picker): Button[] => [
  { hotkey: "s", label: "skip", hit: "skip" },
  { hotkey: "a", label: p.wantsAll ? "waiting" : "fix all", hit: "all" },
  ...(v.hasPersonal && !p.isExtra ? [{ hotkey: "d", label: "add word", hit: "add" }] : []),
  ...(v.added.length > 0 ? [{ hotkey: "8", label: "undo add", hit: "undo" }] : []),
];

const reportActions: Button[] = [
  { hotkey: "8", label: "undo", hit: "undo" },
  { hotkey: "9", label: "dismiss", hit: "dismiss" },
];

const addedNote = (words: readonly string[]) => `Added ${words.join(", ")} to the dictionary`;

/** What the picker says under its buttons: what fix all would change, and the words added. */
const pickerNotes = (v: BandView, p: Picker): Note[] => [
  ...(p.summary.length > 0
    ? [note(`Fix all changes ${p.summary.map(arrows).join(", ")}`, "dim", true)]
    : []),
  ...(v.added.length > 0 ? [note(addedNote(v.added), "dim")] : []),
];

/** What the band says once the picker is closed: the report of fix all and the words added. */
const reportNotes = (v: BandView): Note[] => [
  ...(v.report ? [note(`Fixed ${v.report.changes.map(arrows).join(", ")}`, "text")] : []),
  ...(v.added.length > 0 ? [note(addedNote(v.added), "text")] : []),
];

const isMarked = (v: BandView) => v.report !== null || v.added.length > 0;

/** The typo in its context, standing out in the role of what it is. */
const context = (p: Picker, lead: string, trail: string, isUnderlined: boolean): Span[] => [
  span(lead, { role: "dim" }),
  span(p.word, {
    role: p.isExtra ? "warning" : "error",
    bold: true,
    underline: isUnderlined || undefined,
  }),
  span(trail, { role: "dim" }),
];

// ---- the terminal

/**
 * The band in the terminal: the kit's lines painted as one block, every control a plain Button.
 * The keys sit on buttons that draw nothing, with the engine's focus ring parked beside them, so
 * the band draws the keyboard's focus itself (`ui.focus` moves it). Null when there is nothing to
 * say.
 * @param width The band's room in cells.
 */
export function terminalBand(
  els: Els,
  v: BandView,
  a: BandActions,
  width: number,
): JSX.Element | null {
  const press = bandPress(v, a);
  const focus = v.focus === null ? undefined : focusOf(v);
  const { picker: p, count: n } = v;
  const status = (hint: string, width: number): StatusBandTerminal => ({
    text: countText(n),
    hint: `${hint} ctrl+q`,
    hit: TOGGLE,
    status: "warning",
    width,
    hovered: focus === TOGGLE,
  });
  const marked = (buttons: readonly Button[]): Button[] =>
    buttons.map((b) => ({ ...b, hovered: b.hit === focus }));
  const notes = (list: readonly Note[]): Line[] =>
    list.flatMap((x) => noticeLines({ text: x.text, width, status: x.status }));
  /** `buttons` are every key the band binds, drawn or not. */
  const painted = (lines: Line[], buttons: readonly Button[]) =>
    stack(
      els,
      // First, so the ring keeps its place whatever rows the band draws.
      ring(
        els,
        () => (focus ? press(focus) : undefined),
        buttons.map((b) => ({ key: b.hotkey, press: () => press(b.hit as string) })),
      ),
      paintLines(els, lines, { press, width }),
    );

  if (p) {
    const waiting = p.wantsAi ? "waiting" : "checking";
    const ai = aiButton(p, `${p.isAiDone ? (p.ai ?? "") : waiting} (Haiku)`);
    const buttons = [ai, ...suggestionButtons(p), ...pickerActions(v, p)];
    // Haiku found nothing: its key stays, swallowed, and the row says so.
    const isMute = p.isAiDone && !p.ai;
    const lead = isMute ? [span("Haiku has no suggestion", { role: "dim" })] : [];
    return painted(
      [
        ...statusBandLines(status("close", width)),
        ...noticeLines({
          text: context(p, `…${p.before}`, `${p.after}…`, true),
          width,
          status: "text",
        }),
        ...buttonRowLines(marked(isMute ? buttons.slice(1) : buttons), width, { wrap: true, lead }),
        ...notes(pickerNotes(v, p)),
      ],
      buttons,
    );
  }

  const isMarkedNow = isMarked(v);
  const head = v.isBusy
    ? noticeLines({ text: "Checking spelling", width, status: "dim" })
    : n > 0
      ? statusBandLines(status("review", width))
      : [];
  if (head.length === 0 && !isMarkedNow) return null;
  return painted(
    [
      ...head,
      ...notes(reportNotes(v)),
      ...(isMarkedNow ? buttonRowLines(marked(reportActions), width, { wrap: true }) : []),
    ],
    isMarkedNow ? reportActions : [],
  );
}

// ---- the desktop app and VS Code

/**
 * The band on the desktop app and VS Code: the count line (its button opens, then closes, the
 * picker) with the picker or the report under it.
 */
export function guiBand(g: Gui, v: BandView): JSX.Element {
  const { picker: p, count: n } = v;
  const head = (hint: string) =>
    statusBandGui(g, { text: countText(n), hint, hit: TOGGLE, status: "warning" });
  const notes = (list: readonly Note[]) =>
    list.map((x) => noticeGui(g, { text: x.text, status: x.status, isCut: x.isCut }));

  if (p) {
    const ai: Button[] = [];
    if (p.ai || !p.isAiDone) {
      ai.push(aiButton(p, p.isAiDone ? (p.ai ?? "") : p.wantsAi ? "waiting" : "checking"));
    }
    const lead = [span(ai.length > 0 ? "Haiku" : "Haiku has no suggestion", { role: "dim" })];
    return sections(
      g,
      head("close"),
      noticeGui(g, { text: context(p, p.lead, p.trail, false), status: "text" }),
      buttonRowGui(g, { rows: [ai], lead }),
      buttonRowGui(g, { rows: [suggestionButtons(p)] }),
      ...notes(pickerNotes(v, p)),
      buttonRowGui(g, { rows: [pickerActions(v, p)] }),
    );
  }

  const marked = isMarked(v);
  return sections(
    g,
    v.isBusy
      ? noticeGui(g, { text: "Checking spelling", status: "pending" })
      : n > 0
        ? head("review")
        : null,
    ...notes(reportNotes(v)),
    marked ? buttonRowGui(g, { rows: [reportActions] }) : null,
  );
}
