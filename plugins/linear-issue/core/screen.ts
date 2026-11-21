/**
 * The draft's terminal screen, written once from kit components: pi lays it in a sheet over the
 * transcript, Claude Code in a pane. What a key or a click does is decided here too, so both
 * clients act alike. The kit comes from the mod's copy, the one folder both halves can reach.
 */
import type { Button } from "../claude/kit/buttons/contract.ts";
import { buttonRow } from "../claude/kit/buttons/terminal.ts";
import { choiceHit, choiceOf, type ChoiceListItem } from "../claude/kit/card/contract.ts";
import { CARD_INSET, choice, choiceList } from "../claude/kit/card/terminal.ts";
import { fieldHit, fieldOf, type Field } from "../claude/kit/fields/contract.ts";
import { fields } from "../claude/kit/fields/terminal.ts";
import { closeHit, closeOf } from "../claude/kit/frame/contract.ts";
import {
  blank,
  block,
  cellWidth,
  clamp,
  hovered,
  inline,
  line,
  literal,
  slotLine,
  span,
  spansWidth,
  truncate,
  type Line,
  type Span,
} from "../claude/kit/lines.ts";
import { prose, scrollBy, scrolled } from "../claude/kit/prose/terminal.ts";
import { tokens } from "../claude/kit/tokens.ts";
import { labelOf, PRIORITIES, type Form, type Option } from "./draft.ts";

export const TITLE = "Linear draft";
export const DISCARD_PROMPT = "Discard draft?";

const FIELDS = ["team", "status", "priority", "labels", "project"] as const;
export type FieldId = (typeof FIELDS)[number];

/** The letter that opens each field: Linear's own for status, priority and labels. */
const FIELD_KEY: Record<FieldId, string> = {
  team: "T",
  status: "S",
  priority: "P",
  labels: "L",
  project: "J",
};
const FIELD_LABEL: Record<FieldId, string> = {
  team: "Team",
  status: "Status",
  priority: "Priority",
  labels: "Labels",
  project: "Project",
};
const TITLE_KEY = "E";

export type View = {
  /** The draft, its title being typed, one field's choices, or what to do about a duplicate. */
  step: "review" | "title" | "duplicate" | { pick: FieldId };
  /** Lines of the description scrolled past. */
  top: number;
  /** The keyboard's row among a field's choices, or the answer chosen for a duplicate. */
  focus: number;
  /** Discard was pressed: the buttons' row asks before the draft goes. */
  isConfirming: boolean;
  /** Open the issue in the browser once it is filed. */
  opens: boolean;
  /** When this step was come to: an Enter right after it was meant for the step before. */
  since: number;
};

export const startView = (opens = false): View => ({
  step: "review",
  top: 0,
  focus: 0,
  isConfirming: false,
  opens,
  since: 0,
});

export type Room = {
  /** Cells a row has. */
  width: number;
  /** Rows the body, the notice and the buttons may take together. */
  rows: number;
  /** The keyboard is here: keys are in the accent. */
  isActive?: boolean;
  /**
   * Escape and Space reach the screen, so it can name them. Claude Code's pane closes on
   * Escape and hands any key it does not bind, Space among them, to the prompt.
   */
  hasAllKeys?: boolean;
  /** Rows the client's own text field takes: more than one where it wraps what is typed. */
  fieldRows?: number;
  /** The control under the pointer, where the client reports it. */
  hover?: string;
};

export type Drawn = {
  body: Line[];
  /** Over the buttons, under a blank row of its own: a duplicate found, or the search for one. */
  notice?: Line;
  footer: Line[];
  /** The description's window as drawn, for the next step of it. */
  window: { top: number; max: number; page: number };
};

/**
 * What a key or a click asks of the client; the view's own changes are already made. Only
 * Enter, or a press on the lit button, ever asks for something to be written to Linear.
 */
export type Effect =
  | { do: "create"; open: boolean }
  | { do: "comment"; open: boolean }
  | { do: "discard" }
  | { do: "hide" }
  | { do: "retry" }
  | { do: "team"; team: string }
  | { do: "set"; patch: Partial<Form> };

export type Intent =
  /** A letter or a digit, lowercase. */
  | { key: string }
  | { enter: true }
  | { escape: true }
  | { space: true }
  /** An arrow: a step of the keyboard's row, or of the description's window. */
  | { move: number }
  /** The wheel, in lines. */
  | { scroll: number }
  /** A control pressed. */
  | { hit: string }
  /** The client's text field was submitted. */
  | { title: string };

const HIT = {
  title: "title",
  duplicate: "duplicate",
  up: "scroll:up",
  down: "scroll:down",
  done: "act:done",
  opens: "act:opens",
  act: (name: string) => `act:${name}`,
};

const GAP = " ".repeat(tokens.gutter);
/** An Enter this soon after what it does changed was meant for what stood there before. */
const GRACE_MS = 600;
/** The key that keeps the draft, and the one that goes back, where Escape is not the screen's. */
const KEEP_KEY = "k";
/**
 * Where letters are the answers' own, digits are free: one goes back, and one ticks the row
 * under the pointer in a list with more rows than there are letters.
 */
