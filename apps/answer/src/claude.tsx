import { atom, read, update } from "claude-code";
import type { EngineInterface, Register, SessionMessage } from "claude-code";

import {
  formId,
  offer,
  hasWork,
  startLines,
  tailOf,
  step as stepForm,
  view as viewOf,
} from "./lib/forms";
import { rowOf } from "./claude/terminal";
import {
  closingRow,
  controlBar,
  questionCard,
  nativeRound,
  preamble,
  roundPress,
  spacer,
  ROUND_FOCUS,
  entryLetter,
  writeLetter,
  writerBand,
  fieldEvents,
  type Els,
  type RoundActions,
  type Writing,
} from "./claude/transcript";
import type { Action, Current, Editing, Entry, Held, RoundEditor, View } from "./claude/types.d.ts";
import type { Button } from "@agents/kit-buttons/contract.ts";
import { buttonRow } from "@agents/kit-buttons/gui.tsx";
import { statusBand } from "@agents/kit-band/gui.tsx";
import {
  choices as choicesGui,
  heading as headingGui,
  note as noteGui,
  sections,
  steps,
  summary as summaryGui,
} from "@agents/kit-card/gui.tsx";
import type { Choice } from "@agents/kit-card/contract.ts";
import { frameTop } from "@agents/kit-frame/gui.tsx";
import { keyAddress } from "@agents/kit-core/paint/claude.tsx";
import { column, type Gui } from "@agents/kit-core/paint/gui.tsx";
import { stack } from "@agents/kit-core/paint/claude.tsx";
import { forSurface, guiOf, onlyOwnRows } from "@agents/kit-core/paint/host.tsx";
import { prose as proseGui } from "@agents/kit-prose/gui.tsx";
import { ctxOf, holds, surfaces } from "@agents/kit-core/surfaces.ts";

const singleLineEditor = (surface: RoundEditor["surface"]) =>
  surface !== "terminal" && holds(surface, "inputRows:1");

const PLUGIN = "answer";
const WRITE = "write";
const NOTE = "note";
/**
 * A field's address; a key row button is already called `note`. An Input keeps what was typed
 * until it is drawn with another value, so each opening gets an address of its own: one opened
 * after a cancel would otherwise come back holding the cancelled text.
 */
const hitOf = (field: typeof WRITE | typeof NOTE) => `${field}-field-${opened}`;
/** The kit keys a field's Input from its hit; the terminal's Input is keyed alike. */
const keyOf = (field: typeof WRITE | typeof NOTE) => `${field}:${hitOf(field)}`;
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
    isOpen: isSameForm ? (c?.isOpen ?? false) : false,
    filled: isSameForm ? (c?.filled ?? null) : null,
    filledRound: isSameForm ? c?.filledRound : undefined,
    transcript: isSameForm ? c?.transcript : undefined,
    writer: isSameItem ? c?.writer : undefined,
    hasKeys: isSameForm ? (c?.hasKeys ?? false) : false,
    pending: isSameItem ? c?.pending : undefined,
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
/** The Button of an answer: the kit keys a letter's Button from its `hit`. */
const answerKey = (entry: number) => `key:e${entry}`;

const home = (view: View) => (view.item ? answerKey(view.item.start) : "fill");

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
async function askAbout($: EngineInterface, editing: typeof WRITE | typeof NOTE) {
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
  if (entry.kind === "write") return askAbout($, WRITE);
  const c = await read($, current);
  if (!c) return;
  // A note being typed is this question's, so it is kept whichever answer is picked.
  if (typed?.field === NOTE && !(await keepTyped($))) return;
  if (entry.isChosen && !c.view.item?.isSeveral) return move($, { do: "next" });
  // Observed, not documented: the note field takes the keys only from a ring below its place, so
  // the ring goes below first.
  await focus($, answerKey(index + 1));
  if (await step($, { do: "pick", entry: index })) await askAbout($, NOTE);
}

/** Takes the question's recommendation, whatever it names, and goes on. */
async function accept($: EngineInterface) {
  if (await step($, { do: "accept" })) await move($, { do: "next" });
}

