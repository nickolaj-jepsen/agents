import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import { offer, step as stepForm, view as viewOf } from "../core/forms";
import type { Action, Current, Entry, Held, Item, View } from "./types.d.ts";
import {
  bandRows,
  bandShell,
  buttonRow,
  cellWidth,
  clamp,
  kitOf,
  note as noteLines,
  noteText,
  onlyOwnRows,
  RESERVED_ROWS,
  roleProps,
  rowsOf,
  tokens,
  type KeyChip,
} from "./ui";

// The two fields, each drawn while it is being typed in.
const PLUGIN = "answer";
const WRITE = "write";
const NOTE = "note";
/** A field's address; a key row button is already called `note`. */
const keyOf = (field: typeof WRITE | typeof NOTE) => `${field}-field`;
// What the row says focuses the band; the binding itself is in keybindings.json.
const CHORD = "alt+a";
/** Lines wider than this share of the band are guessed to wrap early, and get a row to spare. */
const WRAP_SHARE = 0.7;
/** The blank rows a form can have: under the divider and under the title, both, one or none. */
const GAPS = [2, 1, 0] as const;
type Gaps = (typeof GAPS)[number];
/** The room a review row's mark and its key take: `1: `. */
const KEY_CELLS = 3;

// Change the tag when Current changes shape: a reload keeps what the old code stored.
const current = atom({ plugin: "answer", key: "current" } as const, null, { shape: "current-10" });

/** Origins that are the person speaking; a task's notification or a peer's message isn't. */
const PERSON = new Set<string>(["composer", "bridge", "sdk", "slack-ping"]);

/**
 * What a field holds that Enter hasn't saved, null while untouched. A button that leaves
 * the item saves it first: a click must not lose what was typed.
 */
let typed: { field: typeof WRITE | typeof NOTE; text: string } | null = null;
/** The band's id for `$.ui.focus`, known once it has drawn. */
let band: string | undefined;
/** When a note was last asked for; the press that picked its answer moves the ring just after. */
let askedAt = 0;
const CLICK_MS = 500;
/** The band's rows and columns when it last drew: what the prompt box leaves it. */
let room: { rows: number; columns: number } | undefined;

const complain = ($: EngineInterface, error: unknown) =>
  $.ui.log(`answer: ${String(error)}`, { to: "debug" });

/** What is held over what was shown: the same item keeps its field and mode, the same form stays open. */
const over = (c: Current | null, held: Held): Current => {
  const view = viewOf(held.form, held.draft);
  const isSameForm = c?.view.id === view.id;
  const isSameItem = isSameForm && c?.view.step === view.step;
  return {
    held,
    view,
    editing: isSameItem ? (c?.editing ?? null) : null,
    several: isSameItem ? (c?.several ?? null) : null,
    isOpen: isSameForm ? (c?.isOpen ?? false) : false,
    stash: isSameForm ? (c?.stash ?? null) : null,
    filled: isSameForm ? (c?.filled ?? null) : null,
  };
};

const edit = ($: EngineInterface, fn: (c: Current) => Current) =>
  update($, current, (c) => (c ? fn(c) : c));

/** Whether picks toggle on the shown item: as the person set it, else as its answer already is. */
const isSeveral = (c: Current) => c.several ?? c.view.item?.isSeveral ?? false;

/** Moves the focus ring; the keyboard is the person's to give, so a band without it is left be. */
const focus = async ($: EngineInterface, key: string) =>
  band ? $.ui.focus({ requestId: band, key }).catch(() => undefined) : undefined;

/** The ring's place on what is shown: the answer or the recommendation, or the review's button. */
const home = (view: View) => (view.item ? `e${view.item.start}` : "fill");

/** One step of the draft, and what it now shows; null with no form to step. */
async function step($: EngineInterface, action: Action): Promise<View | null> {
  typed = null;
  // Aimed at the form that was showing, so a round that arrived meanwhile is left as it is.
  const shown = (await read($, current))?.view.id;
  const now = await update($, current, (was) =>
    was ? { ...over(was, stepForm(was.held, action, shown)), editing: null } : was,
  );
  return now?.view ?? null;
}