const BACK_KEY = "0";
const TICK_KEY = "1";

// ---- fields

const isMultiple = (id: FieldId) => id === "labels";

const optionsOf = (f: Form, id: FieldId): Option[] =>
  id === "team"
    ? f.teams
    : id === "status"
      ? f.statuses
      : id === "priority"
        ? PRIORITIES
        : id === "labels"
          ? f.labels
          : f.projects;

const chosenOf = (f: Form, id: FieldId): string[] =>
  id === "team"
    ? [f.team]
    : id === "status"
      ? [f.state]
      : id === "priority"
        ? [String(f.priority)]
        : id === "labels"
          ? f.labelIds
          : [f.project];

function fieldRows(f: Form): Field[] {
  const chosen = f.labels.filter((l) => f.labelIds.includes(l.value)).map((l) => l.label);
  const values: Record<FieldId, { value: string; empty?: boolean }> = {
    team: { value: labelOf(f.teams, f.team) ?? f.team },
    status: { value: labelOf(f.statuses, f.state) ?? "" },
    priority: {
      value: labelOf(PRIORITIES, String(f.priority)) ?? "No priority",
      empty: f.priority === 0,
    },
    labels: { value: chosen.join(", ") || "None", empty: chosen.length === 0 },
    project: f.project
      ? { value: labelOf(f.projects, f.project) ?? "" }
      : { value: "None", empty: true },
  };
  return FIELDS.map((id) => ({
    key: FIELD_KEY[id],
    label: FIELD_LABEL[id],
    hit: fieldHit(id),
    ...values[id],
  }));
}

/** The keys a list of choices has: a letter each while they last. */
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const choiceItems = (options: readonly Option[]): ChoiceListItem[] =>
  options.map((o, i) => ({ key: LETTERS[i] ?? "", text: o.label }));

// ---- drawing

/** The column a pointer stands in, kept by every row so each step has one left edge. */
const MARGIN = CARD_INSET;
const KEYED = TITLE_KEY.length + tokens.gutter;

/** The cells a row's words have: the room less the pointer's column. */
const innerOf = (room: Room) => Math.max(8, room.width - MARGIN.length);

const set = (l: Line, lead: Span = span(MARGIN)): Line =>
  l.spans.length ? { ...l, spans: [lead, ...l.spans] } : l;
const setAll = (lines: Line[]): Line[] => lines.map((l) => set(l));

const keyRole = (isActive?: boolean) => (isActive ? ("accent" as const) : ("dim" as const));

type Entry = Button | false | undefined;

const buttons = (all: Entry[], room: Room, lead: Span[] = []): Line[] =>
  setAll(
    buttonRow(
      all.filter((b): b is Button => Boolean(b)),
      innerOf(room),
      { wrap: true, lead },
    ),
  );

/** Rows a line takes: one, but for the client's text field, which may have several. */
const rowsOf = (l: Line) => (l.slot?.kind === "input" ? (l.slot.rows ?? 1) : 1);

/** Lines to exactly `rows` rows: cut, or blank ones added, so the buttons under them stay put. */
function pad(lines: Line[], rows: number): Line[] {
  const out: Line[] = [];
  let used = 0;
  for (const l of lines) {
    if (used + rowsOf(l) > rows) break;
    out.push(l);
    used += rowsOf(l);
  }
  for (; used < rows; used++) out.push(blank());
  return out;
}

const said = (text: string, role: "dim" | "error" | "text" | "warning" = "dim"): Line =>
  set(line([span(text, { role })]));

/** The title after its key, hanging from its first line. */
const titleLines = (f: Form, room: Room, max: number, isActive?: boolean): Line[] =>
  setAll(
    block(literal(f.title || "Untitled", { role: "text", bold: true }), innerOf(room), {
      lead: [span(TITLE_KEY, { role: keyRole(isActive) }), span(GAP)],
      max,
      hit: HIT.title,
    }),
  );

/** The description as it is filed, the line saying where it came from quiet under it. */
function description(f: Form, room: Room): Line[] {
  const text = prose(f.description, innerOf(room));
  // The session's id at its end is filed with it, for whoever reads the issue later.
  const source = f.source
    ? block(inline(f.source.replace(/ · session \S+$/, ""), { role: "dim" }), innerOf(room), {
        max: 1,
      })
    : [];
  return source.length ? [...text, blank(), ...source] : text;
}

/** The row over the buttons: a duplicate found, the search for one, or that there is none. */
function noticeOf(f: Form, room: Room): Line {
  const inner = innerOf(room);
  if (f.duplicate) {
    const { issue, title } = f.duplicate;
    const words =
      [`${issue} may already cover this`, `${issue} may cover this`].find(
        (w) => cellWidth(w) <= inner,
      ) ?? truncate(`${issue}?`, inner);
    const left = inner - cellWidth(words) - tokens.gutter;
    return set(
      line(
        [
          span(words, { role: "warning" }),
          ...(left > 8 ? [span(GAP + truncate(title, left), { role: "dim" })] : []),
        ],
        HIT.duplicate,
      ),
    );
  }
  // The row is kept either way, so the search ending moves nothing.
  return said(
    truncate(
      f.isCheckingDuplicates
        ? "Looking for an issue that already covers it…"
        : "No open issue seems to cover this",
      inner,
    ),
  );
}