/** Opens the graphical form and hands it the ring. */
async function openForm($: EngineInterface) {
  const c = await read($, current);
  if (!c) return;
  await edit($, (was) => ({ ...was, isOpen: true }));
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

/** Folds the form back to its row, the answers kept. */
async function close($: EngineInterface) {
  typed = null;
  await edit($, (was) => ({ ...was, isOpen: false, editing: null, pending: undefined }));
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
      const id = await captureRound($, held, message.text, formId(held.form), message, false);
      await update($, current, (c) => c ?? { ...over(null, held), transcript: id });
      return;
    }
    if (!message.toolResults?.length && !isNotPerson(message.text)) return;
  }
}

/**
 * `/answer`: on a terminal it brings the shown question's card into view; on a graphical surface
 * it opens the form, or folds it when it is already up. A round set aside comes back.
 */
async function toggle($: EngineInterface) {
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
  const surfaces: readonly string[] = await $.session.surfaces().catch(() => []);
  if (!surfaces.includes("terminal")) await (c.isOpen ? close($) : openForm($));
  else if (!c.transcript) $.ui.toast("The round's message is not in the transcript to answer.");
  else {
    await $.clock.sleep(60);
    await revealRound($, c.transcript, c.view.step, "start").catch(() => undefined);
  }
}

/** Writes the reply into the prompt for the person to send: above their draft, in place of an earlier fill. */
async function fill($: EngineInterface, text: string): Promise<boolean> {
  const c = await read($, current);
  const box = await $.prompt.read();
  const { isFilled } = await $.prompt.fill({
    text: placeReply(ownDraft(box.text, c?.filled ?? null), text),
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
  const draft = ownDraft(box.text, c.filled);
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
      epilogue: tailOf(message.text),
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
        (row, i) => row.kind !== "write" && entryLetter(row, i) === action.letter,
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
        await moveRound($, id, surface, index);
        if (c.view.isReview && surface !== "terminal" && holds(surface, "transcriptKeyScroll"))
          await $.ui
            .scroll({ to: { key: `question-${index}-card` }, block: "start" })
            .catch(() => undefined);
      }),
    pick: (question, entry) => press(() => changeRound($, id, question, { do: "pick", entry })),
    edit,
    clear: (question) => press(() => changeRound($, id, question, { do: "clear" })),
    accept: (question) => press(() => changeRound($, id, question, { do: "accept" })),
    fill: () => press(() => replyToRound($, id, surface, "fill")),
    send: () => press(() => replyToRound($, id, surface, "send")),
    top: () => press(() => toTop($, id, surface)),
  };
}

/** The first question, scrolled to the top of the round. */
async function toTop($: EngineInterface, id: string, surface: RoundEditor["surface"]) {
  const c = await changeRound($, id, 0);
  // A surface that cannot scroll there still has the question.
  if (surface === "terminal" && c?.transcript === id && !c.writer)
    await revealRound($, id, 0, "start").catch(() => undefined);
}

async function revealReview($: EngineInterface, id: string, c: Current) {
  const round = (await read($, transcript))[id];
  const requestId = round?.anchors[c.view.count] ?? round?.anchors[0];
  if (!requestId) return;
  const closing = await $.ui
    .scroll({ to: { key: "round-closing" }, block: "nearest" })
    .catch(() => undefined);
  if (closing && !closing.deny) return;
  // Some surfaces cannot scroll a fallback AssistantMessage row.
  await $.ui.scroll({ to: { requestId }, block: "start" }).catch(() => undefined);
}

async function toggleReview(
  $: EngineInterface,
  id: string,
  surface: RoundEditor["surface"] = "terminal",
) {
  const c = await update($, current, (was) => {
    if (was?.transcript !== id || was.writer) return was;
    if (was.view.isReview)
      return over(was, stepForm(was.held, { do: "go", step: was.reviewFrom ?? 0 }));
    return {
      ...over(was, stepForm(was.held, { do: "go", step: was.view.count })),
      reviewFrom: was.view.step,
    };
  });
  if (c?.transcript !== id || c.writer || surface !== "terminal") return;
  if (c.view.isReview) {
    await revealReview($, id, c);
  } else await revealRound($, id, c.view.step);
}

/**
 * A key on the last step: `k` goes back to the last question, `n` writes the round's note, Enter
 * fills the prompt.
 */