/** Takes a step and puts the ring where the new screen starts. */
async function move($: EngineInterface, action: Action) {
  const view = await step($, action);
  if (!view) return;
  await focus($, home(view));
}

/** Saves a field's typing as Enter there would; false when it couldn't be saved. */
async function keepTyped($: EngineInterface): Promise<boolean> {
  const held = typed;
  if (!held) return true;
  return Boolean(await step($, { do: held.field, text: held.text }));
}

/** Leaves the shown item for another by a button, keeping what a field held. */
async function leave($: EngineInterface, to: (shown: number) => Action) {
  const c = await read($, current);
  if (c && (await keepTyped($))) await move($, to(c.view.step));
}

/** Opens a field and hands it the ring: a note under its answer, or the write-in. */
async function ask($: EngineInterface, editing: typeof WRITE | typeof NOTE) {
  typed = null;
  await edit($, (c) => ({ ...c, editing }));
  if (editing === NOTE) askedAt = await $.clock.now();
  // A click is what gives the band the keys, and it may not have them yet: ask again, briefly.
  for (let tries = 0; tries < 4; tries++) {
    const moved = await focus($, keyOf(editing));
    if (!moved?.deny) return;
    await $.clock.sleep(60);
  }
}

/** Enter in the note: kept, and an answered question goes on to the next one unanswered. */
async function keepNote($: EngineInterface, text: string) {
  const view = await step($, { do: "note", text });
  if (!view) return;
  if (view.item?.entries.some((entry) => entry.isChosen)) await move($, { do: "next" });
  else await focus($, home(view));
}

/**
 * A press on an answer. A new one is taken and opens its note; a press on the answer already
 * taken goes on to the next question, so a second click is the way on and no timer is needed.
 * One of several toggles, and the write-in opens its field.
 */
async function choose($: EngineInterface, entry: Entry, index: number) {
  if (entry.kind === "write") return ask($, WRITE);
  const c = await read($, current);
  if (!c) return;
  // A note being typed is this question's, so it is kept whichever answer is picked.
  if (typed?.field === NOTE && !(await keepTyped($))) return;
  if (isSeveral(c)) {
    if (await step($, { do: "toggle", entry: index })) await focus($, `e${index}`);
    return;
  }
  if (entry.isChosen) return move($, { do: "next" });
  // Observed, not documented: with the ring on the pressed answer (or above it) when the note
  // field is asked for, the field shows the ring but the prompt keeps the keys. With the ring on
  // an entry below the field's place, the field takes them. So the ring goes below first.
  await focus($, `e${index + 1}`);
  if (await step($, { do: "pick", entry: index })) await ask($, NOTE);
}

/** Takes the question's recommendation, whatever it names, and goes on. */
async function accept($: EngineInterface) {
  if (await step($, { do: "accept" })) await move($, { do: "next" });
}

/**
 * Opens the form. The band shares its half of the screen with the prompt box, so a draft of
 * several lines that leaves the form short of its height is set aside until it folds.
 */
async function open($: EngineInterface) {
  const c = await read($, current);
  if (!c) return;
  const box = await $.prompt.read();
  const isCramped =
    room !== undefined &&
    room.rows - RESERVED_ROWS < heightOf(c, room.columns, false, 1) &&
    rowsOf(box.text, room.columns) >= 2;
  const isTaken = isCramped && (await $.prompt.fill({ text: "", mode: "replace" })).isFilled;
  await edit($, (was) => ({ ...was, isOpen: true, stash: isTaken ? box.text : was.stash }));
  await focus($, home(c.view));
}

/** The reply above what the person had typed, never over it. */
const placeReply = (draft: string, text: string) => (draft.trim() ? `${text}\n\n${draft}` : text);

