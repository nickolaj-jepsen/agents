/**
 * The queue on Desktop and VS Code, drawn with the kit's `gui.tsx` functions: the toolbar from
 * `frame`, the rows from `list` (a row opens in place), the opened claim's evidence from
 * `detail`, the actions from `buttons`, and a message from `notice`. The host scrolls the pane
 * and frames it, so there are no rows to count here. Every control is a `hit` that `g.press`
 * hands to the mod's reducer.
 */
import { buttonRow } from "@agents/kit-buttons/gui.tsx";
import { detail } from "@agents/kit-detail/gui.tsx";
import { frameTop } from "@agents/kit-frame/gui.tsx";
import { span, type Span } from "@agents/kit-core/lines.ts";
import { list } from "@agents/kit-list/gui.tsx";
import type { ListGroup } from "@agents/kit-list/contract.ts";
import { emptyState, notice } from "@agents/kit-notice/gui.tsx";
import type { MeaningName } from "@agents/kit-core/icons.ts";
import { blocks, type Gui } from "@agents/kit-core/paint/gui.tsx";
import { evidenceSections } from "./evidence.ts";
import { byTarget, choiceSummary, seen, type Choice, type Suggestion } from "../lib/docfix";
import { ageText, rowHit, TITLE } from "../lib/screen";
import type { Said } from "./types.d.ts";

export const SUBMIT = "submit";
export const MORE = "more";

const CHOICES = ["apply", "dismiss", "skip"] as const;
type Option = (typeof CHOICES)[number];

/** The control that sets suggestion `id` to a choice, or back to none. */
export const choiceHit = (choice: Option, id: string) => `${choice}:${id}`;

/** What a `hit` of the queue is, or undefined for one that is not its own. */
export function readHit(
  hit: string,
):
  | { kind: "row"; id: string }
  | { kind: "choice"; choice: Option; id: string }
  | { kind: "submit" | "more" }
  | undefined {
  if (hit === SUBMIT || hit === MORE) return { kind: hit };
  const at = hit.indexOf(":");
  if (at < 0) return undefined;
  const head = hit.slice(0, at);
  const id = hit.slice(at + 1);
  if (head === "row") return { kind: "row", id };
  const choice = CHOICES.find((c) => c === head);
  return choice ? { kind: "choice", choice, id } : undefined;
}

export type QueueView = {
  queue: readonly Suggestion[];
  set: Readonly<Record<string, Choice>>;
  /** The suggestions opened in place. */
  open: ReadonlySet<string>;
  /** Every suggestion of a doc, not the first few. */
  isAll: boolean;
  now: number;
  said: Said;
};

/** `seen 3× · 2 days ago`: the row says its kind, so the meta line does not. */
const metaOf = (q: Suggestion, now: number) =>
  [seen(q) > 1 ? `seen ${seen(q)}×` : "", ageText(q.updated, now)].filter(Boolean).join(" · ");

/** One opened suggestion: its meta line and evidence, then what to do with it. */
function opened(g: Gui, q: Suggestion, now: number, chosen?: Choice): JSX.Element {
  return blocks(
    g,
    detail(g, { meta: metaOf(q, now), sections: evidenceSections(q.evidence), isFlush: true }),
    buttonRow(g, {
      isFlush: true,
      rows: [
        CHOICES.map((choice) => ({
          hotkey: "",
          label: choice,
          hit: choiceHit(choice, q.id),
          isChosen: choice === chosen,
        })),
      ],
    }),
  );
}

const KIND: Record<Suggestion["kind"], MeaningName> = {
  wrong: "kind:wrong",
  stale: "kind:stale",
  missing: "kind:missing",
};

/** The meaning of a decision, once the row is set to one. */
const decision = (choice: Choice | undefined): MeaningName | undefined =>
  choice === "apply" ? "decision:apply" : choice === "dismiss" ? "decision:dismiss" : undefined;

/** The queue grouped by doc. A row says what it is set to by its mark, and what it is by its kind. */
export function queueList(g: Gui, v: QueueView): JSX.Element {
  const groups: ListGroup[] = byTarget(v.queue).map(([target, rows]) => ({
    label: target,
    rows: rows.map((q) => ({
      text: q.claim,
      mark: v.set[q.id] === "apply" ? "chosen" : v.set[q.id] === "dismiss" ? "dropped" : "open",
      // What the row is set to, once it is; else what it is. A bare mark is for terminals.
      icon: decision(v.set[q.id]) ?? KIND[q.kind],
      aside: seen(q) > 1 ? `${seen(q)}×` : undefined,
      hit: rowHit(q.id),
    })),
  }));
  const open = Object.fromEntries(
    v.queue
      .filter((q) => v.open.has(q.id))
      .map((q) => [rowHit(q.id), opened(g, q, v.now, v.set[q.id])]),
  );
  return list(g, { groups, lines: 1, more: { isAll: v.isAll, hit: MORE }, opened: open });
}

/**
 * The pane: the toolbar (the count, what closing will do, and Submit, which is filled only once
 * something is set), a message when something went wrong, then the queue or why it is empty.
 */
export function queuePane(g: Gui, v: QueueView): JSX.Element {
  const summary = choiceSummary(v.queue.map((s) => v.set[s.id]));
  const caption: Span[] = v.queue.length
    ? [
        span(`${v.queue.length} open`, { role: "dim" }),
        ...(summary ? [span(` · On close: ${summary}`)] : []),
      ]
    : [];
  return blocks(
    g,
    frameTop(g, {
      title: TITLE,
      caption,
      hostTitle: TITLE,
      actions: v.queue.length
        ? [{ hotkey: "", label: "submit", hit: SUBMIT, isLit: Boolean(summary) }]
        : undefined,
    }),
    v.said.text ? notice(g, { text: v.said.text, status: v.said.status }) : null,
    v.queue.length
      ? queueList(g, v)
      : emptyState(g, {
          text: "Nothing to review: no open doc suggestions in this repo. An agent files one when a doc it reads no longer matches the code.",
        }),
  );
}