async function pressReview($: EngineInterface, id: string, c: Current, key: string) {
  if (key === "k") return moveRound($, id, "terminal", c.view.count - 1);
  if (key === "n") return writeRound($, id, c.view.count, NOTE, "terminal");
  if (!c.hasKeys) return;
  if (c.view.reply && (key === "f" || key === "enter"))
    return replyToRound($, id, "terminal", "fill");
  if (key === "enter") return toTop($, id, "terminal");
}

/**
 * What a digit presses: the row at that place on screen, counting from the top of what is drawn:
 * an option or the write-in. A click on the row does the same, so a number answers wherever the
 * letters do. The last step has no rows to number.
 */
async function pressRowAt($: EngineInterface, id: string, c: Current, at: number) {
  const { view } = c;
  if (view.isReview) return;
  const entry = view.item?.entries[at];
  if (!entry) return;
  if (entry.kind === "write") return writeRound($, id, view.step, WRITE, "terminal");
  return changeRound($, id, view.step, { do: "pick", entry: at });
}

async function pressRoundKey($: EngineInterface, id: string, key: string) {
  const c = await read($, current);
  if (c?.transcript !== id || c.writer) return;
  if (key === "r") return toggleReview($, id);
  const at = rowOf(key);
  if (at >= 0) return pressRowAt($, id, c, at);
  if (c.view.isReview) return pressReview($, id, c, key);
  if (key === "j" && c.view.step === c.view.count - 1) return toggleReview($, id, "terminal");
  if (key === "j" || key === "k")
    return moveRound($, id, "terminal", (view) =>
      Math.max(0, Math.min(view.count - 1, view.step + (key === "j" ? 1 : -1))),
    );
  if (key === "n") return writeRound($, id, c.view.step, NOTE, "terminal");
  if (c.view.item && key.toUpperCase() === writeLetter(c.view.item))
    return writeRound($, id, c.view.step, WRITE, "terminal");
  if (
    c.view.item?.entries.some(
      (entry, i) => entry.kind !== "write" && entryLetter(entry, i) === key.toUpperCase(),
    )
  )
    return changeRound($, id, (view) => view.step, {
      letter: key.toUpperCase(),
    });
}

/** `text` with line `line` replaced: a one-line field's part of a longer text. */
function withLine(text: string, line: number, part: string) {
  const lines = text.split("\n");
  while (lines.length <= line) lines.push("");
  lines[line] = part;
  return lines.join("\n");
}

/**
 * The field a graphical surface has open in the transcript: the field's options (what is typed is
 * kept as it goes), and Save, Add line where the host's field is one line, and Cancel.
 */
function writingOf($: EngineInterface, c: Current): Writing | null {
  const { view, editing, transcript: id, writer } = c;
  if (!id || !writer || !editing || writer.surface === "terminal") return null;
  const note = editing === NOTE;
  const saved = savedField(c);
  const value = () => (typed?.field === editing ? typed.text : saved);
  const isSingleLine = singleLineEditor(writer.surface);
  /** What the field now holds, once `line` of it changed: the text whole. */
  const joined = (text: string, line?: number) =>
    line === undefined ? text : withLine(value(), line, text);
  const lines = isSingleLine ? (writer.lines ?? saved.split("\n").length) : undefined;
  const addLine = () =>
    edit($, (was) =>
      was.transcript === id &&
      was.view.step === view.step &&
      was.editing === editing &&
      was.writer?.surface === writer.surface
        ? {
            ...was,
            writer: { ...was.writer, lines: (was.writer.lines ?? saved.split("\n").length) + 1 },
          }
        : was,
    );
  return {
    question: view.step,
    field: editing,
    value: value(),
    hit: hitOf(editing),
    onInput: (text, line) => {
      typed = { field: editing, text: joined(text, line) };
    },
    onSubmit: (text, line) => finishWriting($, id, joined(text, line)),
    props: {
      invitation: note
        ? isSingleLine
          ? "Type a note"
          : "Add a condition or follow-up"
        : "Type an answer",
      autoFocus: !isSingleLine,
      lines,
      rows: isSingleLine ? undefined : 3,
    },
    buttons: [
      { hotkey: "", label: "Save", hit: "keep", isLit: true },
      ...(isSingleLine ? [{ hotkey: "", label: "Add line", hit: "add-line" }] : []),
      { hotkey: "", label: "Cancel", hit: "cancel" },
    ],
    act: {
      keep: () => finishWriting($, id, value()),
      "add-line": addLine,
      cancel: () => finishWriting($, id),
    },
  };
}

