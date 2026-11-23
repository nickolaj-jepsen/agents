/**
 * The elements a story's graphical extension describes as data. `stories.ts` is read by plain
 * Node and cannot hold an `Input` or an editor, so it holds `{ inputs: { "<hit>": { value } } }`
 * and this builds the host's element from it, wired to the drawing context's `input` and `submit`.
 * A component with elements of its own (linear-issue's editors) adds an adapter to `guiAdapters`.
 */
import type { GuiExt, InputData } from "@agents/kit-core/stories.ts";
import type { Gui } from "@agents/kit-core/paint/gui.tsx";

/** What an adapter hands the component's drawing: the host's elements, by the `hit` they answer. */
export type GuiElements = { inputs: Record<string, JSX.Element> };

/** A text field for the `hit`: the host's `Input`, its events going to the context. */
export function inputOf(g: Gui, hit: string, data: InputData): JSX.Element {
  const { Input } = g.els;
  return (
    <Input
      key={hit}
      label={data.label}
      value={data.value}
      placeholder={data.placeholder}
      rows={data.rows}
      onInput={(text) => g.input(hit, text)}
      onSubmit={(text) => g.submit(hit, text)}
    />
  );
}

/** The elements every story may describe: its `inputs`. */
export const guiElements = (g: Gui, ext: GuiExt = {}): GuiElements => ({
  inputs: Object.fromEntries(
    Object.entries(ext.inputs ?? {}).map(([hit, data]) => [hit, inputOf(g, hit, data)]),
  ),
});

/** A component's own adapter: its extension as data in, its elements out. Keyed by component id. */
export type GuiAdapter<E = never> = (g: Gui, ext: E) => unknown;

/** The per-component adapters; a component that needs none uses `guiElements`. */
export const guiAdapters: Record<string, GuiAdapter> = {};

// ---- schema 2 components: a story's model (data) as the component's graphical props

import { buttonRow } from "@agents/kit-buttons/gui.tsx";
import type { Buttons } from "@agents/kit-buttons/contract.ts";
import { fieldHit } from "@agents/kit-fields/contract.ts";
import type { CardModel } from "@agents/kit-card/model.ts";
import {
  choices,
  closing,
  heading,
  note,
  sections,
  steps,
  summary,
} from "@agents/kit-card/gui.tsx";
import type { FieldsModel } from "@agents/kit-fields/model.ts";
import { fields } from "@agents/kit-fields/gui.tsx";
import type { FrameModel } from "@agents/kit-frame/model.ts";
import { captionFrame, captionRule } from "@agents/kit-frame/gui.tsx";
import type { SheetModelOf } from "@agents/kit-sheet/model.ts";
import { sheet, sheetHead } from "@agents/kit-sheet/gui.tsx";
import type { Story } from "@agents/kit-core/stories.ts";
import { blocks, typed } from "@agents/kit-core/paint/gui.tsx";
import type { Detail } from "@agents/kit-detail/contract.ts";
import { detail } from "@agents/kit-detail/gui.tsx";
import type { List } from "@agents/kit-list/contract.ts";
import type { GuiExt as ListGuiExt } from "@agents/kit-list/stories.ts";
import { list } from "@agents/kit-list/gui.tsx";
import { emptyState, notice } from "@agents/kit-notice/gui.tsx";
import type { NoticeModel } from "@agents/kit-notice/model.ts";
import { statusBand } from "@agents/kit-band/gui.tsx";
import type { StatusBandModel } from "@agents/kit-band/model.ts";
import { prose } from "@agents/kit-prose/gui.tsx";
import type { ProseModel } from "@agents/kit-prose/model.ts";
import { tokens } from "@agents/kit-core/tokens.ts";

const buttons2 = (g: Gui, s: Story) => {
  const { wrap: _wrap, hover: _hover, ...m } = s.model as Buttons;
  return buttonRow(g, m) ?? <g.els.Box />;
};

const frame2 = (g: Gui, s: Story) => {
  const m = s.model as FrameModel;
  if (s.state === "section") return captionRule(g, m) ?? <g.els.Box />;
  return captionFrame(g, {
    title: m.title,
    caption: m.caption,
    close: m.close,
    actions: m.actions,
    footer: m.footer,
    notice: m.notice,
    body: (
      <g.els.Box paddingX={tokens.gui.across.inset}>{typed(g, "body", m.body.question)}</g.els.Box>
    ),
  });
};