const errorLines = (f: Form, room: Room): Line[] =>
  f.error ? clamp(f.error, innerOf(room), { max: 2 }).map((t) => said(t, "error")) : [];

const sending = (): Line[] => [said("Sending to Linear…")];

/** Whether the issue is opened once it is filed: a box to tick, never a way to file. */
const opensButton = (view: View): Button => ({
  hotkey: "o",
  label: `${view.opens ? tokens.glyph.multi.on : tokens.glyph.multi.off} Then open in Linear`,
  hit: HIT.opens,
});

/** The box of `opensButton` in the accent while it is ticked, as a chosen answer's mark is. */
const ticked = (lines: Line[]): Line[] =>
  lines.map((l) => ({
    ...l,
    spans: l.spans.flatMap((s) =>
      s.hit === HIT.opens && s.text.startsWith(tokens.glyph.multi.on)
        ? [
            { ...s, text: tokens.glyph.multi.on, role: "accent" as const, bold: true },
            { ...s, text: s.text.slice(tokens.glyph.multi.on.length) },
          ]
        : [s],
    ),
  }));

/**
 * The question Discard asks, in the row it was pressed in: while it stands, it is the only
 * thing Enter answers.
 */
const confirmFooter = (room: Room): Line[] =>
  buttons(
    [
      { hotkey: "enter", label: "Discard", hit: closeHit("discard"), essential: true },
      {
        hotkey: room.hasAllKeys ? "esc" : KEEP_KEY,
        label: "Keep",
        hit: closeHit("keep"),
        essential: true,
      },
    ],
    room,
    [span(DISCARD_PROMPT, { role: "warning" })],
  );

function reviewFooter(f: Form, view: View, room: Room): Line[] {
  if (f.phase === "filing") return sending();
  if (view.isConfirming) return confirmFooter(room);
  return [
    ...errorLines(f, room),
    ...ticked(
      buttons(
        [
          {
            hotkey: "enter",
            // A duplicate is decided on before anything is filed: Enter goes to that.
            label: f.duplicate ? "Create…" : "Create",
            hit: HIT.act("create"),
            isLit: true,
          },
          { hotkey: "d", label: "Discard", hit: HIT.act("discard") },
          opensButton(view),
        ],
        room,
      ),
    ),
  ];
}

type Layout = {
  isInline: boolean;
  /** A blank row under the title. */
  hasGap: boolean;
  /** Rows of the description it is drawn with at least. */
  bodyMin: number;
  /** No blank rows at all: the description stands on the fields and the notice on it. */
  isTight?: boolean;
};

// From the roomiest to the tightest: the first whose rows fit is drawn. The title is whole in
// each: the description gives up its rows first, then the blank ones go.
const LAYOUTS: Layout[] = [
  { isInline: false, hasGap: true, bodyMin: 5 },
  { isInline: true, hasGap: true, bodyMin: 3 },
  { isInline: true, hasGap: false, bodyMin: 2 },
  { isInline: true, hasGap: false, bodyMin: 0, isTight: true },
];

/** Rows a layout keeps over the description, and under it: a blank one, and the notice's. */
const over = (l: Layout) => (l.isTight ? 0 : 1);
const under = (l: Layout, hasNotice: boolean) => (l.isTight ? 0 : 1) + (hasNotice ? 1 : 0);

/**
 * Whether the draft's notice has its row: always, so the search ending moves nothing, but in
 * the tightest room, where only a duplicate or the search for one is worth a row.
 */
const noticed = (f: Form, l: Layout) =>
  !l.isTight || Boolean(f.duplicate) || f.isCheckingDuplicates;

/**
 * The fields side by side: all of them on one row, else without those that hold nothing. The
 * tightest room never gives a row to a field that holds nothing.
 */
function inlineFields(f: Form, room: Room, isActive?: boolean, isTight = false): Line[] {
  // Side by side, a team is its key: its name is in the row it has to itself in a taller room.
  const all = fieldRows(f).map((row) =>
    row.hit === fieldHit("team") ? { ...row, value: f.team } : row,
  );
  const whole = fields(all, innerOf(room), { active: isActive, inline: true });
  if (whole.length <= 1 && !isTight) return whole;
  const held = fields(
    all.filter((row) => !row.empty),
    innerOf(room),
    { active: isActive, inline: true },
  );
  return isTight || held.length < whole.length ? held : whole;
}

