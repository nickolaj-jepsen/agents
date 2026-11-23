/**
 * What a story of schema 2 draws on the terminals: its model (data) turned into the props of the
 * component's `terminal.ts`, which returns the lines for a width. The graphical counterpart is
 * `adapters.tsx`. A story's data cannot hold lines or functions, so this is where a described body
 * (a question, a draft) becomes the kit's lines. No host imports.
 */
import { buttonRows } from "@agents/kit-buttons/terminal.ts";
import type { Buttons } from "@agents/kit-buttons/contract.ts";
import {
  CARD_INSET,
  choice,
  choiceList,
  closing,
  heading,
  note,
  rail,
  sections,
  steps,
  summary,
} from "@agents/kit-card/terminal.ts";
import type { Card } from "@agents/kit-card/contract.ts";
import type { CardModel } from "@agents/kit-card/model.ts";
import type { TerminalExt as CardExt } from "@agents/kit-card/stories.ts";
import { captionFrameLayout } from "@agents/kit-frame/contract.ts";
import { captionFrame, captionRule } from "@agents/kit-frame/terminal.ts";
import type { FrameModel } from "@agents/kit-frame/model.ts";
import type { TerminalExt as FrameExt } from "@agents/kit-frame/stories.ts";
import { fieldHit } from "@agents/kit-fields/contract.ts";
import type { FieldsModel } from "@agents/kit-fields/model.ts";
import { fields } from "@agents/kit-fields/terminal.ts";
import { blank, block, inline, line, scrolled, span, type Line } from "@agents/kit-core/lines.ts";
import type { Story } from "@agents/kit-core/stories.ts";
import { sheetRoom } from "@agents/kit-sheet/contract.ts";
import type { SheetModelOf } from "@agents/kit-sheet/model.ts";
import { sheet, sheetHead } from "@agents/kit-sheet/terminal.ts";
import type { TerminalExt as ButtonExt } from "@agents/kit-buttons/stories.ts";
import type { List } from "@agents/kit-list/contract.ts";
import type { TerminalExt as ListExt } from "@agents/kit-list/stories.ts";
import { many } from "@agents/kit-list/stories.ts";
import type { Detail } from "@agents/kit-detail/contract.ts";
import { detail as detailLines } from "@agents/kit-detail/terminal.ts";
import { list as listLines, listFollow } from "@agents/kit-list/terminal.ts";
import { emptyState, notice } from "@agents/kit-notice/terminal.ts";
import type { NoticeModel } from "@agents/kit-notice/model.ts";
import { statusBand } from "@agents/kit-band/terminal.ts";
import type { StatusBandModel } from "@agents/kit-band/model.ts";
import { prose } from "@agents/kit-prose/terminal.ts";
import type { ProseModel } from "@agents/kit-prose/model.ts";
import type { TerminalExt as ProseExt } from "@agents/kit-prose/stories.ts";
import { imageGallery } from "@agents/kit-image/terminal.ts";
import type { ImageModel } from "@agents/kit-image/stories.ts";

const ext = <T>(story: Story): T => (story.ext?.terminal ?? {}) as T;

/** A row behind the pointer's column, with as many cells kept clear at its right. */
const set = (l: Line): Line =>
  l.spans.length ? { ...l, spans: [span(CARD_INSET), ...l.spans] } : l;

const buttons = (story: Story, width: number): Line[] => {
  const m = story.model as Buttons;
  const w = Math.min(width, ext<ButtonExt>(story).width ?? width);
  return buttonRows({ rows: m.rows, lead: m.lead, confirming: m.confirming, wrap: m.wrap }, w);
};

const frame = (story: Story, width: number): Line[] => {
  const m = story.model as FrameModel;
  if (story.state === "section")
    return [captionRule({ width, caption: [...(m.caption ?? [])], end: [...(m.end ?? [])] })];
  const inner = width - 2 * captionFrameLayout.x;
  const stepsOf = ext<FrameExt>(story).steps;
  return captionFrame({
    width,
    title: m.title,
    caption: stepsOf
      ? (room) =>
          steps(
            stepsOf.map((s) => ({ ...s })),
            room,
          )?.spans
      : m.caption,
    close: m.close,
    body: heading({ active: true, label: m.body.label, title: m.body.question }, inner),
    footer: buttonRows({ rows: m.footer ?? [], confirming: m.close?.confirming }, inner)[0],
  });
};

const sheetBody = (m: SheetModelOf, width: number): Line[] => {
  const inner = width - 2 * CARD_INSET.length;
  return [
    ...block(inline(m.body.heading, { bold: true }), inner),
    blank(),
    ...fields(
      m.body.fields.map((f) => ({
        key: f.label[0] ?? "",
        label: f.label,
        value: f.value,
        hit: fieldHit(f.label.toLowerCase()),
      })),
      inner,
      { active: true },
    ),
    blank(),
  ].map(set);
};

const sheetLines = (story: Story, width: number): Line[] => {
  const m = story.model as SheetModelOf;
  if (story.state === "head")
    return [
      sheetHead({ width, title: m.title }),
      sheetHead({ width, title: m.title, close: m.close }),
    ];
  const room = sheetRoom(width);
  return sheet({
    width,
    title: m.title,
    close: m.close,
    body: sheetBody(m, room),
    notice: m.notice?.length ? set(line([...m.notice])) : undefined,
    footer: buttonRows(
      { rows: m.footer ?? [], confirming: m.close?.confirming },
      room - 2 * CARD_INSET.length,
    ).map(set),
    foot: m.foot,
  });
};

