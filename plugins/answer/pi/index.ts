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
import { type Action, hasWork, offer, step as stepForm, type View, viewOf } from "../core/forms.ts";
import { AnswerOffer } from "./offer.ts";
import {
  AnswerGuide,
  firstReviewStop,
  type Round,
  type RoundAction,
  Transcript,
  reveal,
} from "./transcript.ts";

const WIDGET_KEY = "answer";
const SHORTCUT = "alt+a";
const ENTRY = "answer-form";
const CARD = "answer-round";

/** Only the card entry is visible. State entries update that same card by its anchor. */
type Saved = { held: Round | null; aside?: Round | null; archived?: Round };

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

/** The reply above what the person had typed, never over it. */
const placeReply = (draft: string, text: string) => (draft.trim() ? `${text}\n\n${draft}` : text);

/**
 * Whether an input carries the round's own reply: the text is what the reply says, or what the
 * form filled with the person's draft left under it (a fill puts the reply above the draft).
 */
const isReplyOf = (text: string, reply: string) =>
  reply !== "" && (text === reply || text.startsWith(`${reply}\n`));

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

/** A record another version wrote, or a corrupt one, is skipped rather than believed. */
const isSaved = (data: unknown): data is Saved => {
  if (typeof data !== "object" || data === null || !("held" in data)) return false;
  const { held, aside, archived } = data as { held: unknown; aside?: unknown; archived?: unknown };
  return (
    isRound(held) &&
    (aside === undefined || isRound(aside)) &&
    (archived === undefined || isRound(archived))
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
  let reviewCursor: number | undefined;
  let filled: { reply: string; round: Round } | undefined;
  let sending: { round: Round; reply: string } | undefined;
  const visibleCards = new Set<string>();

  /** The signature the widget last drew. */
  let shown = "";
  let lastText = "";

  const isTranscript = () => !!held?.anchor && visibleCards.has(held.anchor);

  const release = () => {
    if (guide?.focused) tui?.setFocus(promptFocus);
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
          () => reviewCursor,
          (action) => act(ctx, action),
          () => {
            if (made === guide && held) locate(held.draft.step, made.editing ? "nearest" : "start");
          },
        );
        guide = made;
        return guide;
      }
      shown = signature(view);
      if (!view) return { render: () => [], invalidate() {} };
      const { answered, title } = view;
      const note = `${answered ? ` · ${answered} answered` : ""} · ${SHORTCUT} or /answer`;
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
    pi.appendEntry<Saved>(ENTRY, { held, aside, archived });
  };

  const hold = (ctx: ExtensionContext, next: Round | null, archived?: Round) => {
    const isSame = next === held;
    if (!next || next.form !== held?.form || next.draft.step !== held.draft.step) {
      reviewCursor = undefined;
      if (next && next.form === held?.form && next.draft.step === next.form.items.length)
        reviewFrom = held.draft.step;
    }
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
    guide = undefined;
    reviewFrom = 0;
    reviewCursor = undefined;
    lastText = "";
    ctxOf = ctx;
    rounds.clear();
    cards.clear();
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "custom" || entry.customType !== ENTRY || !isSaved(entry.data)) continue;
      held = entry.data.held;
      aside = entry.data.aside ?? null;
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
              terminalRows: tui.terminal.rows,
              reviewCursor,
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
    const previous = held;
    const anchor = place();
    reviewFrom = 0;
    filled = undefined;
    hold(ctx, { ...incoming, anchor }, previous ?? undefined);
    if (isTranscript()) locate(0);
  });

  // Extension-authored background input must not dismiss someone else's draft.
  pi.on("input", (event, ctx) => {
    if (!held || !event.text.trim() || event.source === "extension") return;
    const answering = held;
    const submitted = filled && isReplyOf(event.text, filled.reply) ? filled.round : undefined;
    const v = viewOf(answering);
    const sent = submitted || isReplyOf(event.text, v?.reply ?? "");
    if (!sent && hasWork(answering)) {
      aside = answering;
      if (event.source === "interactive") ctx.ui.notify(asideNotice(v?.answered ?? 0), "info");
    }
    sending = undefined;
    filled = undefined;
    hold(ctx, null, sent ? { ...(submitted ?? answering), sent: true } : answering);
  });

  pi.on("message_start", (event, ctx) => {
    // The host emits input before its model and auth checks. Only a real user message marks
    // a direct submission as sent; if pi refuses it, the round stays open.
    const pending = sending;
    if (!pending || event.message.role !== "user") return;
    const content = event.message.content;
    const text = typeof content === "string" ? content : contentText(content, "\n");
    sending = undefined;
    if (text !== pending.reply || held?.form !== pending.round.form) return;
    filled = undefined;
    hold(ctx, null, { ...pending.round, sent: true });
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

  function submit(ctx: ExtensionContext, send: boolean) {
    const round = held;
    const reply = viewOf(round)?.reply;
    if (!round || !reply) return;
    if (!send) {
      const text = ctx.ui.getEditorText();
      const draft =
        filled && isReplyOf(text, filled.reply)
          ? text.slice(filled.reply.length).replace(/^\n\n?/, "")
          : text;
      ctx.ui.setEditorText(placeReply(draft, reply));
      filled = { reply, round };
      release();
      return;
    }
    if (!ctx.isIdle()) {
      ctx.ui.notify("Wait for the current turn to finish before sending answers.", "info");
      return;
    }
    release();
    sending = { round, reply };
    pi.sendUserMessage(reply);
  }

  function editText(ctx: ExtensionContext, field: "write" | "note") {
    const round = held;
    const v = viewOf(round);
    const editingGuide = guide;
    if (!round || !v || !editingGuide) return;
    const wasFocused = editingGuide.focused;
    if (!focusGuide()) return;
    const prefill = field === "write" ? v.item?.written : (v.item?.note ?? v.note);
    editingGuide.edit(field, v.step, prefill ?? "", (text) => {
      if (guide !== editingGuide || round !== held) return;
      if (text !== undefined) advance(ctx, round, { do: field, text });
      if (!wasFocused) release();
      locate(held?.draft.step ?? v.step, "nearest");
    });
    locate(v.step, "nearest");
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
      case "review-toggle":
        go(v.isReview ? reviewFrom : v.count);
        locate(v.count, "end");
        return;
      case "review":
        go(v.isReview ? reviewFrom : v.count);
        break;
      case "review-open": {
        const cursor = reviewCursor ?? firstReviewStop(v);
        if (cursor < 0) return submit(ctx, false);
        go(cursor);
        break;
      }
      case "review-cursor":
        if (!v.isReview) return;
        reviewCursor = action.index;
        break;
      case "move": {
        if (!v.isReview) {
          go(Math.max(0, Math.min(v.count, v.step + action.delta)));
        } else {
          const first = firstReviewStop(v);
          const cursor = reviewCursor ?? first;
          if (cursor === first && action.delta < 0) go(v.count - 1);
          else reviewCursor = Math.min(v.count - 1, cursor + action.delta);
        }
        break;
      }
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