/** The rows over the description in a layout: the title and the fields. */
function headOf(f: Form, room: Room, l: Layout, reserved: number, open?: FieldId): Line[] {
  const isActive = room.isActive && !open;
  const rows = open
    ? // A room short of rows keeps only the field whose choices are open.
      fields(
        fieldRows(f).filter((row) => !l.isInline || row.hit === fieldHit(open)),
        innerOf(room),
        { active: isActive },
      )
    : l.isInline
      ? inlineFields(f, room, isActive, l.isTight)
      : fields(fieldRows(f), innerOf(room), { active: isActive });
  // The title takes every row it wants that the fields and what is under them do not need.
  // In the tightest room it leaves one row, kept to say the description is there.
  const cue = l.isTight && !open && f.description.trim() ? 1 : 0;
  const max = Math.max(1, room.rows - rows.length - (l.hasGap ? 1 : 0) - reserved - cue);
  return [
    // In the tightest room open choices take the title's rows too.
    ...(open && l.isTight ? [] : titleLines(f, room, max, isActive)),
    ...(l.hasGap ? [blank()] : []),
    ...setAll(rows),
  ];
}

/** The rows the draft takes in this room, which its own steps keep so nothing jumps. */
function heightOf(f: Form, view: View, room: Room): number {
  const footer = reviewFooter(
    { ...f, phase: "ready", error: null },
    { ...view, isConfirming: false },
    room,
  );
  const text = description(f, room);
  let height = room.rows;
  for (const l of LAYOUTS) {
    const reserved = under(l, noticed(f, l)) + footer.length;
    const fixed = headOf(f, room, l, reserved).length + over(l) + reserved;
    height = fixed + Math.min(text.length, Math.max(0, room.rows - fixed));
    if (room.rows - fixed >= Math.min(l.bodyMin, text.length)) break;
  }
  return Math.max(1, Math.min(room.rows, height));
}

/** The window of `lines` that keeps `at` in sight. */
function following(lines: Line[], rows: number, at: number) {
  if (rows <= 2) return scrolled(lines, { rows, top: at });
  let top = Math.max(0, at - Math.floor(rows / 2));
  for (let tries = 0; tries < 4; tries++) {
    const w = scrolled(lines, { rows, top });
    const from = w.top > 0 ? w.top + 1 : 0;
    const to = from + w.rows.length - (w.top > 0 ? 1 : 0) - (w.top < w.max ? 1 : 0);
    if (at < from) top = Math.max(0, w.top - 1);
    else if (at >= to) top = w.top + 1;
    else return w;
  }
  return scrolled(lines, { rows, top });
}

/** A field's choices, set in under its row, a row each so their window counts answers. */
function choicesOf(f: Form, id: FieldId, view: View, room: Room): Line[] {
  const options = optionsOf(f, id);
  const chosen = chosenOf(f, id);
  const width = innerOf(room) - KEYED;
  return choiceList(
    {
      items: choiceItems(options).map((item) => ({
        ...item,
        text: truncate(item.text, Math.max(1, width - 8)),
      })),
      chosen: options.flatMap((o, i) => (chosen.includes(o.value) ? [i] : [])),
      focus: view.focus,
      multiple: isMultiple(id),
      active: room.isActive,
    },
    width,
  );
}

const pickFooter = (id: FieldId, room: Room): Line[] =>
  isMultiple(id)
    ? // Several can be ticked, so Enter is not a pick: it is done with them.
      buttons(
        [
          { hotkey: "enter", label: "Done", hit: HIT.done, isLit: true },
          // The row under the pointer: by Space, or by a digit where Space never arrives.
          {
            hotkey: room.hasAllKeys ? "space" : TICK_KEY,
            label: "Tick",
            hit: HIT.act("choose"),
          },
        ],
        room,
      )
    : buttons(
        [
          { hotkey: "enter", label: "Choose", hit: HIT.act("choose"), isLit: true },
          { hotkey: room.hasAllKeys ? "esc" : BACK_KEY, label: "Back", hit: HIT.act("back") },
        ],
        room,
      );

