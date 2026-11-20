import { atom, read, update } from "claude-code";
import type { EngineInterface, Register, SessionMessage } from "claude-code";

import {
  formId,
  offer,
  hasWork,
  startLines,
  step as stepForm,
  view as viewOf,
} from "../core/forms";
import { fitBody, GAPS, heightOf, keyRows, keysOf, KEY_CELLS, type Gaps } from "./terminal";
import {
  controlBar,
  questionCard,
  nativeRound,
  reviewTarget,
  ROUND_FOCUS,
  terminalReview,
  entryLetter,
  writeLetter,
  type RoundActions,
} from "./transcript";
import type { Action, Current, Editing, Entry, Held, RoundEditor, View } from "./types.d.ts";
import {
  actionBar,
  bandRows,
  bandShell,
  buttonRow,
  cellWidth,
  choice,
  clamp,
  excerpt,
  fieldRow,
  forSurface,
  kitOf,
  list,
  note as noteLines,
  noteText,
  onlyOwnRows,
  paneTitle,
  prose,
  RESERVED_ROWS,
  roleProps,
  rowsOf,
  stack,
  statusBand,
  tokens,
  type Kit,
  type Action as ActionSpec,
  type ChoiceOption,
  type KeyChip,
  type ListItem,
} from "./ui";

const PLUGIN = "answer";
const WRITE = "write";
const NOTE = "note";
/**
 * A field's address; a key row button is already called `note`. An Input keeps what was typed
 * until it is drawn with another value, so each opening gets an address of its own: one opened
 * after a cancel would otherwise come back holding the cancelled text.
 */
const keyOf = (field: typeof WRITE | typeof NOTE) => `${field}-field-${opened}`;
let opened = 0;
// What the row says focuses the band; the binding itself is in keybindings.json.
const CHORD = "alt+a";

// Bump the tag for incompatible changes: a reload keeps what the old code stored.
const current = atom({ plugin: "answer", key: "current" } as const, null, {
  shape: "current-11",
});
/** The round a send set aside, for `/answer` to bring back. */
const aside = atom({ plugin: "answer", key: "aside" } as const, null, {
  shape: "aside-1",
});
const transcript = atom(
  { plugin: "answer", key: "transcript" } as const,
  {},
  { shape: "transcript-1" },
);

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
const transcriptRows = new Map<string, string>();

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
    isBodyOpen: isSameItem ? (c?.isBodyOpen ?? false) : false,
    isOpen: isSameForm ? (c?.isOpen ?? false) : false,
    stash: isSameForm ? (c?.stash ?? null) : null,
    filled: isSameForm ? (c?.filled ?? null) : null,
    filledRound: isSameForm ? c?.filledRound : undefined,
    transcript: isSameForm ? c?.transcript : undefined,
    writer: isSameItem ? c?.writer : undefined,
    hasKeys: isSameForm ? (c?.hasKeys ?? false) : false,
    pending: isSameItem ? c?.pending : undefined,
    reviewCursor: isSameForm ? c?.reviewCursor : undefined,
    reviewFrom: isSameForm ? c?.reviewFrom : undefined,
  };
};

const edit = ($: EngineInterface, fn: (c: Current) => Current) =>
  update($, current, (c) => (c ? fn(c) : c));

/** Moves the focus ring; the keyboard is the person's to give, so a band without it is left be. */
const focus = async ($: EngineInterface, key: string) =>
  band ? $.ui.focus({ requestId: band, key }).catch(() => undefined) : undefined;

/** Only a focus that moved into the band says it holds the keyboard; nothing reports it leaving. */
async function keysHeld($: EngineInterface) {
  await edit($, (c) => (c && !c.hasKeys ? { ...c, hasKeys: true } : c));
}

/**
 * A press in the transcript gives the prompt the keys. Keep the field visible but mark it as
 * waiting for focus again.
 */
async function pressElsewhere($: EngineInterface, id: string): Promise<boolean> {
  let wasWriting = false;
  await update($, current, (was) => {
    if (was?.transcript !== id) return was;
    const writer = was.writer?.surface === "terminal" ? was.writer : undefined;
    wasWriting = Boolean(writer && was.editing);
    return {
      ...was,
      hasKeys: false,
      writer: undefined,
      editing: writer ? null : was.editing,
      pending: writer && was.editing ? { from: writer.from, field: was.editing } : undefined,
    };
  });
  return wasWriting;
}

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
  opened++;
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
 * The write-in opens its field.
 */
async function choose($: EngineInterface, entry: Entry, index: number) {
  if (entry.kind === "write") return ask($, WRITE);
  const c = await read($, current);
  if (!c) return;
  // A note being typed is this question's, so it is kept whichever answer is picked.
  if (typed?.field === NOTE && !(await keepTyped($))) return;
  if (entry.isChosen && !c.view.item?.isSeveral) return move($, { do: "next" });
  // Observed, not documented: the note field takes the keys only from a ring below its place, so
  // the ring goes below first.
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
    room.rows - RESERVED_ROWS < heightOf(c, room.columns, 1) &&
    rowsOf(box.text, room.columns) >= 2;
  const isTaken = isCramped && (await $.prompt.fill({ text: "", mode: "replace" })).isFilled;
  await edit($, (was) => ({
    ...was,
    isOpen: true,
    stash: isTaken ? box.text : was.stash,
  }));
  await focus($, home(c.view));
}

/** The reply above what the person had typed, never over it. */
const placeReply = (draft: string, text: string) => (draft.trim() ? `${text}\n\n${draft}` : text);

/** What the person typed themselves: the prompt's text less the reply an earlier fill put on it. */
const ownDraft = (text: string, filled: string | null) =>
  filled && text.startsWith(filled) ? text.slice(filled.length).replace(/^\n+/, "") : text;

/**
 * Whether a send carries the round's own reply: the text is what the reply says, or what the
 * form filled with the person's draft left under it (a fill puts the reply above the draft).
 */
const isOwnReply = (c: Current, text: string) =>
  [c.view.reply, c.filled ?? ""].some(
    (reply) => reply !== "" && (text === reply || text.startsWith(`${reply}\n`)),
  );

/** What a send that sets the round aside says, counting the answers it keeps. */
const asideNotice = (answered: number) =>
  answered
    ? `${answered} answer${answered === 1 ? "" : "s"} set aside: /answer brings them back.`
    : "Answers set aside: /answer brings them back.";

