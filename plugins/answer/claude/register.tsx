import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import { offer, hasWork, step as stepForm, view as viewOf } from "../core/forms";
import { isSeveral } from "./current";
import { fitBody, GAPS, heightOf, keyRows, keysOf, KEY_CELLS, type Gaps } from "./terminal";
import type { Action, Current, Entry, Held, View } from "./types.d.ts";
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
  type Action as ActionSpec,
  type ChoiceOption,
  type KeyChip,
  type ListItem,
} from "./ui";

const PLUGIN = "answer";
const WRITE = "write";
const NOTE = "note";
/** A field's address; a key row button is already called `note`. */
const keyOf = (field: typeof WRITE | typeof NOTE) => `${field}-field`;
// What the row says focuses the band; the binding itself is in keybindings.json.
const CHORD = "alt+a";

// Change the tag when Current changes shape: a reload keeps what the old code stored.
const current = atom({ plugin: "answer", key: "current" } as const, null, { shape: "current-11" });
/** The round a send set aside, for `/answer` to bring back. */
const aside = atom({ plugin: "answer", key: "aside" } as const, null, { shape: "aside-1" });

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
    isBodyOpen: isSameItem ? (c?.isBodyOpen ?? false) : false,
    isOpen: isSameForm ? (c?.isOpen ?? false) : false,
    stash: isSameForm ? (c?.stash ?? null) : null,
    filled: isSameForm ? (c?.filled ?? null) : null,
  };
};

const edit = ($: EngineInterface, fn: (c: Current) => Current) =>
  update($, current, (c) => (c ? fn(c) : c));

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
  await edit($, (was) => ({ ...was, isOpen: true, stash: isTaken ? box.text : was.stash }));
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

/** `/answer`: opens the form, or folds it when it is already up; a round set aside comes back. */
async function toggle($: EngineInterface) {
  let c = await read($, current);
  // The aside comes first: `recover` would find the round on the other side of the send that set
  // it aside, in the transcript, and offer that round empty.
  if (!c) {
    const was = await read($, aside);
    if (was) {
      await update($, aside, () => null);
      c = await update($, current, () => over(null, was));
    }
  }
  if (!c) await recover($).catch((error) => complain($, error));
  c ??= await read($, current);
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
  const sent = await $.prompt.submit({ text }).then(
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
    await update($, current, (c) => {
      const held = offer(c?.held ?? null, e.answer);
      return held ? over(c, held) : null;
    }).catch((error) => complain($, error));
    return next(e);
  });

  // The person's own message: the round's own reply answers it, a blank one changes nothing,
  // and any other sets an answered round aside for `/answer` rather than dropping it. `send`
  // puts the round back if the engine refuses its submit.
  on("prompt.submit", async ($, e, next) => {
    const c = PERSON.has(e.origin.kind) ? await read($, current) : null;
    if (!c) return next(e);
    const text = e.text;
    if (!text.trim()) return next(e);
    if (isOwnReply(c, text)) {
      await update($, current, () => null);
    } else {
      if (hasWork(c.held)) {
        await update($, aside, () => c.held);
        $.ui.toast(asideNotice(c.view.answered));
      }
      await update($, current, () => null);
    }
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
  // plugin's own row of the band; `AbovePromptList` gives it the band to itself while open.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const c = await read($, current);
    if (!c) return next(e);
    band = e.requestId;
    const els = $.ui.resolve(e);
    const { Box, Text, Button, Markdown } = els;
    const kit = kitOf(els, e);
    const { view, editing } = c;
    const back = () => leave($, (shown) => ({ do: "go", step: shown - 1 }));
    const forward = () => leave($, (shown) => ({ do: "go", step: shown + 1 }));
    const press: Record<string, () => unknown> = {
      back,
      next: forward,
      accept: () => accept($),
      skip: () => move($, { do: "skip" }),
      note: () => ask($, NOTE),
      several: () => edit($, (was) => ({ ...was, several: !isSeveral(was) })),
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
        const several = isSeveral(c);
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
                act("send", "send", { hotkey: "s", isPrimary: Boolean(view.reply) }),
                act("fill", "fill the prompt"),
              ]),
            ],
            { gui: { gap: "sm" } },
          );
        }

        const { item } = view;
        const several = isSeveral(c);
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
              ? row.text.replace(/^Yes:\s*(?:Yes\b[.,:]?\s*)?/i, "")
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
              ? fieldRow(kit, { key: "note-row", icon: "note", alt: "Note", field: note })
              : null,
            actionBar(kit, [
              act("skip", "skip", { hotkey: "s" }),
              ...(item.canSeveral
                ? [act("several", several ? "pick one" : "pick several", { hotkey: "m" })]
                : []),
              ...(isChosen || isNoteLoose ? [] : [act("note", "add note", { hotkey: "n" })]),
              // One press takes a recommendation of several options; one is a press on its row.
              ...(item.canAccept && item.accepts.includes(",")
                ? [act("accept", `take ${item.accepts}`, { hotkey: "y" })]
                : []),
              // A single answer's way on is on its own row; several have theirs here.
              ...(several
                ? [{ ...onward, hotkey: "l", isPrimary: isChosen, onPress: onward.onPress }]
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