function review(f: Form, view: View, room: Room): Drawn {
  const isTyping = view.step === "title";
  const open = typeof view.step === "object" ? view.step.pick : undefined;
  const footer = view.isConfirming
    ? confirmFooter(room)
    : isTyping
      ? buttons(
          [
            { hotkey: "enter", label: "Save", hit: HIT.act("save"), isLit: true },
            { hotkey: room.hasAllKeys ? "esc" : "", label: "Cancel", hit: HIT.act("back") },
          ],
          room,
        )
      : open
        ? pickFooter(open, room)
        : reviewFooter(f, view, room);
  // The notice is the draft's own: a step inside it gives that row to what it shows.
  const isOwn = !isTyping && !open;
  let hasNotice = isOwn;
  const height = heightOf(f, view, room);
  const text = description(f, room);
  const choices = open ? choicesOf(f, open, view, room) : [];

  let head: Line[] = [];
  let rest = 0;
  let budget = 1;
  let layout = LAYOUTS[0]!;
  for (const l of LAYOUTS) {
    layout = l;
    hasNotice = isOwn && noticed(f, l);
    head = headOf(f, room, l, under(l, hasNotice) + footer.length, open);
    // A short draft grows for its choices rather than show a window of a handful.
    const wanted = head.length + choices.length + under(l, hasNotice) + footer.length;
    budget = Math.max(
      1,
      Math.min(room.rows, Math.max(height, wanted)) - under(l, hasNotice) - footer.length,
    );
    rest = budget - head.length - over(l);
    if (rest >= (open ? Math.min(3, choices.length) : Math.min(l.bodyMin, text.length))) break;
  }
  // The client's field may take more rows than the title it stands in for did.
  const titled = head.filter((l) => l.hit === HIT.title).length;
  if (isTyping) rest -= (room.fieldRows ?? 1) + 1 - titled;
  rest = Math.max(0, rest);

  // Open choices take the rows they need from the description. Left one row, it only says how
  // much of it there is; left none, the blank row over it goes too.
  const textRows = Math.max(0, rest - choices.length);
  const nested = span(MARGIN + " ".repeat(KEYED));
  const list = open
    ? following(choices, textRows ? choices.length : rest + over(layout), view.focus).rows.map(
        (l) => set(l, nested),
      )
    : [];
  const window = scrolled(text, {
    rows: textRows,
    top: view.top,
    hits: { up: HIT.up, down: HIT.down },
  });

  if (isTyping) {
    // The client's own field stands where the title did, over a rule that marks it as one.
    const lead = [span(MARGIN), span(TITLE_KEY, { role: keyRole(room.isActive) }), span(GAP)];
    const width = Math.max(1, room.width - spansWidth(lead));
    head = [
      slotLine({ kind: "input", lead, width, rows: room.fieldRows ?? 1 }),
      line([
        span(" ".repeat(spansWidth(lead))),
        span(tokens.glyph.rule.repeat(width), { role: "border" }),
      ]),
      ...head.slice(titled),
    ];
  }
  // The choices stand under their own field's row, the fields after it below them.
  const at = open ? head.map((l) => l.hit).lastIndexOf(fieldHit(open)) + 1 : head.length;
  const body = [
    ...head.slice(0, at),
    ...list,
    ...head.slice(at),
    ...(textRows ? [...(layout.isTight ? [] : [blank()]), ...setAll(window.rows)] : []),
  ];
  return {
    body: [...pad(body, budget), ...(layout.isTight ? [] : [blank()])],
    notice: hasNotice ? noticeOf(f, room) : undefined,
    footer,
    window: { top: window.top, max: window.max, page: Math.max(1, textRows - 2) },
  };
}

/** How far along an issue is, from Linear's kind of status. */
const STATUS: Record<string, string> = {
  triage: "In triage",
  backlog: "Backlog",
  unstarted: "Not started",
  started: "In progress",
};

/** The answers to a duplicate: a comment on the issue there is, or the new one anyway. */
const ANSWERS = 2;

/**
 * The page a duplicate is decided on. What Enter sends is always in sight: both answers and the
 * comment come first, and what the issue says of itself gives way to them row by row.
 */
function duplicate(f: Form, view: View, room: Room): Drawn {
  const d = f.duplicate;
  if (!d) return review(f, { ...view, step: "review" }, room);
  const footer =
    f.phase === "filing"
      ? sending()
      : view.isConfirming
        ? confirmFooter(room)
        : [
            ...errorLines(f, room),
            ...ticked(
              buttons(
                [
                  {
                    hotkey: "enter",
                    label: view.focus === 0 ? "Send comment" : "Create issue",
                    hit: HIT.act("send"),
                    isLit: true,
                  },
                  {
                    hotkey: room.hasAllKeys ? "esc" : BACK_KEY,
                    label: "Back",
                    hit: HIT.act("back"),
                  },
                  opensButton(view),
                ],
                room,
              ),
            ),
          ];
  const inner = innerOf(room);
  // A blank row over the buttons, while the room has one to give.
  const gap = room.rows - footer.length >= 7 ? 1 : 0;
  const budget = Math.max(1, room.rows - gap - footer.length);
  const answer = (index: number, text: string, detail?: string) =>
    choice(
      {
        key: LETTERS[index] ?? "",
        text,
        detail,
        detailLines: 1,
        chosen: view.focus === index,
        focused: view.focus === index,
        active: room.isActive,
        hit: choiceHit(index),
      },
      room.width,
    );
  // The comment as it will be posted, under its answer, behind a bar that sets it apart.
  const under = [span(" ".repeat(6)), span(`${tokens.glyph.rail} `, { role: "dim" })];
  const posted = block(inline(d.comment, { role: "text" }), room.width, {
    lead: under,
    hang: under,
    hit: choiceHit(0),
  });
  // Cut, its last row says how much is not shown, rather than trail off under the lit button.
  const comment = (max: number): Line[] =>
    posted.length <= max
      ? posted
      : [
          ...posted.slice(0, Math.max(0, max - 1)),
          line(
            [...under, span(`${posted.length - Math.max(0, max - 1)} more rows`, { role: "dim" })],
            choiceHit(0),
          ),
        ];
  const answers = (max = Infinity, hasDetail = true): Line[] => [
    ...answer(0, `Comment on ${d.issue} instead`),
    ...comment(max),
    ...answer(1, "Create the new issue anyway", hasDetail ? f.title : undefined),
  ];
  const warning = `${d.issue} may already cover this`;
  const meta = [d.team, STATUS[d.status ?? ""]].filter(Boolean).join(" · ");
  const title = (max: number) =>
    setAll(block(literal(d.title, { role: "text", bold: true }), inner, { max }));
  const heads: Line[][] = [
    [
      said(truncate(warning, inner), "warning"),
      ...title(2),
      ...(meta ? [said(meta)] : []),
      ...(d.about ? setAll(block(literal(d.about, { role: "dim" }), inner, { max: 3 })) : []),
      blank(),
    ],
    [
      said(truncate(warning, inner), "warning"),
      ...title(2),
      ...(meta ? [said(meta)] : []),
      blank(),
    ],
    [said(truncate(warning, inner), "warning"), ...title(1)],
    // One row of it: the issue's key, and as much of its title as fits.
    [
      set(
        line([
          span(d.issue, { role: "warning" }),
          span(GAP + truncate(d.title, Math.max(1, inner - cellWidth(d.issue) - GAP.length)), {
            role: "dim",
          }),
        ]),
      ),
    ],
  ];
  // Too short for all of it: the answers and the whole comment alone, then with what fits of it.
  const cut = Array.from({ length: Math.max(1, budget) }, (_, i) => Math.max(1, budget - i));
  const body =
    [
      ...heads.map((head) => [...head, ...answers()]),
      // The whole comment comes before a row about the issue it would go on.
      answers(),
      answers(Infinity, false),
      ...cut.map((max) => answers(max, false)),
    ].find((l, i, all) => l.length <= budget || i === all.length - 1) ?? [];
  return {
    body: [...body, ...(gap ? [blank()] : [])],
    footer,
    window: { top: 0, max: 0, page: 1 },
  };
}

