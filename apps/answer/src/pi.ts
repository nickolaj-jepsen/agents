/**
 * A round of questions or a pick list lives in the transcript as cards, with its keys in a guide
 * above the prompt. In pi's regular mode the terminal owns the scrollback: the cards and the
 * keys work there, but pi reports no mouse and cannot scroll to a card.
 */
import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { contentText } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { isReplyOf, ownDraft, placeReply } from "./lib/draft.ts";
import {
  type Action,
  formId,
  hasWork,
  offer,
  step as stepForm,
  type View,
  viewOf,
} from "./lib/forms.ts";
import { offerNote } from "./lib/offer.ts";
import { AnswerOffer } from "./pi/offer.ts";
import {
  AnswerGuide,
  type Round,
  type RoundAction,
  type Typed,
  type Typing,
  Transcript,
  reveal,
} from "./pi/transcript.ts";

const WIDGET_KEY = "answer";
const SHORTCUT = "alt+a";
const ENTRY = "answer-form";
const CARD = "answer-round";

/** Only the card entry is visible. State entries update that same card by its anchor. */
type Saved = {
  held: Round | null;
  aside?: Round | null;
  archived?: Round;
  typing?: Typed | null;
};

/** What has the keys now: the prompt, as the guide takes them. The TUI class has it; its interface doesn't. */
const focusedOf = (tui: TUI): Component | null =>
  "getFocusedComponent" in tui && typeof tui.getFocusedComponent === "function"
    ? ((tui.getFocusedComponent() as Component | null) ?? null)
    : null;

const hasEditor = (ctx: ExtensionContext) => ctx.mode === "tui" && ctx.hasUI;

function lastAssistantText(messages: AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    const text = contentText(m.content, "\n").trim();
    if (text) return text;
  }
  return "";
}

/** What a send that sets the round aside says, counting the answers it keeps. */
const asideNotice = (answered: number) =>
  answered
    ? `${answered} answer${answered === 1 ? "" : "s"} set aside: /answer brings them back.`
    : "Answers set aside: /answer brings them back.";

/** Everything the widget draws of a view, so a step that changes none of it costs no redraw. */
const signature = (view: View | null) => (view ? `${view.id}|${view.answered}` : "");

/** A round as the branch stored it: its form and an answer for each of its items. */
const isRound = (value: unknown) => {
  if (value === null) return true;
  if (typeof value !== "object" || value === null) return false;
  const { form, draft } = value as {
    form?: { items?: unknown };
    draft?: { answers?: unknown; notes?: unknown };
  };
  return (
    Array.isArray(form?.items) &&
    Array.isArray(draft?.answers) &&
    Array.isArray(draft?.notes) &&
    form.items.length === draft.answers.length &&
    form.items.length === draft.notes.length
  );
};

/** A field another version wrote, or a corrupt one, is skipped rather than believed. */
const isTyped = (value: unknown): value is Typed => {
  if (typeof value !== "object" || value === null) return false;
  const { form, kind, step, text } = value as Partial<Record<keyof Typed, unknown>>;
  return (
    typeof form === "string" &&
    (kind === "write" || kind === "note") &&
    typeof step === "number" &&
    Number.isInteger(step) &&
    step >= 0 &&
    typeof text === "string"
  );
};

/** A record another version wrote, or a corrupt one, is skipped rather than believed. */
const isSaved = (data: unknown): data is Saved => {
  if (typeof data !== "object" || data === null || !("held" in data)) return false;
  const { held, aside, archived, typing } = data as {
    held: unknown;
    aside?: unknown;
    archived?: unknown;
    typing?: unknown;
  };
  return (
    isRound(held) &&
    (aside === undefined || isRound(aside)) &&
    (archived === undefined || isRound(archived)) &&
    (typing === undefined || typing === null || isTyped(typing))
  );
};