/**
 * The terminal's writer, above the prompt: the field is the engine's, so it is drawn by the
 * band and not the transcript.
 */
function writerOf(
  $: EngineInterface,
  els: ReturnType<EngineInterface["ui"]["resolve"]>,
  columns: number,
  c: Current,
  maxRows: number,
) {
  const { view, editing, transcript: id, writer } = c;
  if (!id || !writer || !editing) return null;
  const { Input } = els;
  const note = editing === NOTE;
  const saved = savedField(c);
  const value = () => (typed?.field === editing ? typed.text : saved);
  const detail = view.item?.title ?? "Review answers";
  const answer = view.review[view.step];
  const hit = hitOf(editing);
  const field = ctxOf("claude-terminal", {
    input: (address, text) => {
      if (address === hit) typed = { field: editing, text };
    },
    submit: (address, text) => {
      if (address === hit) return finishWriting($, id, text);
    },
  });
  return writerBand(els, columns, {
    caption: view.item ? `${view.item.label}  ${detail}` : detail,
    answer: answer?.isAnswered && note ? answer.shown : undefined,
    input: (
      <Input
        key={keyOf(editing)}
        label={note ? "Note" : "Answer"}
        rows={Math.min(2, Math.max(1, maxRows - 4))}
        autoFocus
        value={value()}
        placeholder={note ? "Add a condition or follow-up" : "Write your own answer"}
        submitLabel="save"
        onInput={(text) => field.input(hit, text)}
        onSubmit={(text) => field.submit(hit, text)}
      />
    ),
    rows: Math.min(2, Math.max(1, maxRows - 4)),
    isWaiting: Boolean(c.pending),
    chord: CHORD,
    save: () => finishWriting($, id, value()),
    cancel: () => finishWriting($, id),
  });
}

function roundBody(
  els: Els,
  columns: number,
  held: Held,
  current: Current | null,
  index: number,
  actions?: RoundActions,
  sent = false,
  epilogue = "",
) {
  if (index !== held.form.items.length)
    return questionCard(els, columns, held, index, current, actions);
  const closing = closingRow(
    els,
    columns,
    viewOf(held.form, held.draft),
    current,
    current?.writer ? undefined : actions,
    sent,
  );
  // What the message said after its questions comes before the row that closes them.
  return epilogue ? stack(els, preamble(els, columns, epilogue), spacer(els), closing) : closing;
}

/** The band's or pane's room in cells, as the event measured it. */
const columnsOf = (e: { viewport?: { columns: number }; props?: object }) =>
  Math.max(
    1,
    Math.floor(
      (e.props as { bodyColumns?: number } | undefined)?.bodyColumns ?? e.viewport?.columns ?? 80,
    ),
  );

/** What each control of the graphical form does, by its `hit`. */
async function pressForm($: EngineInterface, hit: string) {
  const c = await read($, current);
  if (!c) return;
  const { view } = c;
  const go = (to: (shown: number) => Action) => leave($, to);
  const index = (prefix: string) => Number(hit.slice(prefix.length));
  if (/^q\d+$/.test(hit)) return go(() => ({ do: "go", step: index("q") }));
  if (/^item\d+$/.test(hit)) return go(() => ({ do: "go", step: index("item") }));
  const entry = /^e\d+$/.test(hit) ? view.item?.entries[index("e")] : undefined;
  if (entry) return choose($, entry, index("e"));
  switch (hit) {
    case "answer":
      return openForm($);
    case "quit":
      return close($);
    case "review":
      return go(() => ({ do: "review" }));
    case "next":
      return go((shown) => ({ do: "go", step: shown + 1 }));
    case "accept":
      return accept($);
    case "skip":
      return move($, { do: "skip" });
    case "note":
      return askAbout($, NOTE);
    case "fill":
    case "send": {
      const held = typed;
      const kept = held ? await step($, { do: "note", text: held.text }) : view;
      if (!kept?.reply) return kept ? $.ui.toast("Nothing answered yet.") : undefined;
      return hit === "fill" ? fill($, kept.reply) : send($, kept.reply);
    }
  }
}

/**
 * A graphical surface's form: the way out, the steps as tabs, then the question with its answers
 * and note, or the review. A field is always drawn where it belongs, so a click lands in it: a
 * press that reveals one would leave the focus on the press.
 */