const listOf = (story: Story, width: number): Line[] => {
  // The terminal draws no opened row, no cap and no word on a control: those are the graphical drawing's.
  const {
    opened: _o,
    more: _m,
    maxItems: _x,
    action: _a,
    closeAction: _c,
    ...m
  } = story.model as List;
  const follow = ext<ListExt>(story).follow;
  if (follow === undefined) return listLines(m, width);
  // A window that has followed the keyboard down to row `follow`, as a client keeps it.
  let top = 0;
  for (let f = 0; f <= follow; f++) top = listFollow({ ...m, groups: many(f), top }, width);
  return listLines({ ...m, top }, width);
};

const detailOf = (story: Story, width: number): Line[] => {
  // The terminal draws no Button word and no flush inset: those are the graphical drawing's.
  const { action: _a, isActionAtEdge: _e, isFlush: _f, ...m } = story.model as Detail;
  return detailLines(m, width);
};

const fieldsLines = (story: Story, width: number): Line[] => {
  const m = story.model as FieldsModel;
  return fields([...m.fields], width, {
    active: m.active,
    inline: m.inline,
    valueLines: m.valueLines,
  });
};

/** The card's stories, drawn as they always were: the model's rows, and the terminal's own state. */
const cardLines = (story: Story, width: number): Line[] => {
  const m = story.model as CardModel;
  const t = ext<CardExt>(story);
  const active = t.active;
  const items = (m.choices ?? []).map((c) => ({
    key: c.key,
    text: c.text,
    detail: c.detail,
    writeIn: c.literal,
  }));
  const list = {
    items,
    active,
    multiple: m.choices?.[0]?.multiple,
    chosen: [...(t.chosen ?? [])],
    focus: t.focus,
  };
  switch (story.state) {
    case "choices":
    case "checkboxes":
    case "live":
      return choiceList(list, width);
    case "form":
      return sections(
        heading({ active, label: m.heading?.label, title: m.heading?.title ?? "" }, width),
        [...choiceList(list, width), ...note({ active, value: m.note?.value ?? "" }, width)],
      );
    case "fields": {
      const c = m.choices?.[0];
      return sections(
        [],
        choice(
          { key: c?.key ?? "", text: c?.text ?? "", literal: true, chosen: true, active },
          width,
        ),
        note({ active, value: m.note?.value ?? "" }, width),
      );
    }
    case "transcript": {
      const inner = width - 3;
      const one = (c: NonNullable<CardExt["cards"]>[number]) => {
        const state = { [c.state]: true } as { active?: boolean; answered?: boolean };
        return sections(
          heading(
            { ...state, focused: state.active, label: c.label, title: m.heading?.title ?? "" },
            inner,
          ),
          [
            ...(m.choices ?? []).flatMap((x, i) =>
              choice(
                {
                  ...state,
                  key: "ABC"[i] ?? "",
                  text: x.text,
                  chosen: i === c.chosen,
                  literal: x.literal,
                },
                inner,
              ),
            ),
            ...note({ ...state, value: c.note }, inner),
          ],
        ).map((row) => rail(state, row));
      };
      const [first, second] = t.cards ?? [];
      return [...(first ? one(first) : []), blank(), ...(second ? one(second) : [])];
    }
    case "closing": {
      const inner = width - 3;
      const c = m.closing as NonNullable<Card["closing"]>;
      const behind = (state: { active?: boolean; answered?: boolean }, rows: Line[]) =>
        rows.map((row) => rail(state, row));
      return [
        ...behind({}, closing({ answered: 0, total: c.total, hits: c.hits }, inner)),
        blank(),
        ...behind({ active: true }, [
          ...closing({ ...c, focused: true }, inner),
          ...note({ active: true, value: m.note?.value ?? "", hit: m.note?.hit }, inner),
        ]),
        blank(),
        ...behind(
          { answered: true },
          closing({ answered: c.total, total: c.total, sent: true }, inner),
        ),
      ];
    }
    case "review": {
      const row = steps(
        (m.steps ?? []).map((s) => ({ ...s })),
        width,
      );
      return sections(
        row ? [row] : [],
        ...(m.summaries ?? []).map((s) =>
          summary({ ...s, values: s.values.map((v) => ({ ...v })) }, width),
        ),
      );
    }
    default:
      return [];
  }
};
const notices = (story: Story, width: number): Line[] => {
  const m = story.model as NoticeModel;
  return m.isEmpty
    ? emptyState({ text: m.text as string, width })
    : notice({ text: m.text, width, status: m.status, isWrapped: m.isWrapped });
};

const bands = (story: Story, width: number): Line[] => {
  const m = story.model as StatusBandModel;
  return statusBand({
    text: m.text,
    hint: m.hint,
    hit: m.hit,
    status: m.status,
    hovered: m.hovered,
    width,
  });
};

const proses = (story: Story, width: number): Line[] => {
  const m = story.model as ProseModel;
  const lines = prose({ text: m.text, width, isDim: m.isDim });
  const window = ext<ProseExt>(story).window;
  return window ? scrolled(lines, { ...window, hits: { up: "up", down: "down" } }).rows : lines;
};

const images = (story: Story, width: number): Line[] =>
  imageGallery({ ...(story.model as ImageModel), columns: width });

/** A component's terminal drawing of a story at a width, by the component's id. */
export const terminal2: Record<string, (story: Story, width: number) => Line[]> = {
  "button-row": buttons,
  "caption-frame": frame,
  sheet: sheetLines,
  "grouped-list": listOf,
  "item-detail": detailOf,
  fields: fieldsLines,
  card: cardLines,
  "notice-line": notices,
  "status-band": bands,
  prose: proses,
  "image-gallery": images,
};