/** What is being filed from, quiet, so the wait shows it was heard. */
const seedLines = (f: Form, room: Room, max: number): Line[] => {
  const text = f.seed.text.trim();
  if (!text) return [said("From the recent conversation")];
  return [
    said(f.seed.kind === "note" ? "From your note" : "From what was flagged"),
    ...clamp(text, innerOf(room), { max }).map((t) => said(t)),
  ];
};

/**
 * A page that waits or failed: what it says, then the note it has, then a blank row over the
 * buttons. A room too short for the note's words leaves its heading out too.
 */
function withSeed(lines: Line[], f: Form, room: Room, footerRows: number): Line[] {
  const rows = Math.max(1, room.rows - footerRows);
  const said_ = lines.slice(0, rows);
  const left = rows - said_.length - 2;
  const seed = left >= 2 ? seedLines(f, room, left - 1) : [];
  return [
    ...said_,
    ...(seed.length ? [blank(), ...seed] : []),
    ...(rows > said_.length ? [blank()] : []),
  ];
}

function drafting(f: Form, view: View, room: Room): Drawn {
  const step = (label: string, state: "done" | "now" | "next"): Line =>
    set(
      line([
        state === "done"
          ? span(`${tokens.glyph.done} `, { role: "success" })
          : span(state === "now" ? `${tokens.glyph.bullet} ` : "  ", { role: "text", bold: true }),
        span(
          truncate(label, innerOf(room) - 2),
          state === "now" ? { role: "text", bold: true } : { role: "dim" },
        ),
      ]),
    );
  const isWriting = f.stage === "writing";
  const footer = view.isConfirming
    ? confirmFooter(room)
    : buttons([{ hotkey: "d", label: "Discard", hit: HIT.act("discard") }], room);
  return {
    body: withSeed(
      [
        step("Reading your teams and labels", isWriting ? "done" : "now"),
        step("Writing the issue", isWriting ? "now" : "next"),
      ],
      f,
      room,
      footer.length,
    ),
    footer,
    window: { top: 0, max: 0, page: 1 },
  };
}

function failed(f: Form, view: View, room: Room): Drawn {
  const footer = view.isConfirming
    ? confirmFooter(room)
    : buttons(
        [
          { hotkey: "enter", label: "Try again", hit: HIT.act("retry"), isLit: true },
          { hotkey: "d", label: "Discard", hit: HIT.act("discard") },
        ],
        room,
      );
  return {
    body: withSeed(
      [
        set(line([span("The draft was not written", { role: "error", bold: true })])),
        ...clamp(f.error ?? "Something went wrong", innerOf(room), { max: 4 }).map((t) =>
          said(t, "text"),
        ),
      ],
      f,
      room,
      footer.length,
    ),
    footer,
    window: { top: 0, max: 0, page: 1 },
  };
}