/** Folds the form back to its row, the answers kept, and hands the prompt its text back. */
async function close($: EngineInterface) {
  typed = null;
  const c = await read($, current);
  if (!c) return;
  if (c.stash !== null) {
    const box = await $.prompt.read();
    await $.prompt.fill({
      text: placeReply(box.text, c.stash),
      mode: "replace",
    });
  }
  await edit($, (was) => ({
    ...was,
    isOpen: false,
    editing: null,
    stash: null,
    pending: undefined,
  }));
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
async function recover($: EngineInterface, graphical = false) {
  if (await read($, current)) return;
  const messages = await $.session.messages();
  if (!Array.isArray(messages)) return;
  for (const message of [...messages].reverse()) {
    if (message.role === "assistant") {
      const held = message.text ? offer(null, message.text) : null;
      if (!held) continue;
      const id =
        graphical && held.form.kind === "round"
          ? await captureRound($, held, message.text, formId(held.form), message, false)
          : undefined;
      await update($, current, (c) => c ?? { ...over(null, held), transcript: id });
      return;
    }
    if (!message.toolResults?.length && !isNotPerson(message.text)) return;
  }
}

/** `/answer`: opens the form, or folds it when it is already up; a round set aside comes back. */
async function toggle($: EngineInterface, fullscreen = false) {
  let c = await read($, current);
  if (c?.writer) return;
  // The aside comes first: `recover` would find the round on the other side of the send that set
  // it aside, in the transcript, and offer that round empty.
  if (!c) {
    const was = await read($, aside);
    if (was) {
      await update($, aside, () => null);
      c = await update($, current, () => ({
        ...over(null, was),
        transcript: was.transcript,
      }));
    }
  }
  if (!c) await recover($).catch((error) => complain($, error));
  c ??= await read($, current);
  if (!c) {
    $.ui.toast("Nothing to answer: the last turn asked no questions.");
    return;
  }
  if (c.transcript && fullscreen) {
    await $.clock.sleep(60);
    await revealRound($, c.transcript, c.view.step, "start");
  } else await (c.isOpen ? close($) : open($));
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
    await edit($, (was) =>
      !c || was.view.id !== c.view.id || was.transcript !== c.transcript
        ? was
        : {
            ...was,
            isOpen: false,
            editing: null,
            stash: null,
            filled: text,
            filledRound: c.transcript ? c.held : undefined,
            // Filling hands the prompt the keys; the guide must not keep promising them.
            hasKeys: false,
            pending: undefined,
          },
    );
  }
  return isFilled;
}

/**
 * Sends the reply as the person's message, leaving what they had typed in the prompt. The
 * round is answered, so it is dropped as their own send would drop it; a submit the engine
 * refuses puts the round and the box back as they were.
 */
async function send($: EngineInterface, text: string): Promise<boolean> {
  const c = await read($, current);
  if (!c) return false;
  const box = await $.prompt.read();
  const draft = c.stash !== null ? ownDraft(c.stash, c.filled) : ownDraft(box.text, c.filled);
  typed = null;
  await update($, current, () => null);
  await $.prompt.fill({ text: "", mode: "replace" }).catch(() => undefined);
  // A refused submit resolves with `{ drop }`; a promise the engine rejects is one it could not
  // take at all. Either way the round the hook dropped is put back.
  const sent = await $.prompt.submit({ text, ...(c.transcript ? { asUser: true } : {}) }).then(
    (result) => !("drop" in result),
    (error) => {
      complain($, error);
      return false;
    },
  );
  if (!sent) {
    // The hook dropped the round before the engine refused the submit: put back what it had.
    await update($, current, () => c);
    await update($, aside, () => null);
    await $.prompt.fill({ text: box.text, mode: "replace" }).catch(() => undefined);
    $.ui.toast("The message didn't send: the answers are still here.");
    return false;
  }
  if (draft) await $.prompt.fill({ text: draft, mode: "replace" }).catch(() => undefined);
  return true;
}

/**
 * The key that answers an entry: the option's own letter, `w` for the write-in, a digit for
 * anything else (a pick list's rows, a yes). The letter `h` is the back key, so option H goes
 * by the ring and the pointer.
 */
function hotkeyOf(row: Entry, index: number): string | undefined {
  if (row.kind === "write") return "w";
  if (row.key) return /^[A-Ga-g]$/.test(row.key) ? row.key.toLowerCase() : undefined;
  return index < 9 ? String(index + 1) : undefined;
}

/** An entry's words: its letter is drawn as its key, so the printed `B.` is left off. */
const labelOf = (row: Entry, index: number) =>
  hotkeyOf(row, index) === row.key.toLowerCase() && row.key
    ? row.text.replace(/^[A-Ga-g][.)]\s*/, "")
    : row.text;

// Claude Code 2.1.325 returns the transcript without row IDs and rejects ranged reads.
async function recentMessages(
  $: EngineInterface,
  last: number,
): Promise<(SessionMessage & { uuid?: string })[]> {
  const range = { as: undefined, last };
  const messages = await $.session.messages(range).catch(() => $.session.messages());
  return Array.isArray(messages) ? messages : [];
}

async function captureRound(
  $: EngineInterface,
  held: Held,
  answer: string,
  turnId: string,
  recovered?: SessionMessage & { uuid?: string },
  place = true,
) {
  const message =
    recovered ??
    (await recentMessages($, 24)).findLast(
      (row) => row.role === "assistant" && row.text.trim() === answer.trim(),
    );
  if (!message) return;
  const id = message.uuid ?? turnId;
  const starts = startLines(message.text);
  if (starts.length !== held.form.items.length) return;
  const preamble = message.text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .slice(0, starts[0])
    .join("\n")
    .trimEnd();
  const placed: string[] = [];
  if (place && (await $.session.surfaces()).includes("terminal")) {
    for (let index = 0; index <= starts.length; index++) {
      const row = await $.ui.place({ id: `round-${id}-${index}` });
      if (!row.isPlaced) break;
      placed.push(row.requestId);
    }
  }
  const anchors = placed.length === starts.length + 1 ? placed : [id];
  await update($, transcript, (rounds) => ({
    ...rounds,
    [id]: {
      source: message.text.trim(),
      preamble,
      anchors,
      matchByText: !message.uuid,
    },
  }));
  return id;
}