/** What the person typed themselves: the prompt's text less the reply an earlier fill put on it. */
const ownDraft = (text: string, filled: string | null) =>
  filled && text.startsWith(filled) ? text.slice(filled.length).replace(/^\n+/, "") : text;

/** Folds the form back to its row, the answers kept, and hands the prompt its text back. */
async function close($: EngineInterface) {
  typed = null;
  const c = await read($, current);
  if (!c) return;
  if (c.stash !== null) {
    const box = await $.prompt.read();
    await $.prompt.fill({ text: placeReply(box.text, c.stash), mode: "replace" });
  }
  await edit($, (was) => ({ ...was, isOpen: false, editing: null, stash: null }));
}

/**
 * A user message the person didn't write: a slash command's record, another session's
 * message or a background task's news. The transcript's messages carry no origin, so
 * this goes by the wrapper each arrives in.
 */
const isNotPerson = (text: string) =>
  /^\s*<(command-|local-command-|task-notification)/.test(text) ||
  text.includes("<cross-session-message ");

/**
 * The round a resumed session came back to. `turn.complete` fired in the process before
 * this one, so the round is read from the transcript: the newest reply that holds one,
 * past any turn something other than the person started, as a live session keeps a round
 * through those. One the person has spoken after is left alone.
 */
async function recover($: EngineInterface) {
  if (await read($, current)) return;
  const messages = await $.session.messages();
  if (!Array.isArray(messages)) return;
  for (const message of [...messages].reverse()) {
    if (message.role === "assistant") {
      const held = message.text ? offer(null, message.text) : null;
      if (!held) continue;
      await update($, current, (c) => c ?? over(null, held));
      return;
    }
    if (!message.toolResults?.length && !isNotPerson(message.text)) return;
  }
}

/** `/answer`: opens the form, or folds it when it is already up. */
async function toggle($: EngineInterface) {
  await recover($).catch((error) => complain($, error));
  const c = await read($, current);
  if (!c) {
    $.ui.toast("Nothing to answer: the last turn asked no questions.");
    return;
  }
  await (c.isOpen ? close($) : open($));
}

/** Writes the reply into the prompt for the person to send: above their draft, in place of an earlier fill. */
async function fill($: EngineInterface, text: string): Promise<boolean> {
  const c = await read($, current);
  const box = await $.prompt.read();
  const held = [c?.stash, box.text].filter(Boolean).join("\n\n");
  const { isFilled } = await $.prompt.fill({
    text: placeReply(ownDraft(held, c?.filled ?? null), text),
    mode: "replace",
  });
  if (isFilled) {
    typed = null;
    await edit($, (was) => ({ ...was, isOpen: false, editing: null, stash: null, filled: text }));
  }
  return isFilled;
}

/**
 * Sends the reply as the person's message, leaving what they had typed in the prompt. The
 * round is answered, so it is dropped as their own send would drop it.
 */
async function send($: EngineInterface, text: string): Promise<boolean> {
  const c = await read($, current);
  if (!c) return false;
  const draft =
    c.stash !== null
      ? ownDraft(c.stash, c.filled)
      : ownDraft((await $.prompt.read()).text, c.filled);
  typed = null;
  await update($, current, () => null);
  await $.prompt.fill({ text: "", mode: "replace" }).catch(() => undefined);
  await $.prompt.submit({ text }).catch((error) => complain($, error));
  if (draft) await $.prompt.fill({ text: draft, mode: "replace" }).catch(() => undefined);
  return true;
}

/** What a key row offers: its key, label and how it is pressed, so its width is known before it is drawn. */
type KeySpec = { hotkey: string; label: string; kind: string; isLit?: boolean };