export default function (pi: ExtensionAPI) {
  let held: Round | null = null;
  let aside: Round | null = null;
  const rounds = new Map<string, Round>();
  let ctxOf: ExtensionContext | undefined;
  let tui: TUI | undefined;
  let guide: AnswerGuide | undefined;
  let promptFocus: Component | null = null;
  let reviewFrom = 0;
  let filled: { reply: string; round: Round } | undefined;
  let sending: { round: Round; reply: string } | undefined;
  /** The text of a field a redraw took away, with the form and step it was typed into. */
  let typing: Typed | undefined;
  /** What a submit was, until the user message that proves it went in exists. */
  let pending:
    | { round: Round; sent: Round | undefined; interactive: boolean; text: string }
    | undefined;
  const visibleCards = new Set<string>();

  /** The signature the widget last drew. */
  let shown = "";
  /** The last state entry saved, so one that repeats it writes nothing. */
  let saved = "";
  let lastText = "";

  const isTranscript = () => !!held?.anchor && visibleCards.has(held.anchor);

  const release = () => {
    if (guide?.focused) tui?.setFocus(promptFocus);
  };

  const formOf = (round: Round) => formId(round.form);

  /** What a field at `kind` and `step` of `round` held when a redraw took it away. */
  const keptAt = (round: Round, kind: Typing["kind"], step: number) =>
    typing && typing.form === formOf(round) && typing.kind === kind && typing.step === step
      ? typing.text
      : undefined;

  /** Keeps what the guide's open field holds, before a redraw takes the component away. */
  const keepTyping = () => {
    const field = guide?.typed;
    if (field) typing = field;
  };

  /**
   * Gives an open field's text back to the round it was typed into, as an answer or a note. The
   * field goes with it, so a round that replaces this one can never take its text.
   */
  const commitTyping = (round: Round): Round => {
    const field = guide?.typed ?? typing;
    guide?.forget();
    typing = undefined;
    if (!field || field.form !== formOf(round)) return round;
    const written = stepForm(at(round, field.step), { do: field.kind, text: field.text });
    return stepForm(written, { do: "go", step: field.step });
  };

  const draw = (ctx: ExtensionContext) => {
    const view = viewOf(held);
    // Changing pi's renderer remounts the widgets on a new TUI without calling their factories.
    if (tui?.children.length === 0) tui = undefined;
    const next = isTranscript() ? `round:${held?.anchor}` : signature(view);
    if (tui && guide && shown === next) {
      tui?.requestRender();
      return;
    }
    if (shown === next && tui) return;
    // The field goes with the component: its text goes into `typing`, to come back below.
    keepTyping();
    release();
    guide = undefined;
    shown = next;
    // The factory also tells us the renderer mode; ctx.mode only distinguishes TUI from RPC.
    ctx.ui.setWidget(WIDGET_KEY, (surface, theme) => {
      tui = surface;
      if (isTranscript()) {
        shown = `round:${held?.anchor}`;
        const made = new AnswerGuide(
          surface,
          theme,
          () => held,
          (action) => act(ctx, action),
          () => {
            if (made === guide && held) locate(held.draft.step, made.editing ? "nearest" : "start");
          },
        );
        guide = made;
        // A redraw that took the field away gives it back with the text it held.
        reopen(ctx, made);
        return guide;
      }
      shown = signature(view);
      if (!view) return { render: () => [], invalidate() {} };
      const { answered, title } = view;
      const note = offerNote(answered, SHORTCUT);
      return new AnswerOffer(theme, title, note, () => void open(ctx));
    });
  };

  const remember = (round: Round | null | undefined) => {
    if (round?.anchor) rounds.set(round.anchor, round);
  };
  const save = (archived?: Round) => {
    remember(held);
    remember(aside);
    remember(archived);
    const data: Saved = {
      held,
      aside,
      typing: typing ?? null,
      ...(archived ? { archived } : {}),
    };
    const key = JSON.stringify(data);
    if (key === saved) return;
    saved = key;
    pi.appendEntry<Saved>(ENTRY, data);
  };

  const hold = (ctx: ExtensionContext, next: Round | null, archived?: Round) => {
    const isSame = next === held;
    const isToLast = next?.draft.step === next?.form.items.length;
    if (next && isToLast && next.form === held?.form && held.draft.step !== next.draft.step)
      reviewFrom = held.draft.step;
    // A submit described the round that was held then; a different round is not what it said.
    if (next !== held) pending = undefined;
    held = next;
    if (!isSame || archived) save(archived);
    draw(ctx);
  };

  const adopt = (ctx: ExtensionContext) => {
    if (held || !aside) return;
    held = aside;
    aside = null;
    save();
    draw(ctx);
  };

  const restore = (ctx: ExtensionContext) => {
    if (!hasEditor(ctx)) return;
    release();
    held = null;
    aside = null;
    filled = undefined;
    sending = undefined;
    pending = undefined;
    typing = undefined;
    guide = undefined;
    reviewFrom = 0;
    lastText = "";
    saved = "";
    ctxOf = ctx;
    rounds.clear();
    cards.clear();
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== ENTRY || !isSaved(entry.data)) continue;
      held = entry.data.held;
      aside = entry.data.aside ?? null;
      typing = entry.data.typing ?? undefined;
      remember(held);
      remember(aside);
      remember(entry.data.archived);
    }
    shown = "";
    tui = undefined;
    refreshProjection(ctx);
  };

  function refreshProjection(ctx: ExtensionContext) {
    if (!hasEditor(ctx)) return;
    // A compacted card is still in the branch, but no longer in the visible transcript.
    visibleCards.clear();
    for (const entry of ctx.sessionManager.buildContextEntries()) {
      if (entry.type === "custom" && entry.customType === CARD && typeof entry.data === "string")
        visibleCards.add(entry.data);
    }
    draw(ctx);
  }

  pi.on("session_start", (_event, ctx) => restore(ctx));
  pi.on("session_compact", (_event, ctx) => refreshProjection(ctx));
  pi.on("session_tree", (_event, ctx) => restore(ctx));
  pi.on("session_shutdown", () => {
    if (!ctxOf) return;
    // A reload or a quit takes the widget away: the field's text goes to the session with it.
    keepTyping();
    save();
    ctxOf = undefined;
  });

  const locate = (step: number, align: "start" | "end" | "nearest" = "start") => {
    if (!tui || !held?.anchor) return false;
    const card = cards.get(held.anchor);
    return !!card && reveal(tui, card, step, align);
  };
  const cards = new Map<string, Transcript>();
  pi.registerEntryRenderer<string>(CARD, (entry, _options, theme) => {
    const id = entry.data;
    if (typeof id !== "string") return undefined;
    const made = new Transcript(
      theme,
      () => {
        const round = rounds.get(id);
        return round && tui?.children.length
          ? {
              round,
              active: held?.anchor === id,
              field: held?.anchor === id ? guide?.activeField : undefined,
            }
          : undefined;
      },
      (action) => {
        if (ctxOf && held?.anchor === id) act(ctxOf, action);
      },
    );
    cards.set(id, made);
    return made;
  });

  pi.on("agent_end", (event) => {
    lastText = lastAssistantText(event.messages);
  });

  // A turn that asks nothing leaves the round: a background task's turn ends on that task's news.
  pi.on("agent_settled", (event, ctx) => {
    if (!hasEditor(ctx) || event.aborted) return;
    const incoming = offer(held, lastText);
    if (!incoming || incoming === held) return;
    // A round that a new one replaces keeps what was typed into its open field.
    const previous = held ? commitTyping(held) : null;
    const anchor = place();
    reviewFrom = 0;
    filled = undefined;
    hold(ctx, { ...incoming, anchor }, previous ?? undefined);
    if (isTranscript()) locate(0);
  });

  // Extension-authored background input must not dismiss someone else's draft.
  pi.on("input", (event) => {
    if (event.source === "extension") {
      pending = undefined;
      return;
    }
    // A new user attempt supersedes a direct send that failed before becoming a message.
    sending = undefined;
    if (!held || !event.text.trim()) return;
    const answering = held;
    // The prompt carries the reply of an earlier fill, which answers the round as it was then.
    const replied = filled && isReplyOf(event.text, filled.reply) ? filled.round : undefined;
    // The host emits input before its model and auth checks, and a refused prompt leaves no user
    // message behind: hold what the submit was, and let message_start say that it went in.
    pending = {
      round: answering,
      sent:
        replied ?? (isReplyOf(event.text, viewOf(answering)?.reply ?? "") ? answering : undefined),
      interactive: event.source === "interactive",
      text: event.text,
    };
  });

  pi.on("message_start", (event, ctx) => {
    if (event.message.role !== "user") return;
    const content = event.message.content;
    const text = typeof content === "string" ? content : contentText(content, "\n");
    const direct = sending;
    sending = undefined;
    if (direct) {
      // Only a real user message marks a direct submission as sent; if pi refuses it, the round
      // stays open with its answers.
      if (text === direct.reply && held?.form === direct.round.form) {
        filled = undefined;
        hold(ctx, null, { ...direct.round, sent: true });
        return;
      }
    }
    const submitted = pending;
    pending = undefined;
    if (!submitted || submitted.text !== text) return;
    filled = undefined;
    const round = submitted.sent ? submitted.round : commitTyping(submitted.round);
    const answered = viewOf(round)?.answered ?? 0;
    if (!submitted.sent && hasWork(round)) {
      aside = round;
      if (submitted.interactive) ctx.ui.notify(asideNotice(answered), "info");
    }
    hold(ctx, null, submitted.sent ? { ...submitted.sent, sent: true } : round);
  });

  /** A new card for a round at the end of the transcript; its anchor. */
  function place(): string {
    const anchor = randomUUID();
    visibleCards.add(anchor);
    pi.appendEntry(CARD, anchor);
    return anchor;
  }

  const open = async (ctx: ExtensionContext) => {
    if (!hasEditor(ctx)) return;
    if (tui?.children.length === 0) draw(ctx);
    // A round a send set aside comes back when none is held, so alt+a works as /answer does.
    adopt(ctx);
    if (!held || !viewOf(held)) {
      ctx.ui.notify("Nothing to answer: the last turn asked no questions.", "info");
      return;
    }
    // A round whose card is gone from the transcript (compacted away, or stored before every
    // round had one) gets a new card at the end.
    if (!held.anchor || !visibleCards.has(held.anchor)) {
      hold(ctx, { ...held, anchor: place() });
      locate(held.draft.step);
    }
    if (isTranscript() && guide) focusGuide();
  };

  function advance(ctx: ExtensionContext, round: Round, action: Action, id?: string) {
    const next = stepForm(round, action, id);
    if (next !== round) hold(ctx, { ...round, ...next });
  }

  function at(round: Round, step: number): Round {
    return round.draft.step === step ? round : { ...round, ...stepForm(round, { do: "go", step }) };
  }

  function focusGuide() {
    if (!tui || !guide || !held) return false;
    if (!guide.editing && !locate(held.draft.step, "nearest")) return false;
    if (!guide.focused) {
      promptFocus = focusedOf(tui);
      tui.setFocus(guide);
    }
    return true;
  }

  /** Gives a freshly made guide the field a redraw took away, with the text it held. */
  function reopen(ctx: ExtensionContext, target: AnswerGuide) {
    const round = held;
    if (!round || !typing || typing.form !== formOf(round) || typing.step !== round.draft.step)
      return;
    const { kind, step } = typing;
    if (kind === "write" && !viewOf(round)?.item) return;
    openField(ctx, round, target, kind, step, typing.text, false);
  }

  /** Opens a field on `round`'s `step` with the text it had, and keeps whatever is typed into it. */
  function openField(
    ctx: ExtensionContext,
    round: Round,
    target: AnswerGuide,
    kind: Typing["kind"],
    step: number,
    text: string,
    wasFocused: boolean,
  ) {
    const form = formOf(round);
    target.edit(
      { form, kind, step },
      text,
      (savedText) => {
        // A guide that a redraw replaced already gave this text back to its own field.
        if (guide !== target) return;
        typing = undefined;
        if (savedText !== undefined && held && formOf(held) === form)
          advance(ctx, at(held, step), { do: kind, text: savedText });
        if (!wasFocused) release();
        locate(held?.draft.step ?? step, "nearest");
      },
      (typedText) => {
        typing = { form, kind, step, text: typedText };
      },
    );
  }

  function editText(ctx: ExtensionContext, field: Typing["kind"]) {
    const round = held;
    const v = viewOf(round);
    const target = guide;
    if (!round || !v || !target) return;
    const wasFocused = target.focused;
    if (!focusGuide()) return;
    // What the field held before a redraw, else what the draft says about this step.
    const prefill =
      keptAt(round, field, v.step) ??
      (field === "write" ? (v.item?.written ?? "") : (v.item?.note ?? v.note));
    openField(ctx, round, target, field, v.step, prefill, wasFocused);
    locate(v.step, "nearest");
  }

  function submit(ctx: ExtensionContext, send: boolean) {
    const round = held;
    const reply = viewOf(round)?.reply;
    if (!round || !reply) return;
    if (!send) {
      // The reply above the person's own draft, in place of an earlier fill of the same round.
      ctx.ui.setEditorText(
        placeReply(ownDraft(ctx.ui.getEditorText(), filled?.reply ?? null), reply),
      );
      filled = { reply, round };
      release();
      return;
    }
    if (!ctx.isIdle()) {
      ctx.ui.notify("Wait for the current turn to finish before sending answers.", "info");
      return;
    }
    if (!ctx.model) {
      ctx.ui.notify("No model is selected: the answers are still here.", "info");
      return;
    }
    release();
    pending = undefined;
    sending = { round, reply };
    pi.sendUserMessage(reply);
  }

  function act(ctx: ExtensionContext, action: RoundAction) {
    if (!held || (guide?.editing && action.kind !== "focus")) return;
    const go = (step: number) => {
      if (held) hold(ctx, at(held, step));
    };
    const v = viewOf(held);
    if (!v) return;
    switch (action.kind) {
      case "focus":
        return void open(ctx);
      case "release":
        return release();
      case "fill":
        return submit(ctx, false);
      case "send":
        return submit(ctx, true);
      case "top":
        go(0);
        locate(0, "start");
        return;
      case "review":
        go(v.isReview ? reviewFrom : v.count);
        break;
      case "move":
        // From the last step, k goes back to the last question; j has nowhere further to go.
        go(Math.max(0, Math.min(v.count, v.step + action.delta)));
        break;
      case "go":
        go(action.step);
        break;
      case "note":
        go(action.step);
        editText(ctx, "note");
        return;
      case "clear":
      case "accept":
        advance(ctx, at(held, action.step), { do: action.kind });
        break;
      case "pick": {
        const target = at(held, action.step);
        const entry = viewOf(target)?.item?.entries[action.entry];
        if (!entry) return;
        if (entry.kind === "write") {
          hold(ctx, target);
          editText(ctx, "write");
          return;
        }
        advance(ctx, target, entry.isChosen ? { do: "next" } : { do: "pick", entry: action.entry });
        // The first pick doesn't move away: its note and every other card remain clickable.
        if (!entry.isChosen) return;
        break;
      }
    }
    if (held)
      locate(held.draft.step, !v.isReview && held.draft.step === v.count ? "end" : "nearest");
  }

  pi.registerShortcut(SHORTCUT, {
    description: "Take the keys for the questions or pick list the last turn ended on",
    handler: (ctx) => open(ctx),
  });

  pi.registerCommand("answer", {
    description: "Take the keys for the question round or numbered pick list",
    handler: async (_args, ctx) => open(ctx),
  });
}