async function findRound(
  $: EngineInterface,
  surface: RoundEditor["surface"],
  requestId: string,
  text: string,
) {
  const rounds = await read($, transcript);
  const direct = rounds[requestId];
  if (direct) return { id: requestId, round: direct };
  // Graphical clients and older terminals can identify the row only as they draw it.
  const key = `${surface}:${requestId}`;
  const source = text.trim();
  const known = transcriptRows.get(key);
  if (known && rounds[known]?.source === source) return { id: known, round: rounds[known] };
  const claimed = new Set(
    Array.from(transcriptRows).flatMap(([row, id]) => (row.startsWith(`${surface}:`) ? [id] : [])),
  );
  const match = Object.entries(rounds).findLast(
    ([id, round]) =>
      (surface !== "terminal" || round.matchByText) && !claimed.has(id) && round.source === source,
  );
  if (!match) return;
  const [id, round] = match;
  transcriptRows.set(key, id);
  return { id, round };
}

async function freezeRound($: EngineInterface, c: Current, submitted?: Held) {
  const id = c.transcript;
  if (!id) return;
  await update($, transcript, (rounds) =>
    rounds[id]
      ? {
          ...rounds,
          [id]: {
            ...rounds[id],
            frozen: submitted ?? c.held,
            sent: submitted ? (true as const) : undefined,
          },
        }
      : rounds,
  );
}

async function revealRound(
  $: EngineInterface,
  id: string,
  index: number,
  block: "start" | "nearest" | "end" = "nearest",
) {
  const round = (await read($, transcript))[id];
  const requestId = round?.anchors[index] ?? round?.anchors[0];
  if (requestId) await $.ui.scroll({ to: { requestId }, block });
}

async function changeRound(
  $: EngineInterface,
  id: string,
  index: number | ((view: View) => number),
  action?: Action | { letter: string },
) {
  return update($, current, (c) => {
    if (c?.transcript !== id || c.writer) return c;
    const here = over(
      c,
      stepForm(c.held, {
        do: "go",
        step: typeof index === "number" ? index : index(c.view),
      }),
    );
    if (action && typeof action === "object" && "letter" in action) {
      const entry = here.view.item?.entries.findIndex(
        (row) => row.kind !== "write" && entryLetter(row) === action.letter,
      );
      return entry === undefined || entry < 0
        ? here
        : over(
            here,
            stepForm(here.held, {
              do: "pick",
              entry,
            }),
          );
    }
    return action ? over(here, stepForm(here.held, action)) : here;
  });
}

async function moveRound(
  $: EngineInterface,
  id: string,
  surface: RoundEditor["surface"],
  index: number | ((view: View) => number),
) {
  const c = await changeRound($, id, index);
  if (surface === "terminal" && c?.transcript === id && !c.writer)
    await revealRound($, id, c.view.step, c.view.isReview ? "start" : "nearest");
}

async function writeRound(
  $: EngineInterface,
  id: string,
  index: number,
  field: NonNullable<Editing>,
  surface: RoundEditor["surface"],
  from = index,
  isPress = false,
) {
  // Show the field without moving the transcript or taking the prompt's keys.
  if (surface === "terminal" && isPress) {
    typed = null;
    opened++;
    await update($, current, (was) => {
      if (was?.transcript !== id || was.writer) return was;
      return {
        ...over(was, stepForm(was.held, { do: "go", step: index })),
        editing: null,
        writer: undefined,
        hasKeys: false,
        pending: { from, field },
      };
    });
    return;
  }
  const c = await update($, current, (was) => {
    if (was?.transcript !== id || was.writer) return was;
    typed = null;
    opened++;
    return {
      ...over(was, stepForm(was.held, { do: "go", step: index })),
      editing: field,
      writer: { from, surface },
      hasKeys: surface === "terminal" ? true : was.hasKeys,
      pending: undefined,
    };
  });
  if (surface === "terminal" && c?.transcript === id && c.writer) {
    await focus($, keyOf(field));
  }
}

function savedField(c: Current) {
  return c.editing === NOTE ? (c.view.item?.note ?? c.view.note) : (c.view.item?.written ?? "");
}

async function finishWriting($: EngineInterface, id: string, text?: string) {
  const before = await read($, current);
  const surface = before?.writer?.surface ?? (before?.pending ? "terminal" : undefined);
  const c = await update($, current, (was) => {
    if (was?.transcript !== id) return was;
    const field = was.editing ?? was.pending?.field;
    const from = was.writer?.from ?? was.pending?.from;
    if (!field || from === undefined) return was;
    const draft = text === undefined ? was.held : stepForm(was.held, { do: field, text });
    const held = stepForm(draft, { do: "go", step: from });
    typed = null;
    return {
      ...over(was, held),
      writer: undefined,
      editing: null,
      pending: undefined,
    };
  });
  if (surface === "terminal" && c?.transcript === id && !c.writer) {
    await focus($, ROUND_FOCUS);
    if (c.view.isReview) await revealReview($, id, c);
    else await revealRound($, id, c.view.step);
  }
}

async function replyToRound(
  $: EngineInterface,
  id: string,
  surface: RoundEditor["surface"],
  action: "fill" | "send",
) {
  const c = await read($, current);
  if (c?.transcript !== id || c.writer || !c.view.reply) return;
  if (action === "fill") await fill($, c.view.reply);
  else {
    await freezeRound($, c);
    const sent = await send($, c.view.reply);
    if (sent) await freezeRound($, c, c.held);
    if (sent && surface === "terminal") {
      // The send can settle before the terminal has drawn a row for it.
      await $.clock.sleep(60);
      const messages = await recentMessages($, 8);
      const sentAt = messages.findLastIndex(
        (row) => row.role === "user" && row.text === c.view.reply,
      );
      if (sentAt < 0) return;
      const requestId = messages.slice(sentAt).findLast((row) => row.uuid)?.uuid;
      if (requestId) await $.ui.scroll({ to: { requestId }, block: "end" });
    }
  }
}