const sheet2 = (g: Gui, s: Story) => {
  const m = s.model as SheetModelOf;
  const { Box } = g.els;
  if (s.state === "head")
    return (
      <Box flexDirection="column" rowGap={0.9}>
        {sheetHead(g, { title: m.title })}
        {sheetHead(g, { title: m.title, close: m.close })}
      </Box>
    );
  return sheet(g, {
    title: m.title,
    close: m.close,
    footer: m.footer,
    notice: m.notice,
    body: [
      <g.els.Box key="heading" paddingX={tokens.gui.across.inset}>
        {typed(g, "heading", m.body.heading.replace(/`/g, ""))}
      </g.els.Box>,
      fields(g, {
        fields: m.body.fields.map((f) => ({
          label: f.label,
          value: f.value,
          hit: fieldHit(f.label.toLowerCase()),
        })),
      }),
    ],
  });
};

const detail2 = (g: Gui, s: Story) => {
  // No window, frame or hover: those are the terminal's fields, not the graphical props.
  const { height: _h, offset: _o, framed: _f, titleMax: _t, hovered: _v, ...m } = s.model as Detail;
  return detail(g, m);
};

/** A row opened in place, from the data a story describes: its detail and the decision Buttons. */
const list2 = (g: Gui, s: Story) => {
  const m = s.model as List;
  const data = (s.ext?.gui as ListGuiExt | undefined)?.opened ?? {};
  const opened = Object.fromEntries(
    Object.entries(data).map(([hit, o]) => [
      hit,
      blocks(
        g,
        detail(g, { meta: o.meta, sections: o.sections, isFlush: true }),
        buttonRow(g, {
          isFlush: true,
          rows: [
            o.choices.map((c) => ({
              hotkey: "",
              label: c.label,
              hit: c.hit,
              isChosen: c.isChosen,
            })),
          ],
        }),
      ),
    ]),
  );
  // The graphical drawing has no window, rails or flat rows: those fields are not its props.
  const { height: _h, top: _t, aside: _a, flat: _f, space: _s, rail: _r, ...props } = m;
  return list(g, { ...props, opened: { ...(m.opened as object), ...opened } as never });
};
const card2 = (g: Gui, s: Story) => {
  const m = s.model as CardModel;
  const c = m.closing;
  switch (s.state) {
    case "form":
      return sections(
        g,
        m.heading ? heading(g, m.heading) : null,
        choices(g, m.choices ?? []),
        m.note ? note(g, m.note) : null,
      );
    case "fields":
      return sections(g, choices(g, m.choices ?? []), m.note ? note(g, m.note) : null);
    case "closing":
      return sections(
        g,
        c ? closing(g, { ...c, answered: 0, canFill: false }) : null,
        c ? closing(g, c) : null,
        m.note ? note(g, m.note) : null,
        c ? closing(g, { answered: c.total, total: c.total, sent: true }) : null,
      );
    case "review":
      return sections(g, steps(g, m.steps ?? []), ...(m.summaries ?? []).map((x) => summary(g, x)));
    default:
      return choices(g, m.choices ?? []);
  }
};

const fields2 = (g: Gui, s: Story) => fields(g, { fields: (s.model as FieldsModel).fields });
const notice2 = (g: Gui, s: Story) => {
  const m = s.model as NoticeModel;
  return m.isEmpty
    ? emptyState(g, { text: m.text as string, words: m.words as string | undefined })
    : notice(g, { text: m.text, status: m.status, words: m.words, isCut: m.isCut });
};

const band2 = (g: Gui, s: Story) => {
  const { hovered: _hovered, ...m } = s.model as StatusBandModel;
  return statusBand(g, m);
};

const prose2 = (g: Gui, s: Story) => {
  const m = s.model as ProseModel;
  return prose(g, { text: m.text, isDim: m.isDim, excerpt: m.excerpt });
};

/** A component's graphical drawing of a story, by the component's id. */
export const gui2: Record<string, (g: Gui, story: Story) => JSX.Element> = {
  "button-row": buttons2,
  "caption-frame": frame2,
  sheet: sheet2,
  "grouped-list": list2,
  "item-detail": detail2,
  fields: fields2,
  card: card2,
  "notice-line": notice2,
  "status-band": band2,
  prose: prose2,
};