function form($: EngineInterface, c: Current, base: Gui): JSX.Element {
  const { view, editing } = c;
  const { item } = view;
  /** What a field of the form does with what is typed, and with Enter. */
  const typing = (name: typeof WRITE | typeof NOTE, submit: (text: string) => unknown) => ({
    input: (text: string) => {
      typed = { field: name, text };
    },
    submit,
  });
  const g = fieldEvents(base, {
    [hitOf(WRITE)]: typing(WRITE, (text) => move($, { do: "write", text })),
    [hitOf(NOTE)]: typing(NOTE, (text) => keepNote($, text)),
  });
  const head = sections(
    g,
    frameTop(g, { title: view.title, actions: [{ hotkey: "", label: "close", hit: "quit" }] }),
    steps(g, [
      ...view.review.map((row, i) => ({
        short: row.label,
        done: row.isAnswered,
        current: !view.isReview && i === view.step,
        hit: `q${i}`,
      })),
      { short: "Review", current: view.isReview, hit: "review" },
    ]),
  );
  /** An action of the row at the foot. */
  const act = (hit: string, label: string, isLit = false): Button => ({
    hotkey: "",
    label,
    hit,
    isLit,
  });

  if (!item)
    // Each question with its answer and note: its label in the label column. The steps above go back.
    return sections(
      g,
      head,
      ...view.review.map((row) =>
        summaryGui(g, {
          label: row.label,
          title: row.title,
          values: row.isAnswered ? [{ text: row.shown, literal: true }] : [],
          note: row.note,
        }),
      ),
      noteGui(g, {
        value: view.note,
        hit: hitOf(NOTE),
        invitation: "Add a note on the whole round",
      }),
      buttonRow(g, {
        rows: [[act("send", "send", Boolean(view.reply)), act("fill", "fill the prompt")]],
      }),
    );

  const several = item.isSeveral;
  const isChosen = item.entries.some((row) => row.isChosen);
  const isNoteShown = isChosen || editing === NOTE || !!item.note;
  const answered = view.review[view.step]?.isAnswered;
  const choices: Choice[] = item.entries.map((row, k) => {
    if (row.kind === "write")
      // The field itself is the row: a click in it is what opens it.
      return {
        key: "",
        text: item.written || row.text,
        literal: true,
        chosen: row.isChosen,
        answered,
        hit: hitOf(WRITE),
        invitation: row.text,
      };
    return {
      key: entryLetter(row, k),
      text: row.kind === "accept" ? row.text : row.text.replace(/^[A-H0-9]{1,2}[.)]\s*/, ""),
      aside: row.isRecommended ? "Recommended" : undefined,
      detail: row.detail || undefined,
      chosen: row.isChosen,
      multiple: several,
      answered,
      hit: `e${k}`,
    };
  });
  const body = [item.body, item.recommended ? `**Recommended:** ${item.recommended}` : ""]
    .filter(Boolean)
    .join("\n\n");
  return sections(
    g,
    head,
    headingGui(g, { title: item.title }),
    // Whole: the band scrolls, so the question is never cut behind a More.
    body ? proseGui(g, { text: body }) : null,
    choicesGui(g, choices),
    isNoteShown
      ? noteGui(g, { value: item.note, hit: hitOf(NOTE), invitation: "Add a note" })
      : null,
    buttonRow(g, {
      rows: [
        [
          act("skip", "skip"),
          ...(isChosen || isNoteShown ? [] : [act("note", "add note")]),
          // One press takes a recommendation of several options; one is a press on its row.
          ...(item.canAccept && item.accepts.includes(",")
            ? [act("accept", `Take ${item.accepts}`)]
            : []),
          // The way on, with this one answered and every other too, is the review.
          ...(isChosen || several
            ? [act("next", view.answered === view.count ? "Review" : "Next", isChosen)]
            : []),
        ],
      ],
    }),
  );
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
    await recover($).catch((error) => complain($, error));
    return started;
  });

  // Only a new round replaces the form; the person's send is what drops it. A turn a
  // background task woke ends on that task's news while the round still waits.
  on("turn.complete", async ($, e, next) => {
    if (e.agentId !== undefined || e.reason !== "answer") return next(e);
    const previous = await read($, current);
    if (previous?.writer) return next(e);
    const incoming = offer(null, e.answer);
    const id = incoming
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
    // A one-line inline editor does not take focus automatically; the composer stays live.
    if (
      c.transcript &&
      c.writer &&
      singleLineEditor(c.writer.surface) &&
      e.origin.kind === "composer"
    )
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
    return sent;
  }).catch((_$, e, next) => (next.called ? undefined : next(e)));

  on("command.run", { command: "answer" }, async ($) => {
    await toggle($);
    return {};
  });

  on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
    const surface = e.surface;
    if (
      surface !== "terminal" &&
      (!Object.hasOwn(surfaces, surface) ||
        surfaces[surface].drawing !== "gui" ||
        !holds(surface, "input"))
    )
      return next(e);
    if (e.props.isSummary) return next(e);
    const match = await findRound($, surface, e.requestId, e.props.text);
    if (!match) return next(e);
    const { id, round } = match;
    const c = await read($, current);
    const active = c?.transcript === id ? c : null;
    const held = active?.held ?? round.frozen;
    if (!held) return next(e);
    const els = $.ui.resolve(e);
    const actions = active ? roundActions($, id, surface) : undefined;
    return forSurface(e, {
      tui: () => {
        const columns = columnsOf(e);
        const split = round.anchors.length > 1;
        const cards = split ? [] : held.form.items.map((_, i) => i).concat(held.form.items.length);
        return stack(
          els,
          round.preamble ? preamble(els, columns, round.preamble) : null,
          ...cards.flatMap((index) => [
            round.preamble || index ? spacer(els) : null,
            roundBody(
              els,
              columns,
              held,
              active,
              index,
              actions,
              !active && round.sent,
              round.epilogue,
            ),
          ]),
        );
      },
      gui: () => {
        const writing = active?.writer?.surface === surface ? writingOf($, active) : null;
        const g = guiOf(els, e, actions && roundPress(actions, writing, held.form.items.length));
        return column(
          g,
          { gap: "sm", isMeasured: true },
          round.preamble ? proseGui(g, { text: round.preamble }) : null,
          nativeRound(g, held, active, actions, writing, !active && round.sent, round.epilogue),
        );
      },
    });
  });

  on("ui.render", { component: "Placed" }, async ($, e, next) => {
    if (e.surface !== "terminal" || e.props.plugin !== PLUGIN) return next(e);
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
    const actions = active ? roundActions($, id, "terminal") : undefined;
    return (
      roundBody(
        $.ui.resolve(e),
        columnsOf(e),
        held,
        active,
        index,
        actions,
        !active && round.sent,
        round.epilogue,
      ) ?? next(e)
    );
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
    if (e.surface === "terminal") {
      if (!c.transcript) return next(e);
      const columns = columnsOf(e);
      if (c.writer?.surface === "terminal")
        return writerOf($, els, columns, c, e.props.maxRows) ?? next(e);
      const id = c.transcript;
      if (c.pending)
        return (
          writerOf(
            $,
            els,
            columns,
            {
              ...c,
              writer: { from: c.pending.from, surface: "terminal" },
              editing: c.pending.field,
            },
            e.props.maxRows,
          ) ?? next(e)
        );
      return controlBar(
        els,
        c,
        () =>
          c.view.isReview && c.hasKeys
            ? pressRoundKey($, id, "enter")
            : moveRound($, id, "terminal", (view) => view.step),
        (key) => pressRoundKey($, id, key),
      );
    }
    if (c.transcript && !c.isOpen) return next(e);
    const g = guiOf(els, e, (hit) => pressForm($, hit));
    if (c.isOpen) return form($, c, g);
    const { view } = c;
    // The form's one row: what there is to answer, and the button that opens it.
    return statusBand(g, {
      text: view.title,
      hint: view.kind === "picks" ? "pick" : "answer",
      hit: "answer",
      words: view.answered
        ? `${view.title}, ${view.answered} of ${view.count} answered`
        : view.title,
      mark: "state:question",
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
    if (c?.transcript && !c.writer && e.element?.startsWith(keyAddress("")))
      return mark(await next({ ...e, element: ROUND_FOCUS }));
    if (!c?.isOpen || !c.view.item || !e.element) return mark(await next(e));
    // The press that picked an answer puts the ring on it just after its note took the ring.
    if (
      c.editing === NOTE &&
      /^key:e\d+$/.test(e.element) &&
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