/** The screen for `form` in `room`. */
export function draw(form: Form | null, view: View, room: Room): Drawn {
  // While Discard asks, no key but its answer does anything: the keys stand quiet.
  const quiet: Room = view.isConfirming ? { ...room, isActive: false } : room;
  const drawn = ((): Drawn => {
    if (!form)
      return {
        body: [said("No Linear draft open.")],
        footer: [],
        window: { top: 0, max: 0, page: 1 },
      };
    if (form.phase === "drafting") return drafting(form, view, quiet);
    if (form.phase === "failed") return failed(form, view, quiet);
    if (view.step === "duplicate") return duplicate(form, view, quiet);
    return review(form, view, quiet);
  })();
  if (room.hover === undefined) return drawn;
  return {
    ...drawn,
    body: hovered(drawn.body, room.hover),
    notice: drawn.notice && hovered([drawn.notice], room.hover)[0],
    footer: hovered(drawn.footer, room.hover),
  };
}

// ---- acting

/** The letters and digits the screen takes now, lowercase: what a client has to bind. */
export function keysOf(form: Form | null, view: View): string[] {
  if (!form || form.phase === "filing") return [];
  if (view.isConfirming) return [KEEP_KEY];
  if (form.phase === "drafting" || form.phase === "failed") return ["d"];
  if (view.step === "title") return [];
  if (view.step === "duplicate") return ["a", "b", "o", BACK_KEY];
  if (typeof view.step === "object")
    return [
      ...choiceItems(optionsOf(form, view.step.pick)).flatMap((item) =>
        item.key ? [item.key.toLowerCase()] : [],
      ),
      BACK_KEY,
      ...(isMultiple(view.step.pick) ? [TICK_KEY] : []),
    ];
  return [TITLE_KEY.toLowerCase(), ...FIELDS.map((id) => FIELD_KEY[id].toLowerCase()), "o", "d"];
}

type Acted = { view: View; effects: Effect[] };

/** What choosing `option` of a field does to the draft. */
function chooseEffect(f: Form, id: FieldId, option: Option): Effect {
  switch (id) {
    case "team":
      return { do: "team", team: option.value };
    case "status":
      return { do: "set", patch: { state: option.value } };
    case "priority":
      return { do: "set", patch: { priority: Number(option.value) } };
    case "project":
      return { do: "set", patch: { project: option.value } };
    case "labels":
      return {
        do: "set",
        patch: {
          labelIds: f.labelIds.includes(option.value)
            ? f.labelIds.filter((l) => l !== option.value)
            : [...f.labelIds, option.value],
        },
      };
  }
}

/**
 * What `intent` does on the screen as it was `drawn`: the view after it, and what the client
 * has to do.
 * @param now The time, where the client has one: an Enter that would write to Linear is
 * ignored for a moment after what it does changed, as one typed for what stood there before.
 */