/** The keys of the shown screen, in the order they are drawn. */
function keysOf(c: Current, isNative: boolean): KeySpec[] {
  const { view } = c;
  // A native surface has its own close control, drawn on the strip.
  const fold: KeySpec[] = isNative ? [] : [{ hotkey: "q", label: "quit", kind: "quit" }];
  if (!view.item)
    return [
      { hotkey: "h", label: "back", kind: "back" },
      { hotkey: "n", label: "note", kind: "note" },
      { hotkey: "s", label: "send", kind: "send" },
      ...fold,
    ];
  const { item } = view;
  const chosen = item.entries.some((row) => row.isChosen);
  return [
    { hotkey: "h", label: "back", kind: "back" },
    { hotkey: "l", label: "next", kind: "next", isLit: chosen },
    ...(item.canAccept
      ? [{ hotkey: "y", label: `take ${item.accepts}`, kind: "accept", isLit: !chosen }]
      : []),
    { hotkey: "s", label: "skip", kind: "skip" },
    { hotkey: "n", label: "note", kind: "note" },
    ...(item.canSeveral
      ? [{ hotkey: "m", label: "several", kind: "several", isLit: isSeveral(c) }]
      : []),
    ...fold,
  ];
}

/** Rows a key row takes at a width: it wraps once the keys outrun the line. */
function keyRows(keys: KeySpec[], columns: number) {
  const cells = keys.reduce((n, key) => n + cellWidth(`${key.hotkey}: ${key.label}`), 0);
  return Math.max(1, Math.ceil((cells + tokens.keyGap * (keys.length - 1)) / Math.max(1, columns)));
}

/** The rows one question takes besides its body: its title, entries, recommendation, a note and the keys. */
function chromeRows(c: Current, item: Item, columns: number, isNative: boolean, gaps: Gaps) {
  const entries = item.entries.reduce(
    (n, entry) =>
      n +
      rowsOf(`1: ○ ${entry.text} (recommended)`, columns) +
      (entry.detail ? rowsOf(entry.detail, columns - 3) : 0),
    0,
  );
  const said = item.recommended
    ? rowsOf(`Recommended: ${item.recommended}`, columns) + (gaps ? 1 : 0)
    : 0;
  // The divider and the gap under it, the gap under the title, a note, and the keys, wrapped
  // when narrow.
  const fixed = 1 + gaps + 1 + keyRows(keysOf(c, isNative), columns);
  // A row to spare where a line may wrap earlier than its width says.
  const texts = [item.title, item.recommended, ...item.entries.map((entry) => entry.text)];
  const slack = texts.some((text) => cellWidth(text) > columns * WRAP_SHARE) ? 1 : 0;
  return fixed + rowsOf(item.title, columns) + entries + said + slack;
}

/** How tall the form stands: as its tallest question, so going from one to the next moves nothing. */
const heightOf = (c: Current, columns: number, isNative: boolean, gaps: Gaps = 2) =>
  Math.max(
    ...c.held.form.items.map((_, step) => {
      const { item } = viewOf(c.held.form, { ...c.held.draft, step });
      if (!item) return 0;
      const shown = { ...c, view: viewOf(c.held.form, { ...c.held.draft, step }) };
      return (
        chromeRows(shown, item, columns, isNative, gaps) +
        (item.body ? rowsOf(item.body, columns) : 0)
      );
    }),
  );

/**
 * As much of a question's body as the form's rows leave once the title, entries and keys
 * are drawn: a digit only answers an entry on screen, so the body is what gives way.
 */