function roundActions(
  $: EngineInterface,
  id: string,
  surface: RoundEditor["surface"],
): RoundActions {
  // A transcript click that takes focus from the editor only parks the field.
  const press = async (run: () => unknown) => {
    if (surface === "terminal") {
      if (await pressElsewhere($, id)) return;
    } else {
      const c = await read($, current);
      if (c?.transcript !== id) return;
      // Keep the controls live. Leaving an editor via another form action keeps
      // what was typed; an untouched field doesn't answer the question.
      if (c.writer) {
        await finishWriting($, id, typed?.field === c.editing ? typed?.text : undefined);
      }
    }
    return run();
  };
  const edit = (question: number, field: NonNullable<Editing>, from?: number) =>
    press(() => writeRound($, id, question, field, surface, from ?? question, true));
  return {
    go: (index) =>
      press(async () => {
        const c = await read($, current);
        if (c?.transcript !== id) return;
        if (index === c.view.count) return toggleReview($, id, surface);
        if (c.view.isReview && surface === "terminal") return openReviewQuestion($, id, index);
        await moveRound($, id, surface, index);
        if (c.view.isReview && surface === "desktop")
          await $.ui
            .scroll({ to: { key: `question-${index}-card` }, block: "start" })
            .catch(() => undefined);
      }),
    details:
      surface !== "desktop"
        ? undefined
        : (index) =>
            press(() =>
              update($, current, (c) => {
                if (c?.transcript !== id || c.writer) return c;
                const at = over(c, stepForm(c.held, { do: "go", step: index }));
                return { ...at, isBodyOpen: c.view.step !== index || !c.isBodyOpen };
              }),
            ),
    pick: (question, entry) => press(() => changeRound($, id, question, { do: "pick", entry })),
    edit,
    clear: (question) => press(() => changeRound($, id, question, { do: "clear" })),
    accept: (question) => press(() => changeRound($, id, question, { do: "accept" })),
    fill: () => press(() => replyToRound($, id, surface, "fill")),
    send: () => press(() => replyToRound($, id, surface, "send")),
    focusReview: (index) =>
      press(async () => {
        const c = await update($, current, (was) =>
          was?.transcript === id && was.view.isReview ? { ...was, reviewCursor: index } : was,
        );
        if (c?.transcript === id && c.view.isReview) await revealReview($, id, c);
      }),
  };
}

async function revealReview($: EngineInterface, id: string, c: Current) {
  const round = (await read($, transcript))[id];
  const requestId = round?.anchors[c.view.count] ?? round?.anchors[0];
  if (!requestId) return;
  if (c.reviewCursor !== undefined) {
    const to = { key: reviewTarget(c.view, c.reviewCursor) };
    const result = await $.ui.scroll({ to, block: "nearest" });
    if (!result?.deny) return;
  }
  // Some surfaces cannot scroll a fallback AssistantMessage row.
  await $.ui.scroll({ to: { requestId }, block: "start" }).catch(() => undefined);
}

async function toggleReview(
  $: EngineInterface,
  id: string,
  surface: RoundEditor["surface"] = "terminal",
  fromNext = false,
) {
  const c = await update($, current, (was) => {
    if (was?.transcript !== id || was.writer) return was;
    if (was.view.isReview)
      return over(was, stepForm(was.held, { do: "go", step: was.reviewFrom ?? 0 }));
    return {
      ...over(was, stepForm(was.held, { do: "go", step: was.view.count })),
      reviewFrom: was.view.step,
      reviewCursor: fromNext ? undefined : was.reviewCursor,
    };
  });
  if (c?.transcript !== id || c.writer || surface !== "terminal") return;
  if (c.view.isReview) {
    await revealReview($, id, c);
  } else await revealRound($, id, c.view.step);
}

async function openReviewQuestion($: EngineInterface, id: string, index: number) {
  await update($, current, (c) =>
    c?.transcript === id && c.view.isReview && !c.writer
      ? { ...c, reviewCursor: index, reviewFrom: index }
      : c,
  );
  await moveRound($, id, "terminal", index);
}

async function pressReview($: EngineInterface, id: string, c: Current, key: string) {
  const first = c.view.reply ? -1 : 0;
  if (key === "k" && (c.reviewCursor ?? first) === first)
    return moveRound($, id, "terminal", c.view.count - 1);
  if (key === "j" || key === "k") {
    const moved = await update($, current, (was) =>
      was?.transcript === id && was.view.isReview && !was.writer
        ? {
            ...was,
            reviewCursor: Math.max(
              was.view.reply ? -1 : 0,
              Math.min(
                was.view.count - 1,
                (was.reviewCursor ?? (was.view.reply ? -1 : 0)) + (key === "j" ? 1 : -1),
              ),
            ),
          }
        : was,
    );
    if (moved?.transcript === id && moved.view.isReview) await revealReview($, id, moved);
    return;
  }
  if (!c.hasKeys) return;
  if (c.view.reply && (key === "f" || (key === "enter" && (c.reviewCursor ?? -1) < 0)))
    return replyToRound($, id, "terminal", "fill");
  if (key === "enter") return openReviewQuestion($, id, c.reviewCursor ?? 0);
}

async function pressRoundKey($: EngineInterface, id: string, key: string) {
  const c = await read($, current);
  if (c?.transcript !== id || c.writer) return;
  if (key === "r") return toggleReview($, id);
  if (c.view.isReview) return pressReview($, id, c, key);
  if (key === "j" && c.view.step === c.view.count - 1) return toggleReview($, id, "terminal", true);
  if (key === "j" || key === "k")
    return moveRound($, id, "terminal", (view) =>
      Math.max(0, Math.min(view.count - 1, view.step + (key === "j" ? 1 : -1))),
    );
  if (key === "n") return writeRound($, id, c.view.step, NOTE, "terminal");
  if (c.view.item && key.toUpperCase() === writeLetter(c.view.item))
    return writeRound($, id, c.view.step, WRITE, "terminal");
  if (
    c.view.item?.entries.some(
      (entry) => entry.kind !== "write" && entryLetter(entry) === key.toUpperCase(),
    )
  )
    return changeRound($, id, (view) => view.step, {
      letter: key.toUpperCase(),
    });
}