export function act(
  form: Form | null,
  view: View,
  intent: Intent,
  drawn?: Drawn,
  now?: number,
): Acted {
  const none: Acted = { view, effects: [] };
  const to = (step: View["step"], more: Partial<View> = {}): Acted => ({
    view: { ...view, ...more, step, since: now ?? 0 },
    effects: [],
  });
  const isEarly = (...since: number[]) =>
    now !== undefined && since.some((at) => now - at < GRACE_MS && now >= at);
  const hide: Acted = { view: { ...view, isConfirming: false }, effects: [{ do: "hide" }] };
  if (!form) return "escape" in intent ? hide : none;
  const hit = "hit" in intent ? intent.hit : undefined;
  const key = "key" in intent ? intent.key : undefined;
  const close = closeOf(hit);
  if (close === "close") return hide;

  // Discard's question takes every key until it has its answer.
  if (view.isConfirming) {
    if (("enter" in intent || close === "discard") && !isEarly(view.since))
      return { view: startView(view.opens), effects: [{ do: "discard" }] };
    if ("enter" in intent || close === "discard" || "move" in intent || "scroll" in intent)
      return none;
    return { view: { ...view, isConfirming: false }, effects: [] };
  }
  if (form.phase === "filing") return "escape" in intent ? hide : none;
  if (key === "d" && view.step !== "duplicate" && typeof view.step !== "object")
    if (view.step !== "title")
      return { view: { ...view, isConfirming: true, since: now ?? 0 }, effects: [] };
  if (hit === HIT.act("discard"))
    return { view: { ...view, isConfirming: true, since: now ?? 0 }, effects: [] };
  if (form.phase === "drafting" || form.phase === "failed") {
    if ("escape" in intent) return hide;
    if (form.phase === "failed" && ("enter" in intent || hit === HIT.act("retry")))
      return { view: startView(view.opens), effects: [{ do: "retry" }] };
    return none;
  }
  if (key === "o" && (view.step === "review" || view.step === "duplicate"))
    return { view: { ...view, opens: !view.opens }, effects: [] };
  if (hit === HIT.opens) return { view: { ...view, opens: !view.opens }, effects: [] };

  if (typeof view.step === "object") {
    const id = view.step.pick;
    const options = optionsOf(form, id);
    const multiple = isMultiple(id);
    const back = to("review", { focus: 0 });
    const choose = (index: number): Acted => {
      const option = options[index];
      if (!option) return none;
      const effect = chooseEffect(form, id, option);
      return multiple
        ? { view: { ...view, focus: index }, effects: [effect] }
        : { ...back, effects: chosenOf(form, id).includes(option.value) ? [] : [effect] };
    };
    const count = Math.max(1, options.length);
    if ("move" in intent)
      return {
        view: { ...view, focus: (((view.focus + intent.move) % count) + count) % count },
        effects: [],
      };
    if ("scroll" in intent) return act(form, view, { move: Math.sign(intent.scroll) }, drawn, now);
    if ("escape" in intent || hit === HIT.done || hit === HIT.act("back")) return back;
    if (key === BACK_KEY) return back;
    // Where several can be ticked, Enter is done with them; Space or a letter ticks one.
    if ("enter" in intent) return multiple ? back : choose(view.focus);
    if ("space" in intent || hit === HIT.act("choose")) return choose(view.focus);
    if (key === TICK_KEY && multiple) return choose(view.focus);
    if (key !== undefined) {
      const at = choiceItems(options).findIndex((item) => item.key.toLowerCase() === key);
      return at < 0 ? none : choose(at);
    }
    const at = choiceOf(hit);
    if (at >= 0) return choose(at);
    // Its own row closes it; another field's opens that one in its place.
    const other = fieldOf(hit) as FieldId | undefined;
    if (other === id) return back;
    if (other && FIELDS.includes(other)) return openPick(form, to("review").view, other);
    if (hit === HIT.title) return to("title");
    return none;
  }

  if (view.step === "title") {
    if ("title" in intent)
      return {
        ...to("review"),
        effects: [
          {
            do: "set",
            patch: {
              title: intent.title.replace(/\s*\n\s*/g, " ").trim() || form.title,
              titleRevision: form.titleRevision + 1,
            },
          },
        ],
      };
    // Enter reaches the screen here only when the client's field no longer has the keyboard.
    // What was typed goes: the next field is a new one, with the title as it is.
    if ("escape" in intent || "enter" in intent || hit === HIT.act("back"))
      return {
        ...to("review"),
        effects: [{ do: "set", patch: { titleRevision: form.titleRevision + 1 } }],
      };
    return none;
  }

  if (view.step === "duplicate" && form.duplicate) {
    if ("escape" in intent || hit === HIT.act("back") || key === BACK_KEY) return to("review");
    if ("move" in intent)
      return { view: { ...view, focus: (view.focus + 1) % ANSWERS }, effects: [] };
    if (key === "a" || key === "b")
      return { view: { ...view, focus: key === "a" ? 0 : 1 }, effects: [] };
    const at = choiceOf(hit);
    if (at >= 0 && at < ANSWERS) return { view: { ...view, focus: at }, effects: [] };
    // A press counts as Enter does: the lit button of the step before stood in this cell.
    if ("enter" in intent || hit === HIT.act("send"))
      return isEarly(view.since)
        ? none
        : { view, effects: [{ do: view.focus === 0 ? "comment" : "create", open: view.opens }] };
    return none;
  }

  // The draft itself.
  const window = drawn?.window ?? { top: view.top, max: Infinity, page: 3 };
  const step = (by: number): Acted => ({
    view: { ...view, top: scrollBy(window, by) },
    effects: [],
  });
  if ("escape" in intent) return hide;
  if ("enter" in intent || hit === HIT.act("create")) {
    // A press too: Choose, Done and Save stood where Create stands, so a double click lands here.
    if (isEarly(form.settledAt, view.since)) return none;
    // A duplicate is decided on its own page: nothing is filed past it unseen.
    if (form.duplicate) return to("duplicate", { focus: 0 });
    return { view, effects: [{ do: "create", open: view.opens }] };
  }
  if (hit === HIT.duplicate && form.duplicate) return to("duplicate", { focus: 0 });
  if ("move" in intent) return step(intent.move * 3);
  if ("scroll" in intent) return step(intent.scroll);
  if (hit === HIT.up) return step(-window.page);
  if (hit === HIT.down) return step(window.page);
  if (key === TITLE_KEY.toLowerCase() || hit === HIT.title) return to("title");
  const field =
    FIELDS.find((id) => FIELD_KEY[id].toLowerCase() === key) ??
    (fieldOf(hit) as FieldId | undefined);
  if (field && FIELDS.includes(field)) return openPick(form, to("review").view, field);
  return none;
}

function openPick(f: Form, view: View, id: FieldId): Acted {
  const at = optionsOf(f, id).findIndex((o) => chosenOf(f, id).includes(o.value));
  return { view: { ...view, step: { pick: id }, focus: Math.max(0, at) }, effects: [] };
}

/** Whether `hit` is one of the screen's own controls: what a client's focus hook asks. */
export const isControl = (hit: string) =>
  hit === HIT.title ||
  hit === HIT.duplicate ||
  hit.startsWith("scroll:") ||
  hit.startsWith("act:") ||
  hit.startsWith("field:") ||
  hit.startsWith("frame:") ||
  choiceOf(hit) >= 0;