function fitBody(c: Current, item: Item, rows: number, columns: number, gaps: Gaps) {
  const { body } = item;
  const left = rows - chromeRows(c, item, columns, false, gaps);
  if (!body || rowsOf(body, columns) <= left) return { body, isCut: false };
  const kept: string[] = [];
  let used = 1;
  for (const line of body.split("\n")) {
    used += rowsOf(line, columns);
    if (used > left) break;
    kept.push(line);
  }
  // A code fence cut open would swallow what follows it.
  if (kept.filter((line) => /^\s*(```|~~~)/.test(line)).length % 2) kept.push("```");
  return { body: kept.join("\n").trim(), isCut: true };
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command
      .register({
        name: "answer",
        description: "Answer the questions or pick list the last turn ended on, from a form",
        immediate: true,
      })
      .catch((error) => complain($, `/answer not registered: ${String(error)}`));
    const started = await next(e);
    // A resumed session has the round's message last in its transcript.
    await recover($).catch((error) => complain($, error));
    return started;
  });

  // Only a new round replaces the form; the person's send is what drops it. A turn a
  // background task woke ends on that task's news while the round still waits.
  on("turn.complete", async ($, e, next) => {
    if (e.agentId !== undefined || e.reason !== "answer") return next(e);
    await update($, current, (c) => {
      const held = offer(c?.held ?? null, e.answer);
      return held ? over(c, held) : null;
    }).catch((error) => complain($, error));
    return next(e);
  });

  // The person's own message answers the round, or moves past it.
  on("prompt.submit", async ($, e, next) => {
    const c = PERSON.has(e.origin.kind) ? await read($, current) : null;
    if (!c) return next(e);
    await update($, current, () => null);
    const sent = await next(e);
    // A draft set aside for the open form outlives the message sent past it.
    const draft = c.stash === null ? "" : ownDraft(c.stash, c.filled);
    if (draft) await $.prompt.fill({ text: draft, mode: "replace" }).catch(() => undefined);
    return sent;
  }).catch((_$, e, next) => (next.called ? undefined : next(e)));

  on("command.run", { command: "answer" }, async ($) => {
    await toggle($);
    return { text: "" };
  });

  // Drawn in the band, not a pane: the surface docks every pane beside the transcript once
  // the terminal is wide, and a round of questions reads better over the prompt. This is the
  // plugin's own row of the band; the hook below gives it the band to itself while open.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const c = await read($, current);
    if (!c) return next(e);
    band = e.requestId;
    room = { rows: e.props.maxRows, columns: e.props.bodyColumns };
    const els = $.ui.resolve(e);
    const { Box, Text, Button, Markdown } = els;
    const kit = kitOf(els, e.surface);
    /** The kept note as drawn: the gutter dim, the words as the note's own colour. */
    const noteRows = (text: string, indent = 0) =>
      noteLines(kit, text, { indent, role: "note", italic: true });
    const { view, editing } = c;
    // The desktop app and the others that draw real controls in a proportional font: no
    // rules of dashes, no heights in rows, and room for a question's whole body.
    const isNative = e.surface !== "terminal";

    if (!c.isOpen)
      return (
        <Button key="answer" plain autoFocus onPress={() => open($)}>
          <Text {...roleProps("accent")}>{view.title}</Text>
          <Text dimColor>
            {`  ${view.answered} of ${view.count}  ${isNative ? "click to answer" : `${CHORD} then Enter, or /answer`}`}
          </Text>
        </Button>
      );

    const columns = e.props.bodyColumns;
    // A short band gives up its blank rows, the one under the divider first, before it gives up
    // the question's title.
    const gaps: Gaps = isNative
      ? 2
      : (GAPS.find((g) => heightOf(c, columns, false, g) <= e.props.maxRows - RESERVED_ROWS) ?? 0);
    const gap = isNative ? "md" : gaps >= 1 ? 1 : 0;
    // A field with what it is led by: the mark that its text carries once it is kept.
    const field = (
      key: typeof WRITE | typeof NOTE,
      lead: JSX.Element,
      placeholder: string,
      value: string,
      submitLabel: string,
      onSubmit: (text: string) => unknown,
    ) =>
      "Input" in els ? (
        <Box>
          {lead}
          <els.Input
            key={keyOf(key)}
            autoFocus
            placeholder={placeholder}
            value={value}
            submitLabel={submitLabel}
            onInput={(text) => {
              typed = { field: key, text };
            }}
            onSubmit={(text) => onSubmit(text)}
          />
        </Box>
      ) : null;
    const noteLead = (
      <Text {...roleProps("note")} italic>
        {`${tokens.glyph.noteEnd} `}
      </Text>
    );
    const back = () => leave($, (shown) => ({ do: "go", step: shown - 1 }));
    const forward = () => leave($, (shown) => ({ do: "go", step: shown + 1 }));
    const press: Record<string, () => unknown> = {
      back,
      next: forward,
      accept: () => accept($),
      skip: () => move($, { do: "skip" }),
      note: () => ask($, NOTE),
      several: () => edit($, (was) => ({ ...was, several: !isSeveral(was) })),
      quit: () => close($),
      send: async () => {
        const held = typed;
        const kept = held ? await step($, { do: "note", text: held.text }) : view;
        if (kept?.reply) await send($, kept.reply);
        else if (kept) $.ui.toast("Nothing answered yet.");
      },
    };
    const keys = buttonRow(
      kit,
      keysOf(c, isNative).map(({ hotkey, label, kind, isLit }): KeyChip => ({
        id: kind,
        hotkey,
        label,
        press: () => press[kind]?.(),
        isLit,
      })),
    );
    const unanswered = view.review.filter((row) => !row.isAnswered).map((row) => row.label);
    const height = heightOf(c, columns, isNative, gaps);
    const panelRows = bandRows(height, e.props.maxRows);
    // The rule that parts the form from the chat, and on it every question: which are
    // answered, which is shown, and a click to go to one.
    const stops = view.review.reduce((n, row) => n + cellWidth(row.label) + 5, 0);
    const questions = [
      ...view.review.map((row, i) => (
        <Button
          key={`q${i}`}
          plain
          dimColor={i !== view.step}
          onPress={() => leave($, () => ({ do: "go", step: i }))}
        >
          {/* The mark leads, so it reads as its own label's. */}
          {row.isAnswered ? (
            <Text {...roleProps("success")}>{`${tokens.glyph.done} `}</Text>
          ) : (
            <Text dimColor>{`${tokens.glyph.single.off} `}</Text>
          )}
          {i === view.step ? <Text {...roleProps("accent")}>{row.label}</Text> : row.label}
        </Button>
      )),
      <Button
        key="review"
        plain
        dimColor={!view.isReview}
        hotkey="r"
        label="review"
        onPress={() => leave($, () => ({ do: "review" }))}
      />,
    ];
    const shell = (body: JSX.Element, isRoomy = gaps === 2) =>
      bandShell(kit, {
        isRoomy,
        columns,
        height,
        maxRows: e.props.maxRows,
        title: view.isReview ? "Review" : `${view.step + 1} of ${view.count}`,
        right: { nodes: questions, width: stops + "r: review".length },
        onClose: () => close($),
        body,
        // Last, so the keys keep their row whatever the body holds.
        footer: keys,
      });

    if (!view.item) {
      const missing = `Not answered: ${unanswered.join(", ")}. Its row goes back to it.`;
      const wide = Math.max(1, columns - KEY_CELLS);
      // A question and its answer share a line when they fit; else the answer is under it.
      const lines = view.review.map((row) => {
        const answer = `→ ${row.shown}`;
        const question = `${row.label}  ${row.title}`;
        const isOne = cellWidth(`${question}  ${answer}`) <= wide;
        return {
          row,
          isOne,
          question: clamp(question, wide, { min: 1, max: 1 })[0] ?? "",
          answer: isOne ? [answer] : clamp(answer, wide, { min: 1, max: 2 }),
        };
      });
      const listRows =
        lines.reduce(
          (n, line) =>
            n +
            (line.isOne ? 1 : 1 + line.answer.length) +
            (line.row.note ? rowsOf(noteText(line.row.note, " ".repeat(KEY_CELLS)), columns) : 0),
          0,
        ) + (unanswered.length ? rowsOf(missing, columns) : 0);
      // The divider, the list, the button and the keys always show; then the reply as far as
      // the band has room: whole under a blank row, one line, or not at all.
      const fixed =
        1 + listRows + 1 + (editing === NOTE ? 1 : 0) + keyRows(keysOf(c, isNative), columns);
      const left = e.props.maxRows - RESERVED_ROWS - fixed;
      const replyAll = rowsOf(view.reply || "(nothing answered yet)", columns) + 1;
      const level = isNative || left >= replyAll + 2 ? "full" : left >= 1 ? "line" : "none";
      // A blank row under the divider too, once the whole reply fits with it.
      const isRoomy = isNative || (level === "full" && left >= replyAll + 3);
      const reply = view.reply || "(nothing answered yet)";
      return shell(
        <Box flexDirection="column" rowGap={level === "full" ? gap : 0}>
          <Box flexDirection="column">
            {lines.map(({ row, isOne, question, answer }, i) => (
              <Box key={`row${i}`} flexDirection="column">
                <Button
                  key={`item${i}`}
                  plain
                  hotkey={i < 9 ? String(i + 1) : undefined}
                  onPress={() => leave($, () => ({ do: "go", step: i }))}
                >
                  {question}
                  <Text dimColor={!row.isAnswered}>
                    {isOne
                      ? `  ${answer[0]}`
                      : answer
                          .map((line, n) => `\n${" ".repeat(KEY_CELLS + (n ? 2 : 0))}${line}`)
                          .join("")}
                  </Text>
                </Button>
                {row.note ? noteRows(row.note, KEY_CELLS) : null}
              </Box>
            ))}
            {unanswered.length ? <Text {...roleProps("warning")}>{missing}</Text> : null}
          </Box>
          {editing === NOTE
            ? field(
                NOTE,
                noteLead,
                "A note on the whole round, Enter to keep",
                view.note,
                "keep",
                (t) => keepNote($, t),
              )
            : null}
          {/* Above the reply, so the ring on the button never scrolls the questions out of view. */}
          <Button
            key="fill"
            variant="primary"
            autoFocus={editing ? undefined : true}
            label="fill the prompt"
            onPress={async () => {
              const held = typed;
              const kept = held ? await step($, { do: "note", text: held.text }) : view;
              if (kept?.reply) await fill($, kept.reply);
              else if (kept) $.ui.toast("Nothing answered yet.");
            }}
          />
          {level === "full" ? (
            <Box flexDirection="column">
              <Text dimColor>The reply:</Text>
              <Text>{reply}</Text>
            </Box>
          ) : level === "line" ? (
            <Text dimColor>
              {clamp(`The reply: ${reply.replace(/\n\s*/g, "  ")}`, columns, { min: 1, max: 1 })[0]}
            </Text>
          ) : null}
        </Box>,
        isRoomy,
      );
    }

    const { item } = view;
    const several = isSeveral(c);
    const laid = isNative
      ? { body: item.body, isCut: false }
      : fitBody(c, item, panelRows, columns, gaps);
    // The write-in is always last.
    const writeIn = item.entries.length - 1;
    const chosen = item.entries.findIndex((row) => row.isChosen);
    // A note sits under the answer it is about; with none yet, under the entries.
    const noteAt = chosen >= 0 && chosen < writeIn ? chosen : writeIn - 1;
    // Yours, so it reads apart from the option's own dim lines above it, typed or kept.
    // An answered question with no note offers one as a row, for a click to open.
    const note =
      editing === NOTE ? (
        <Box paddingLeft={3}>
          {field(
            NOTE,
            noteLead,
            "A note on this answer, or Enter to go on",
            item.note,
            "next",
            (t) => keepNote($, t),
          )}
        </Box>
      ) : item.note ? (
        <Box paddingLeft={3}>
          <Button key="note-line" plain onPress={() => ask($, NOTE)}>
            {noteRows(item.note)}
          </Button>
        </Box>
      ) : chosen >= 0 ? (
        <Box paddingLeft={3}>
          <Button key="note-add" plain dimColor onPress={() => ask($, NOTE)}>
            {`${tokens.glyph.noteEnd} add a note`}
          </Button>
        </Box>
      ) : null;
    /** One-of-many rows are ○ ●, several-of-many □ ■, as the kit has them. */
    const markOf = (row: Entry) => {
      const glyph = several && row.kind === "option" ? tokens.glyph.multi : tokens.glyph.single;
      return row.isChosen ? glyph.on : glyph.off;
    };
    const entry = (row: Entry, k: number) => (
      <Button
        key={`e${k}`}
        plain
        // The write-in waits dim until it holds an answer.
        dimColor={row.kind === "write" && !item.written}
        hotkey={k < 9 ? String(k + 1) : undefined}
        autoFocus={!editing && k === item.start ? true : undefined}
        onPress={() => choose($, row, k)}
      >
        {`${markOf(row)} `}
        {row.kind === "write" ? `✎ ${item.written || row.text}` : row.text}
        {row.isRecommended ? <Text dimColor> (recommended)</Text> : null}
        {/* Inside the button, so a click on any of the option's lines picks it. */}
        {row.detail && !isNative ? (
          <Text
            dimColor
          >{`\n${" ".repeat(KEY_CELLS)}${row.detail.replace(/\n/g, `\n${" ".repeat(KEY_CELLS)}`)}`}</Text>
        ) : null}
      </Button>
    );
    // A native button holds one line, so there the detail is its own text under it.
    const option = (row: Entry, k: number) =>
      isNative && row.detail ? (
        <Box key={`option${k}`} flexDirection="column">
          {entry(row, k)}
          <Box paddingLeft={4}>
            <Text dimColor>{row.detail}</Text>
          </Box>
        </Box>
      ) : (
        entry(row, k)
      );
    return shell(
      <Box flexDirection="column" rowGap={gap}>
        <Box flexDirection="column">
          <Text weight="semibold">{item.title}</Text>
          {laid.body ? <Markdown key="body" text={laid.body} /> : null}
          {laid.isCut ? <Text dimColor>… more above</Text> : null}
        </Box>
        <Box flexDirection="column">
          {item.entries.slice(0, writeIn).map((row, k) => (
            <Box key={`row${k}`} flexDirection="column">
              {option(row, k)}
              {k === noteAt ? note : null}
            </Box>
          ))}
          {noteAt < 0 ? note : null}
          {/* The write-in is a row like the others until it is written in. */}
          {editing === WRITE
            ? field(
                WRITE,
                <Text>{"✎ "}</Text>,
                "Write your own answer",
                item.written,
                "save",
                (t) => move($, { do: "write", text: t }),
              )
            : item.entries.slice(writeIn).map((row) => option(row, writeIn))}
        </Box>
        {item.recommended ? (
          <Markdown key="recommended" text={`**Recommended:** ${item.recommended}`} />
        ) : null}
      </Box>,
    );
  });

  // The open form has the band to itself: the other plugins' rows wait until it folds.
  on("ui.render", { component: "AbovePromptList", plugin: "*" }, async ($, e, next) => {
    const c = await read($, current);
    if (e.props.hasSurvey || !c?.isOpen) return next(e);
    return next(onlyOwnRows(e, PLUGIN));
  });

  // The person's own moves of the ring over the form.
  on("ui.focus", async ($, e, next) => {
    const c =
      e.component === "AbovePrompt" && e.origin.kind === "person" ? await read($, current) : null;
    if (!c?.isOpen || !c.view.item || !e.element) return next(e);
    // The press that picked an answer puts the ring on it just after its note took the ring.
    if (
      c.editing === NOTE &&
      /^e\d+$/.test(e.element) &&
      (await $.clock.now()) - askedAt < CLICK_MS
    )
      return next({ ...e, element: keyOf(NOTE) });
    const moved = await next(e);
    if (moved.deny) return moved;
    // A write-in field left untouched is a row again; only a press opens it.
    if (c.editing === WRITE && e.element !== keyOf(WRITE) && typed === null)
      await edit($, (was) => ({ ...was, editing: null }));
    return moved;
  }).catch((_$, e, next) => (next.called ? undefined : next(e)));
};