function writingMode(
  $: EngineInterface,
  kit: Kit,
  c: Current,
  Input: ReturnType<EngineInterface["ui"]["resolve"]>["Input"],
  maxRows: number,
) {
  const { Box, Text, Button } = kit;
  const { view, editing, transcript: id, writer } = c;
  if (!id || !writer || !editing) return null;
  const note = editing === NOTE;
  const label = note ? "Write note" : "Write answer";
  const title = view.item ? `${label}  /  ${view.item.label}` : `${label}  /  Round`;
  const answer = view.review[view.step];
  const saved = savedField(c);
  const value = () => (typed?.field === editing ? typed.text : saved);
  if (writer.surface === "terminal") {
    const detail = view.item?.title ?? "Review answers";
    const singleLine = (text: string, width: number) =>
      clamp(text, Math.max(1, width), { max: 1 }).join("");
    const caption = view.item ? `${view.item.label}  ${detail}` : detail;
    return (
      <Box
        key="writing"
        flexDirection="column"
        width={Math.min(kit.columns, tokens.width.reading)}
        paddingLeft={1}
        borderStyle="quote"
        borderColor={tokens.role.accent}
      >
        <Text weight="semibold" {...roleProps("accent")}>
          {singleLine(caption, kit.columns - 6)}
        </Text>
        {answer?.isAnswered && note ? (
          <Text {...roleProps("note")}>{singleLine(answer.shown, kit.columns - 6)}</Text>
        ) : null}
        <Input
          key={keyOf(editing)}
          label={note ? "Note" : "Answer"}
          rows={Math.min(2, Math.max(1, maxRows - 4))}
          autoFocus
          value={value()}
          placeholder={note ? "Add a condition or follow-up" : "Write your own answer"}
          submitLabel="save"
          onInput={(text) => {
            typed = { field: editing, text };
          }}
          onSubmit={(text) => finishWriting($, id, text)}
        />
        <Box columnGap={2}>
          <Button
            plain
            dimColor
            key="keep"
            label="Save"
            onPress={() => finishWriting($, id, value())}
          />
          <Button plain dimColor key="cancel" label="Cancel" onPress={() => finishWriting($, id)} />
          {c.pending ? <Text dimColor>{`Click field or ${CHORD}`}</Text> : null}
        </Box>
      </Box>
    );
  }
  return (
    <Box
      key="writing"
      flexDirection="column"
      backgroundColor={tokens.gui.fill}
      paddingX={tokens.gui.across.inset}
      paddingY={tokens.gui.space.sm}
      rowGap={tokens.gui.space.sm}
      borderStyle="round"
      borderColor="#00000000"
    >
      {!view.item ? <Text weight="semibold">{title}</Text> : null}
      {writer.surface === "vscode" ? (
        <Box flexDirection="column" rowGap={tokens.gui.space.sm}>
          <Text weight="semibold">{note ? "Note" : "Your answer"}</Text>
          {Array.from({ length: writer.lines ?? saved.split("\n").length }, (_, i) => {
            const setLine = (line: string) => {
              const lines = value().split("\n");
              while (lines.length <= i) lines.push("");
              lines[i] = line;
              typed = { field: editing, text: lines.join("\n") };
              return typed.text;
            };
            return (
              <Input
                key={`${view.step}-${keyOf(editing)}-${i}`}
                placeholder={i === 0 ? (note ? "Type a note" : "Type an answer") : `Line ${i + 1}`}
                value={value().split("\n")[i] ?? ""}
                onInput={setLine}
                onSubmit={(line) => finishWriting($, id, setLine(line))}
              />
            );
          })}
        </Box>
      ) : (
        <Input
          key={keyOf(editing)}
          label={note ? "Note" : "Answer"}
          rows={Math.min(3, Math.max(1, maxRows - 3))}
          autoFocus
          value={value()}
          placeholder={note ? "Add a condition or follow-up" : "Type an answer"}
          onInput={(text) => {
            typed = { field: editing, text };
          }}
          onSubmit={(text) => finishWriting($, id, text)}
        />
      )}
      {actionBar(kit, [
        {
          key: "keep",
          label: "Save",
          isPrimary: true,
          onPress: () => finishWriting($, id, value()),
        },
        ...(writer.surface === "vscode"
          ? [
              {
                key: "add-line",
                label: "Add line",
                onPress: () =>
                  edit($, (was) =>
                    was.transcript === id &&
                    was.view.step === view.step &&
                    was.editing === editing &&
                    was.writer?.surface === "vscode"
                      ? {
                          ...was,
                          writer: {
                            ...was.writer,
                            lines: (was.writer.lines ?? saved.split("\n").length) + 1,
                          },
                        }
                      : was,
                  ),
              },
            ]
          : []),
        { key: "cancel", label: "Cancel", onPress: () => finishWriting($, id) },
      ])}
    </Box>
  );
}

function roundBody(
  kit: Kit,
  held: Held,
  current: Current | null,
  index: number,
  actions?: RoundActions,
  sent = false,
) {
  return index === held.form.items.length
    ? terminalReview(
        kit,
        viewOf(held.form, held.draft),
        current,
        current?.writer ? undefined : actions,
        sent,
      )
    : questionCard(kit, held, index, current, actions, null, sent);
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
    await recover($, e.surface === "desktop" || e.surface === "vscode").catch((error) =>
      complain($, error),
    );
    return started;
  });

  // Only a new round replaces the form; the person's send is what drops it. A turn a
  // background task woke ends on that task's news while the round still waits.
  on("turn.complete", async ($, e, next) => {
    if (e.agentId !== undefined || e.reason !== "answer") return next(e);
    const previous = await read($, current);
    if (previous?.writer) return next(e);
    const incoming = offer(null, e.answer);
    const id =
      incoming?.form.kind === "round"
        ? await captureRound($, incoming, e.answer, e.turnId).catch((error) => complain($, error))
        : undefined;
    if (incoming && previous && previous.transcript !== id) await freezeRound($, previous);
    await update($, current, (c) => {
      const held = offer(c?.held ?? null, e.answer);
      if (!held) return null;
      const now = over(c, held);
      return id ? { ...now, transcript: id } : now;
    }).catch((error) => complain($, error));
    return next(e);
  });

  // The person's own message: the round's own reply answers it, a blank one changes nothing,
  // and any other sets an answered round aside for `/answer` rather than dropping it. `send`
  // puts the round back if the engine refuses its submit.
  on("prompt.submit", async ($, e, next) => {
    const c = PERSON.has(e.origin.kind) ? await read($, current) : null;
    if (!c) return next(e);
    if (c.transcript && c.writer?.surface === "vscode" && e.origin.kind === "composer")
      return { drop: "Save or cancel the edit on the question card first" };
    // A field asked for by a click waits for the keys the prompt has. The first Enter is kept
    // back, with its draft still in the prompt, so it cannot send an ordinary message instead;
    // a second Enter goes through, as the person then means it.
    if (
      e.origin.kind === "composer" &&
      !e.command &&
      c.transcript &&
      c.pending &&
      !c.pending.isWarned &&
      e.text.trim()
    ) {
      await edit($, (was) =>
        was?.pending ? { ...was, pending: { ...was.pending, isWarned: true } } : was,
      );
      $.ui.toast(
        "An editor is waiting: click its field or press Alt+a. Send again to send your message.",
      );
      return { drop: "The note is still waiting" };
    }
    const text = e.text;
    if (!text.trim()) return next(e);
    if (c.transcript) await freezeRound($, c);
    const own = isOwnReply(c, text);
    if (own) {
      await update($, current, () => null);
    } else {
      if (hasWork(c.held)) {
        await update($, aside, () => ({ ...c.held, transcript: c.transcript }));
        $.ui.toast(asideNotice(c.view.answered));
      }
      await update($, current, () => null);
    }
    const sent = await next(e);
    if (own && !("drop" in sent)) {
      const fromFill = c.filled && (text === c.filled || text.startsWith(`${c.filled}\n`));
      await freezeRound($, c, (fromFill ? c.filledRound : undefined) ?? c.held);
    }
    // A draft set aside for the open form outlives the message sent past it.
    const draft = c.stash === null ? "" : ownDraft(c.stash, c.filled);
    if (draft) await $.prompt.fill({ text: draft, mode: "replace" }).catch(() => undefined);
    return sent;
  }).catch((_$, e, next) => (next.called ? undefined : next(e)));

  on("command.run", { command: "answer" }, async ($, e) => {
    await toggle($, e.presentation?.isFullscreen);
    return {};
  });

  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    const surface = e.surface;
    if (surface !== "terminal" && surface !== "desktop" && surface !== "vscode") return next(e);
    if (surface === "terminal" && e.viewport?.isFullscreen === false) return next(e);
    if (e.props.isSummary) return next(e);
    const match = await findRound($, surface, e.requestId, e.props.text);
    if (!match) return next(e);
    const { id, round } = match;
    const c = await read($, current);
    const active = c?.transcript === id ? c : null;
    const held = active?.held ?? round.frozen;
    if (!held) return next(e);
    const els = $.ui.resolve(e);
    const kit = kitOf(els, e);
    const { Box, Markdown } = els;
    const actions = active ? roundActions($, id, surface) : undefined;
    const split = surface === "terminal" && round.anchors.length > 1;
    const cards = split ? [] : held.form.items.map((_, i) => i).concat(held.form.items.length);
    const inline =
      surface !== "terminal" && active?.writer?.surface === surface
        ? writingMode($, kit, active, $.ui.resolve(e).Input, 8)
        : null;
    return (
      <Box flexDirection="column" rowGap={kit.isNative ? tokens.gui.space.sm : 1}>
        {round.preamble ? <Markdown text={round.preamble} /> : null}
        {kit.isNative
          ? nativeRound(kit, held, active, actions, inline, !active && round.sent)
          : cards.map((index) =>
              roundBody(kit, held, active, index, actions, !active && round.sent),
            )}
      </Box>
    );
  });

  on("ui.render", { component: "Placed" }, async ($, e, next) => {
    if (e.surface !== "terminal" || e.viewport?.isFullscreen === false || e.props.plugin !== PLUGIN)
      return next(e);
    const match = Object.entries(await read($, transcript)).find(([, round]) =>
      round.anchors.includes(e.requestId),
    );
    if (!match) return next(e);
    const [id, round] = match;
    const index = round.anchors.indexOf(e.requestId);
    const c = await read($, current);
    const active = c?.transcript === id ? c : null;
    const held = active?.held ?? round.frozen;
    if (!held) return next(e);
    const kit = kitOf($.ui.resolve(e), e);
    const actions = active ? roundActions($, id, "terminal") : undefined;
    return roundBody(kit, held, active, index, actions, !active && round.sent) ?? next(e);
  });

  // Drawn in the band, not a pane: the surface docks every pane beside the transcript once
  // the terminal is wide, and a round of questions reads better over the prompt. This is the
  // plugin's own row of the band; `AbovePromptList` gives it the band to itself while open.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const c = await read($, current);
    if (!c) return next(e);
    band = e.requestId;
    const els = $.ui.resolve(e);
    const { Box, Text, Button, Markdown } = els;
    const kit = kitOf(els, e);
    if (c.transcript) {
      if (e.surface === "terminal" && e.viewport?.isFullscreen !== false) {
        if (c.writer?.surface === "terminal")
          return writingMode($, kit, c, $.ui.resolve(e).Input, e.props.maxRows) ?? next(e);
        const id = c.transcript;
        if (c.pending)
          return (
            writingMode(
              $,
              kit,
              {
                ...c,
                writer: { from: c.pending.from, surface: "terminal" },
                editing: c.pending.field,
              },
              els.Input,
              e.props.maxRows,
            ) ?? next(e)
          );
        return controlBar(
          kit,
          c,
          () =>
            c.view.isReview && c.hasKeys
              ? pressRoundKey($, id, "enter")
              : moveRound($, id, "terminal", (view) => view.step),
          (key) => pressRoundKey($, id, key),
        );
      }
      if ((e.surface === "desktop" || e.surface === "vscode") && !c.isOpen) return next(e);
    }
    const { view, editing } = c;
    const back = () => leave($, (shown) => ({ do: "go", step: shown - 1 }));
    const forward = () => leave($, (shown) => ({ do: "go", step: shown + 1 }));
    const press: Record<string, () => unknown> = {
      back,
      next: forward,
      accept: () => accept($),
      skip: () => move($, { do: "skip" }),
      note: () => ask($, NOTE),
      fill: async () => {
        const held = typed;
        const kept = held ? await step($, { do: "note", text: held.text }) : view;
        if (kept?.reply) await fill($, kept.reply);
        else if (kept) $.ui.toast("Nothing answered yet.");
      },
      quit: () => close($),
      send: async () => {
        const held = typed;
        const kept = held ? await step($, { do: "note", text: held.text }) : view;
        if (kept?.reply) await send($, kept.reply);
        else if (kept) $.ui.toast("Nothing answered yet.");
      },
    };

    // The terminal's drawing is the mod's own, to the cell; a graphical surface's is the kit's.
    return forSurface(kit, {
      tui: () => {
        room = { rows: e.props.maxRows, columns: e.props.bodyColumns };
        /** The kept note as drawn: the gutter dim, the words as the note's own colour. */
        const noteRows = (text: string, indent = 0) =>
          noteLines(kit, text, { indent, role: "note", italic: true });
        if (!c.isOpen)
          return (
            <Button key="answer" plain autoFocus onPress={() => open($)}>
              <Text {...roleProps("accent")}>{view.title}</Text>
              <Text dimColor>
                {`  ${view.answered} of ${view.count}  ${CHORD} then Enter, or /answer`}
              </Text>
            </Button>
          );

        const columns = e.props.bodyColumns;
        // A short band gives up its blank rows, the one under the divider first, before it gives up
        // the question's title.
        const gaps: Gaps =
          GAPS.find((g) => heightOf(c, columns, g) <= e.props.maxRows - RESERVED_ROWS) ?? 0;
        const gap = gaps >= 1 ? 1 : 0;
        /** A field and the mark that leads its text. */
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
        const keys = buttonRow(
          kit,
          keysOf(c).map(({ hotkey, label, kind, isLit }): KeyChip => ({
            id: kind,
            hotkey,
            label,
            press: () => press[kind]?.(),
            isLit,
          })),
        );
        const unanswered = view.review.filter((row) => !row.isAnswered).map((row) => row.label);
        const height = heightOf(c, columns, gaps);
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
            tui: { isRoomy, columns, height, maxRows: e.props.maxRows },
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
                (line.row.note
                  ? rowsOf(noteText(line.row.note, " ".repeat(KEY_CELLS)), columns)
                  : 0),
              0,
            ) + (unanswered.length ? rowsOf(missing, columns) : 0);
          // The divider, the list, the button and the keys always show; then the reply as far as
          // the band has room: whole under a blank row, one line, or not at all.
          const fixed = 1 + listRows + 1 + (editing === NOTE ? 1 : 0) + keyRows(keysOf(c), columns);
          const left = e.props.maxRows - RESERVED_ROWS - fixed;
          const replyAll = rowsOf(view.reply || "(nothing answered yet)", columns) + 1;
          const level = left >= replyAll + 2 ? "full" : left >= 1 ? "line" : "none";
          // A blank row under the divider too, once the whole reply fits with it.
          const isRoomy = level === "full" && left >= replyAll + 3;
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
                onPress={() => press.fill?.()}
              />
              {level === "full" ? (
                <Box flexDirection="column">
                  <Text dimColor>The reply:</Text>
                  <Text>{reply}</Text>
                </Box>
              ) : level === "line" ? (
                <Text dimColor>
                  {
                    clamp(`The reply: ${reply.replace(/\n\s*/g, "  ")}`, columns, {
                      min: 1,
                      max: 1,
                    })[0]
                  }
                </Text>
              ) : null}
            </Box>,
            isRoomy,
          );
        }

        const { item } = view;
        const several = item.isSeveral;
        const laid = fitBody(c, item, panelRows, columns, gaps);
        // The write-in is always last.
        const writeIn = item.entries.length - 1;
        const chosen = item.entries.findIndex((row) => row.isChosen);
        // A note sits under the answer it is about; with none yet, under the entries.
        const noteAt = chosen >= 0 && chosen < writeIn ? chosen : writeIn - 1;
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
            hotkey={hotkeyOf(row, k)}
            autoFocus={!editing && k === item.start ? true : undefined}
            onPress={() => choose($, row, k)}
          >
            {`${markOf(row)} `}
            {row.kind === "write" ? `✎ ${item.written || row.text}` : labelOf(row, k)}
            {row.isRecommended ? <Text dimColor> (recommended)</Text> : null}
            {/* Inside the button, so a click on any of the option's lines picks it. */}
            {row.detail ? (
              <Text
                dimColor
              >{`\n${" ".repeat(KEY_CELLS)}${row.detail.replace(/\n/g, `\n${" ".repeat(KEY_CELLS)}`)}`}</Text>
            ) : null}
          </Button>
        );
        const option = entry;
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
      },
      gui: () => {
        const { inset } = tokens.gui.across;
        /** A block not already set in by the kit: its left edge lines up with the rest. */
        const block = (key: string, node: JSX.Element | null) =>
          node ? (
            <Box key={key} flexDirection="column" paddingX={inset}>
              {node}
            </Box>
          ) : null;
        /**
         * A field, always drawn where it belongs, so a click lands in it: a press that reveals one
         * leaves the focus on the press. It says no word for its Enter, so the surface draws no
         * button of its own beside it.
         */
        const field = (
          key: typeof WRITE | typeof NOTE,
          placeholder: string,
          value: string,
          onSubmit: (text: string) => unknown,
        ) =>
          "Input" in els ? (
            <els.Input
              key={keyOf(key)}
              placeholder={placeholder}
              value={value}
              onInput={(text) => {
                typed = { field: key, text };
              }}
              onSubmit={(text) => onSubmit(text)}
            />
          ) : null;

        if (!c.isOpen)
          return statusBand(kit, {
            key: "answer",
            text: view.title,
            hint: view.kind === "picks" ? "pick" : "answer",
            gui: {
              text: view.answered
                ? `${view.title}, ${view.answered} of ${view.count} answered`
                : view.title,
              icon: "question",
              tone: "neutral",
            },
            onPress: () => open($),
          });

        // One tab per question, marked once answered, and the review: the current one filled.
        // The way out keeps the far edge.
        const toolbar = paneTitle(kit, "", undefined, {
          gui: {
            tabs: [
              ...view.review.map((row, i): ActionSpec => ({
                key: `q${i}`,
                label: row.isAnswered ? `${tokens.glyph.done} ${row.label}` : row.label,
                isPrimary: !view.isReview && i === view.step,
                onPress: () => leave($, () => ({ do: "go", step: i })),
              })),
              {
                key: "review",
                label: "review",
                isPrimary: view.isReview,
                onPress: () => leave($, () => ({ do: "review" })),
              },
            ],
            actions: [{ key: "quit", label: "close", onPress: () => close($) }],
          },
        });
        /** An action of the row at the foot: its key is the press's name. */
        const act = (key: string, label: string, extra: Partial<ActionSpec> = {}): ActionSpec => ({
          key,
          label,
          onPress: () => press[key]?.(),
          ...extra,
        });

        if (!view.item) {
          // Each question on one line: its answer, the question beside it, a press to go back to it.
          const rows = view.review.map((row, i): ListItem => ({
            key: `item${i}`,
            title: row.isAnswered ? row.shown : "Not answered",
            detail: row.title,
            icon: row.isAnswered ? "success" : "pending",
            iconTone: row.isAnswered ? "success" : "neutral",
            action: row.isAnswered ? "Change" : "Answer",
            meta: row.note ? [{ text: `Note: ${row.note}`, width: 0 }] : undefined,
            onPress: () => leave($, () => ({ do: "go", step: i })),
          }));
          return stack(
            kit,
            [
              toolbar,
              list(kit, [{ title: "", rows }]),
              block(
                "round-note",
                field(NOTE, "Add a note on the whole round", view.note, (t) => keepNote($, t)),
              ),
              actionBar(kit, [
                act("send", "send", {
                  hotkey: "s",
                  isPrimary: Boolean(view.reply),
                }),
                act("fill", "fill the prompt"),
              ]),
            ],
            { gui: { gap: "sm" } },
          );
        }

        const { item } = view;
        const several = item.isSeveral;
        const isChosen = item.entries.some((row) => row.isChosen);
        // With this one answered and every other too, the way on is the review.
        const onward = {
          key: "next",
          label: view.answered === view.count ? "Review" : "Next",
          onPress: () => leave($, () => ({ do: "next" })),
        };
        const note = field(NOTE, "Add a note", item.note, (t) => keepNote($, t));
        // A single answer opens in place with its note under it; several, or none yet, keep the
        // note under the answers once there is one or it was asked for.
        const isNoteLoose =
          (several && isChosen) || (!isChosen && (editing === NOTE || !!item.note));
        const options = item.entries.map((row, k): ChoiceOption => {
          if (row.kind === "write")
            return {
              key: `e${k}`,
              label: row.text,
              icon: "write",
              field:
                field(WRITE, row.text, item.written, (t) => move($, { do: "write", text: t })) ??
                undefined,
              isOn: row.isChosen,
              body: note,
              onPress: () => choose($, row, k),
            };
          const words =
            row.kind === "accept"
              ? row.text.replace(/^(?:Yes:\s*)?(?:Yes\b[.,:]?\s*)?/i, "")
              : row.key
                ? row.text.replace(/^[A-H][.)]\s*/, "")
                : row.text;
          return {
            key: `e${k}`,
            tag: row.kind === "accept" ? "Yes" : row.key || undefined,
            label: words || "As recommended",
            detail:
              [row.isRecommended ? "Recommended" : "", row.detail.replace(/\s*\n\s*/g, " ")]
                .filter(Boolean)
                .join("  ·  ") || undefined,
            isOn: row.isChosen,
            body: note,
            onPress: () => choose($, row, k),
          };
        });
        const body = [item.body, item.recommended ? `**Recommended:** ${item.recommended}` : ""]
          .filter(Boolean)
          .join("\n\n");
        return stack(
          kit,
          [
            toolbar,
            <Box key="question" flexDirection="column">
              {block("title", prose(kit, `**${item.title.replace(/\*\*/g, "")}**`))}
              {excerpt(kit, {
                key: "body",
                text: body,
                isOpen: c.isBodyOpen,
                toggleKey: "more",
                onToggle: () => edit($, (was) => ({ ...was, isBodyOpen: !was.isBodyOpen })),
              })}
            </Box>,
            choice(kit, options, {
              key: "options",
              isMulti: several,
              gui: { layout: "rows", onward },
            }),
            isNoteLoose && note
              ? fieldRow(kit, {
                  key: "note-row",
                  icon: "note",
                  alt: "Note",
                  field: note,
                })
              : null,
            actionBar(kit, [
              act("skip", "skip", { hotkey: "s" }),
              ...(isChosen || isNoteLoose ? [] : [act("note", "add note", { hotkey: "n" })]),
              // One press takes a recommendation of several options; one is a press on its row.
              ...(item.canAccept && item.accepts.includes(",")
                ? [act("accept", `take ${item.accepts}`, { hotkey: "y" })]
                : []),
              // A single answer's way on is on its own row; several have theirs here.
              ...(several
                ? [
                    {
                      ...onward,
                      hotkey: "l",
                      isPrimary: isChosen,
                      onPress: onward.onPress,
                    },
                  ]
                : []),
            ]),
          ],
          { gui: { gap: "sm" } },
        );
      },
    });
  });

  // The open form has the band to itself: the other plugins' rows wait until it folds.
  on("ui.render", { component: "AbovePromptList", plugin: "*" }, async ($, e, next) => {
    const c = await read($, current);
    if (e.props.hasSurvey || !(c?.isOpen || c?.pending || c?.writer?.surface === "terminal"))
      return next(e);
    return next(onlyOwnRows(e, PLUGIN));
  });

  // The person's own moves of the ring over the form.
  on("ui.focus", async ($, e, next) => {
    const inBand = e.component === "AbovePrompt" && e.requestId === band;
    /** Only a move the chain allowed says the band has the keys. */
    const mark = async (moved: { deny?: string }) => {
      if (inBand && !moved.deny) await keysHeld($);
      return moved;
    };
    const c =
      e.component === "AbovePrompt" && e.origin.kind === "person" ? await read($, current) : null;
    if (inBand && c?.pending && e.element === keyOf(c.pending.field)) {
      const moved = await next(e);
      if (!moved.deny)
        await edit($, (was) =>
          was.transcript === c.transcript && was.pending && e.element === keyOf(was.pending.field)
            ? {
                ...was,
                writer: { from: was.pending.from, surface: "terminal" },
                editing: was.pending.field,
                pending: undefined,
                hasKeys: true,
              }
            : was,
        );
      return moved;
    }
    if (c?.transcript && !c.writer && e.element?.startsWith("round-key-"))
      return mark(await next({ ...e, element: ROUND_FOCUS }));
    if (!c?.isOpen || !c.view.item || !e.element) return mark(await next(e));
    // The press that picked an answer puts the ring on it just after its note took the ring.
    if (
      c.editing === NOTE &&
      /^e\d+$/.test(e.element) &&
      (await $.clock.now()) - askedAt < CLICK_MS
    )
      return mark(await next({ ...e, element: keyOf(NOTE) }));
    const moved = await next(e);
    if (moved.deny) return moved;
    // A write-in field left untouched is a row again; only a press opens it.
    if (c.editing === WRITE && e.element !== keyOf(WRITE) && typed === null)
      await edit($, (was) => ({ ...was, editing: null }));
    return mark(moved);
  }).catch((_$, e, next) => (next.called ? undefined : next(e)));

  // A change the person makes in the prompt puts the keys there; the guide must stop claiming them.
  on("prompt.change", async ($, e, next) => {
    if (e.origin.kind !== "plugin")
      await edit($, (c) => (c?.hasKeys ? { ...c, hasKeys: false } : c));
    return next(e);
  });
};
