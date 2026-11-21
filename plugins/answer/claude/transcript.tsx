import { plain, recommendationChoice, view as viewOf } from "../core/forms";
import { POSITIONS } from "./terminal";
import type { Current, Editing, Held, View } from "./types.d.ts";
import {
  CARD_INSET,
  choice as cardChoice,
  closing as cardClosing,
  heading as cardHeading,
  note as cardNote,
  railRole,
} from "./kit/card/terminal.ts";
import type { Line } from "./kit/lines.ts";
import { paintLines } from "./kit/paint/claude.tsx";
import {
  actionBar,
  buttonRow,
  cellWidth,
  choice,
  icon,
  note as noteLines,
  roleProps,
  stack,
  tokens,
  widthCap,
  withColumns,
  type Kit,
} from "./ui";

export type RoundActions = {
  go: (index: number) => unknown;
  details?: (index: number) => unknown;
  pick: (question: number, entry: number) => unknown;
  edit: (question: number, field: NonNullable<Editing>, from?: number) => unknown;
  clear: (question: number) => unknown;
  accept: (question: number) => unknown;
  fill: () => unknown;
  send: () => unknown;
  /** Back to the first question, scrolled to the top of the round. */
  top: () => unknown;
};

const labelOf = (text: string) => text.replace(/^[A-H][.)]\s*/, "");

/** Markdown that `inlineMarkdown` cannot set: a list, a heading, a quote, a fence or a table. */
const BLOCKS = /^\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|>|```|~~~|\|)/m;

type Entry = NonNullable<View["item"]>["entries"][number];

/**
 * The key a terminal card draws and binds: its own letter, `A` for a prose recommendation,
 * or its place in a pick list.
 */
export const entryLetter = (entry: Entry, index: number) =>
  entry.kind === "accept"
    ? "A"
    : entry.key || (entry.kind === "option" ? String.fromCharCode(65 + index) : "");

export function writeLetter(item: NonNullable<View["item"]>) {
  const last = Math.max(
    64,
    ...item.entries.map((entry, i) =>
      /^[A-H]$/.test(entryLetter(entry, i)) ? entryLetter(entry, i).charCodeAt(0) : 64,
    ),
  );
  return String.fromCharCode(last + 1);
}

export function questionCard(
  outer: Kit,
  held: Held,
  index: number,
  current: Current | null,
  actions?: RoundActions,
  editor?: JSX.Element | null,
  sent = false,
): JSX.Element | null {
  const { Box, Text, Button, Markdown } = outer;
  const v = viewOf(held.form, { ...held.draft, step: index });
  const item = v.item;
  if (!item) return null;

  // Keep card heights stable behind the terminal writer. Its action handlers ignore
  // presses while the writer is open; the graphical writer takes the controls' place.
  const interactive = outer.isNative && current?.writer ? undefined : actions;
  const isActive = current?.view.step === index;
  const several = item.isSeveral;
  const width = widthCap("reading", outer.columns);
  const kit = withColumns(outer, Math.max(1, width - 4));
  const prefix = `question-${index}`;
  const answered = v.review[index]?.isAnswered;
  const hasChoices = item.entries.some((entry) => entry.kind !== "write");
  const controls = interactive
    ? [
        ...(kit.isNative
          ? [
              {
                key: `${prefix}-write`,
                label: item.written ? "Edit answer" : "Write answer",
                icon: "",
                onPress: () => interactive.edit(index, "write"),
              },
              {
                key: `${prefix}-note`,
                label: item.note ? "Edit note" : "Add note",
                icon: "",
                onPress: () => interactive.edit(index, "note"),
              },
            ]
          : []),
        ...(item.canAccept && item.accepts.includes(",")
          ? [
              {
                key: `${prefix}-accept`,
                label: `Take ${item.accepts}`,
                icon: `Take ${item.accepts}`,
                onPress: () => interactive.accept(index),
              },
            ]
          : []),
      ]
    : [];

  const answerTone = sent ? "success" : "note";
  const titleRole = roleProps(
    isActive ? "accent" : !kit.isNative && answered ? answerTone : "text",
  );
  // The terminal's card is the kit's: the lines pi paints too, each control a Button here.
  const state = { active: isActive, answered };
  const room = kit.columns;
  const terminal = (lines: Line[], press?: () => unknown) =>
    paintLines(outer, lines, {
      press: interactive && press ? () => press() : undefined,
      width: room,
    });
  // The terminal's own rows stand after the column the card's parts keep for the pointer.
  const inset = (node: JSX.Element | null) =>
    node && !kit.isNative ? <Box paddingLeft={cellWidth(CARD_INSET)}>{node}</Box> : node;
  const activate = !kit.isNative ? (
    terminal(
      cardHeading({ ...state, focused: isActive, label: item.label, title: item.title }, room).map(
        (row) => ({
          ...row,
          hit: `${prefix}-activate`,
        }),
      ),
      () => interactive?.go(index),
    )
  ) : (
    <Box columnGap={tokens.gui.across.sm} alignItems="flex-start">
      <Text {...titleRole} weight="semibold">
        {item.label}
      </Text>
      <Box flexShrink={1} width={0} flexGrow={1}>
        <Text weight="semibold" {...titleRole}>
          {item.title}
        </Text>
      </Box>
      {isActive ? <Text {...titleRole}>Current</Text> : null}
    </Box>
  );

  return (
    <Box
      key={kit.isNative ? `${prefix}-card` : item.label}
      width={kit.isNative ? undefined : width}
      flexDirection="column"
      borderStyle={kit.isNative ? undefined : "quote"}
      // The keyboard's card has a bright rail, not an accented one: the accent is for answers.
      // An answered card has a green rail; the keyboard's is bright and the rest are quiet.
      borderColor={!kit.isNative && answered ? tokens.role.success : undefined}
      borderDimColor={(!kit.isNative && !isActive && !answered) || undefined}
      paddingX={1}
    >
      {stack(
        kit,
        [
          activate,
          inset(item.body ? <Markdown text={item.body} /> : null),
          hasChoices || (!kit.isNative && (interactive || item.written || item.note)) ? (
            <Box flexDirection="column" rowGap={kit.isNative ? tokens.gui.space.xs : 0}>
              {item.entries.map((entry, i) => {
                if (entry.kind === "write") return null;
                const words = entry.kind === "accept" ? entry.text : labelOf(entry.text);
                const tag = entryLetter(entry, i) ? `${entryLetter(entry, i)} ` : "";
                // A Button's label is plain words: it draws no markdown.
                const said = plain(words);
                const weight = entry.isChosen ? "semibold" : undefined;
                // A press on the one chosen answer takes it back: the terminal's card keeps no
                // row to clear it.
                const pick = () =>
                  !kit.isNative && entry.isChosen && !several
                    ? interactive?.clear(index)
                    : interactive?.pick(index, i);
                const key = `${prefix}-choose-${i}`;
                // A detail of plain paragraphs is the option's too; one with blocks keeps its
                // Markdown under the row.
                const isDetailInline =
                  !kit.isNative && !!entry.detail && !BLOCKS.test(entry.detail);
                const option = kit.isNative
                  ? null
                  : terminal(
                      cardChoice(
                        {
                          ...state,
                          key: entryLetter(entry, i),
                          text: words,
                          aside: entry.isRecommended ? "  Recommended" : undefined,
                          detail: isDetailInline ? entry.detail : undefined,
                          detailLines: Infinity,
                          chosen: entry.isChosen,
                          multiple: several,
                          hit: key,
                        },
                        room,
                      ),
                      pick,
                    );
                return (
                  <Box key={`${prefix}-option-${i}`} flexDirection="column">
                    {kit.isNative ? (
                      <Box flexDirection="column" rowGap={tokens.gui.space.xs}>
                        <Box
                          flexDirection="row"
                          flexWrap="wrap"
                          columnGap={tokens.gui.across.sm}
                          alignItems="center"
                        >
                          {interactive ? (
                            <Button
                              key={key}
                              label={
                                cellWidth(said) > tokens.gui.maxLabel
                                  ? entry.key
                                    ? `Choose ${entry.key}`
                                    : "Accept recommendation"
                                  : [entry.key, said].filter(Boolean).join(" ")
                              }
                              variant={entry.isChosen ? "primary" : "secondary"}
                              dimColor={!entry.isChosen || undefined}
                              onPress={pick}
                            />
                          ) : null}
                          {entry.isChosen || entry.isRecommended ? (
                            <Text dimColor>
                              {entry.isChosen
                                ? entry.isRecommended
                                  ? "Selected, recommended"
                                  : "Selected"
                                : "Recommended"}
                            </Text>
                          ) : null}
                        </Box>
                        {!interactive || cellWidth(said) > tokens.gui.maxLabel ? (
                          <Text weight={weight}>
                            {!interactive ? tag : ""}
                            {said}
                          </Text>
                        ) : null}
                      </Box>
                    ) : (
                      option
                    )}
                    {entry.detail && !isDetailInline ? (
                      <Box paddingLeft={kit.isNative ? 1 : 4 + cellWidth(CARD_INSET)}>
                        <Markdown text={entry.detail} dimColor />
                      </Box>
                    ) : null}
                  </Box>
                );
              })}
              {!kit.isNative && (interactive || item.written)
                ? terminal(
                    cardChoice(
                      {
                        ...state,
                        key: writeLetter(item),
                        // A pick list's says "Something else".
                        text:
                          item.written ||
                          item.entries.find((entry) => entry.kind === "write")?.text ||
                          "Write your own answer",
                        literal: true,
                        chosen: !!item.written,
                        hit: `${prefix}-write`,
                      },
                      room,
                    ),
                    () => interactive?.edit(index, "write"),
                  )
                : null}
              {!kit.isNative && (interactive || item.note)
                ? terminal(
                    cardNote({ ...state, value: item.note, hit: `${prefix}-note` }, room),
                    () => interactive?.edit(index, "note"),
                  )
                : null}
            </Box>
          ) : null,
          inset(
            item.recommended ? (
              <Markdown text={`**Recommended:** ${item.recommended}`} dimColor />
            ) : null,
          ),
          kit.isNative && item.written ? (
            <Text>
              <Text weight="semibold" {...roleProps(sent ? "success" : "note")}>
                {"Answer: "}
              </Text>
              {item.written}
            </Text>
          ) : null,
          // The terminal's card takes an answer back with a press on it, and has its note
          // under the answers.
          kit.isNative && interactive && answered ? (
            <Button
              key={`${prefix}-clear`}
              dimColor
              label="Clear answer"
              onPress={() => interactive.clear(index)}
            />
          ) : null,
          kit.isNative && item.note ? noteLines(kit, item.note, { role: "note" }) : null,
          inset(editor ?? null),
          !controls.length ? null : kit.isNative ? (
            actionBar(kit, controls)
          ) : (
            <Box columnGap={tokens.gutter} flexWrap="wrap" paddingLeft={cellWidth(CARD_INSET)}>
              {controls.map((control) => (
                <Button
                  key={control.key}
                  plain
                  dimColor
                  label={control.label}
                  onPress={control.onPress}
                >
                  <Text>{control.icon}</Text>
                </Button>
              ))}
            </Box>
          ),
        ],
        { gui: { gap: "sm" } },
      )}
    </Box>
  );
}

/**
 * The row after the last card, the kit's: the count goes back to the first question, Fill prompt
 * puts the reply in the prompt, and the round's note stands under it once it has words.
 */
export function closingRow(
  outer: Kit,
  view: View,
  current: Current | null,
  actions: RoundActions | undefined,
  sent: boolean,
) {
  const { Box } = outer;
  const width = widthCap("reading", outer.columns);
  const room = Math.max(1, width - 4);
  const isActive = current?.view.isReview === true;
  const isNoting =
    isActive && (current.writer ? current.editing === "note" : current.pending?.field === "note");
  const press = (hit: string) =>
    hit === CLOSING.count
      ? actions?.top()
      : hit === CLOSING.fill
        ? actions?.fill()
        : actions?.edit(view.count, "note");
  const lines = [
    ...cardClosing(
      {
        answered: view.answered,
        total: view.count,
        // While its note is written the pointer stands on the note.
        focused: isActive && !isNoting,
        canFill: !!view.reply,
        sent,
        hits: actions ? { count: CLOSING.count, fill: CLOSING.fill } : undefined,
      },
      room,
    ),
    ...(view.note || isNoting
      ? cardNote(
          {
            active: isActive,
            value: view.note,
            focused: isNoting,
            hit: actions ? CLOSING.note : undefined,
          },
          room,
        )
      : []),
  ];
  // The rail is a card's: answered once every question is, bright while the keyboard is here.
  const rail = railRole({ active: isActive, answered: view.answered === view.count });
  return (
    <Box
      key="round-closing"
      width={width}
      flexDirection="column"
      borderStyle="quote"
      borderColor={rail === "success" ? tokens.role.success : undefined}
      borderDimColor={rail === "dim" || undefined}
      paddingX={1}
    >
      {paintLines(outer, lines, { press: actions ? press : undefined, width: room })}
    </Box>
  );
}

/** The closing row's controls, as the painter names their Buttons. */
export const CLOSING = { count: "round-count", fill: "round-fill", note: "round-note" } as const;

/** An answer or note under the choices, aligned without forcing the editor to one line. */
function nativeQuestionField(kit: Kit, kind: "write" | "note", body: JSX.Element) {
  const { Box } = kit;
  const { across, lead, space } = tokens.gui;
  return (
    <Box paddingX={across.inset} flexDirection="row" flexWrap="nowrap" columnGap={across.sm}>
      <Box flexShrink={0} minWidth={lead}>
        {icon(kit, kind)}
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} rowGap={space.xs}>
        {body}
      </Box>
    </Box>
  );
}

/** Native choice buttons with pi's selection marks. */
function vscodeOption(
  kit: Kit,
  key: string,
  tag: string,
  label: string,
  selected: boolean,
  multiple: boolean,
  press?: () => unknown,
  detail?: string,
  recommended = false,
) {
  const { Box, Button, Text, Markdown } = kit;
  const marks = multiple ? tokens.glyph.multi : tokens.glyph.single;
  const marker = `${selected ? marks.on : marks.off}${tag ? `  ${tag}` : ""}`;
  const text = `${marker}  ${label}`;
  // VS Code flattens Button children to a single non-wrapping label.
  const long = cellWidth(text) > tokens.gui.maxLabel || label.includes("\n");
  return (
    <Box key={`${key}-row`} flexDirection="column" rowGap={tokens.gui.space.xs} minWidth={0}>
      {press && !long ? (
        <Button key={key} dimColor={!selected || undefined} label={text} onPress={press} />
      ) : press ? (
        <Box flexWrap="nowrap" columnGap={tokens.gui.across.sm} alignItems="flex-start">
          <Button key={key} dimColor={!selected || undefined} label={marker} onPress={press} />
          <Box flexShrink={1} minWidth={0}>
            <Text>{label}</Text>
          </Box>
        </Box>
      ) : (
        <Text weight={selected ? "semibold" : undefined}>{text}</Text>
      )}
      {recommended || detail ? (
        <Box flexDirection="column" paddingLeft={tokens.gui.across.inset}>
          {detail ? (
            <Markdown text={recommended ? `**Recommended.** ${detail}` : detail} dimColor />
          ) : (
            <Text dimColor>Recommended</Text>
          )}
        </Box>
      ) : null}
    </Box>
  );
}

/** A transcript question with native controls. */
function nativeQuestion(
  kit: Kit,
  held: Held,
  index: number,
  current: Current | null,
  actions: RoundActions | undefined,
  editor: JSX.Element | null | undefined,
  sent: boolean,
) {
  const { Box, Text, Button, Markdown } = kit;
  const show = viewOf(held.form, { ...held.draft, step: index });
  const item = show.item;
  if (!item) return null;
  const prefix = `question-${index}`;
  const answered = show.review[index]?.isAnswered;
  const active = current?.view.step === index && !current.view.isReview;
  const vscode = kit.surface === "vscode";
  const highlighted = active && (!vscode || Boolean(editor));
  const rail = highlighted ? tokens.role.accent : answered ? tokens.role.note : tokens.gui.rule;
  const editingNote = editor && current?.editing === "note";
  const editingAnswer = editor && current?.editing === "write";
  const options = item.entries.flatMap((entry, i) => {
    if (entry.kind === "write") return [];
    const option =
      entry.kind === "accept"
        ? recommendationChoice(entry.text)
        : { tag: entry.key, label: labelOf(entry.text) };
    return [
      {
        key: `${prefix}-choose-${i}`,
        ...option,
        detail:
          [entry.isRecommended ? "Recommended" : "", entry.detail.replace(/\s*\n\s*/g, " ")]
            .filter(Boolean)
            .join("  /  ") || undefined,
        isOn: entry.isChosen,
        fullDetail: entry.detail,
        isRecommended: entry.isRecommended,
        onPress: () => actions?.pick(index, i),
      },
    ];
  });
  const full = current?.view.step === index && current.isBodyOpen;
  const hasDetails = options.some((o) => o.fullDetail || cellWidth(o.label) > tokens.gui.maxLabel);
  const details = actions?.details;
  return (
    <Box key={`${prefix}-card`} flexDirection="row" flexWrap="nowrap" minWidth={0}>
      <Box backgroundColor={rail} width={0.2} flexShrink={0} />
      <Box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        rowGap={vscode ? tokens.gui.space.sm : tokens.gui.space.xs}
      >
        <Box paddingX={tokens.gui.across.inset} flexDirection="column" rowGap={tokens.gui.space.xs}>
          <Box
            flexDirection="row"
            flexWrap="nowrap"
            alignItems="flex-start"
            columnGap={tokens.gui.across.sm}
          >
            <Box flexShrink={0} minWidth={tokens.gui.lead}>
              <Text weight="semibold" {...roleProps(highlighted ? "accent" : "dim")}>
                {item.label}
              </Text>
            </Box>
            <Box flexGrow={1} flexShrink={1} minWidth={0}>
              <Text weight="semibold">{item.title}</Text>
            </Box>
            {answered ? (
              <Box flexShrink={0}>
                <Text {...roleProps(sent ? "success" : "note")}>{tokens.glyph.done}</Text>
              </Box>
            ) : null}
          </Box>
          {item.body ? <Markdown text={item.body} dimColor /> : null}
          {item.recommended ? (
            <Markdown text={`**Recommended:** ${item.recommended}`} dimColor />
          ) : null}
        </Box>
        {vscode ? (
          <Box
            flexDirection="column"
            rowGap={tokens.gui.space.xs}
            paddingX={tokens.gui.across.inset}
          >
            {options.map((option) =>
              vscodeOption(
                kit,
                option.key,
                option.tag,
                option.label,
                option.isOn,
                item.isSeveral,
                actions && option.onPress,
                option.fullDetail,
                option.isRecommended,
              ),
            )}
            {editingAnswer
              ? editor
              : actions || item.written
                ? vscodeOption(
                    kit,
                    `${prefix}-write`,
                    writeLetter(item),
                    item.written ? "Edit answer" : "Write your own answer",
                    Boolean(item.written),
                    false,
                    actions && (() => actions.edit(index, "write")),
                  )
                : null}
            {item.written && !editingAnswer ? <Text>{`Answer: ${item.written}`}</Text> : null}
          </Box>
        ) : actions ? (
          choice(kit, options, {
            key: `${prefix}-options`,
            isMulti: item.isSeveral,
            gui: { layout: "rows" },
          })
        ) : (
          <Box flexDirection="column" paddingX={tokens.gui.across.inset}>
            {options.map((option) => (
              <Text key={`${option.key}-saved`} weight={option.isOn ? "semibold" : undefined}>
                {[option.tag, option.label, option.isOn ? "Selected" : ""]
                  .filter(Boolean)
                  .join("  ")}
              </Text>
            ))}
          </Box>
        )}
        {!vscode && details && hasDetails ? (
          <Box
            paddingX={tokens.gui.across.inset}
            flexDirection="column"
            alignItems="flex-start"
            rowGap={tokens.gui.space.xs}
          >
            <Button
              key={`${prefix}-details`}
              label={full ? "Hide option details" : "Option details"}
              dimColor
              onPress={() => details(index)}
            />
            {full
              ? options.map((o) => (
                  <Box key={`${o.key}-detail`} flexDirection="column">
                    <Text weight="semibold">{`${o.tag}  ${o.label}`}</Text>
                    {o.fullDetail ? <Markdown text={o.fullDetail} dimColor /> : null}
                  </Box>
                ))
              : null}
          </Box>
        ) : null}
        {vscode ? (
          <Box flexDirection="column" rowGap={tokens.gui.space.xs}>
            {editingNote ? (
              <Box paddingX={tokens.gui.across.inset} flexDirection="column">
                {editor}
              </Box>
            ) : item.note ? (
              <Box paddingX={tokens.gui.across.inset}>
                <Text>{`Note: ${item.note}`}</Text>
              </Box>
            ) : null}
            {actions
              ? actionBar(kit, [
                  ...(!editingNote
                    ? [
                        {
                          key: `${prefix}-note`,
                          label: item.note ? "Edit note" : "Add note",
                          onPress: () => actions.edit(index, "note"),
                        },
                      ]
                    : []),
                  ...(answered && !editingAnswer
                    ? [
                        {
                          key: `${prefix}-clear`,
                          label: "Clear answer",
                          onPress: () => actions.clear(index),
                        },
                      ]
                    : []),
                  ...(item.canAccept && item.accepts.includes(",")
                    ? [
                        {
                          key: `${prefix}-accept`,
                          label: `Take ${item.accepts}`,
                          onPress: () => actions.accept(index),
                        },
                      ]
                    : []),
                ])
              : null}
          </Box>
        ) : (
          <Box flexDirection="column" rowGap={tokens.gui.space.xs}>
            {editingAnswer || item.written || actions
              ? nativeQuestionField(
                  kit,
                  "write",
                  editingAnswer ? (
                    editor
                  ) : (
                    <Box flexDirection="column" rowGap={tokens.gui.space.xs}>
                      {item.written ? <Text>{`Answer: ${item.written}`}</Text> : null}
                      {actions ? (
                        <Button
                          key={`${prefix}-write`}
                          dimColor
                          label={item.written ? "Edit answer" : "Write your own answer"}
                          onPress={() => actions.edit(index, "write")}
                        />
                      ) : null}
                    </Box>
                  ),
                )
              : null}
            {actions && (answered || (item.canAccept && item.accepts.includes(",")))
              ? actionBar(kit, [
                  ...(answered
                    ? [
                        {
                          key: `${prefix}-clear`,
                          label: "Clear answer",
                          onPress: () => actions.clear(index),
                        },
                      ]
                    : []),
                  ...(item.canAccept && item.accepts.includes(",")
                    ? [
                        {
                          key: `${prefix}-accept`,
                          label: `Take ${item.accepts}`,
                          onPress: () => actions.accept(index),
                        },
                      ]
                    : []),
                ])
              : null}
            {editingNote || item.note || actions
              ? nativeQuestionField(
                  kit,
                  "note",
                  editingNote ? (
                    editor
                  ) : (
                    <Box flexDirection="column" rowGap={tokens.gui.space.xs}>
                      {item.note ? <Text dimColor>{item.note}</Text> : null}
                      {actions ? (
                        <Button
                          key={`${prefix}-note`}
                          label={item.note ? "Edit note" : "Add note"}
                          dimColor
                          onPress={() => actions.edit(index, "note")}
                        />
                      ) : null}
                    </Box>
                  ),
                )
              : null}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** Transcript cards and the surface's reply controls. */
export function nativeRound(
  kit: Kit,
  held: Held,
  current: Current | null,
  actions?: RoundActions,
  editor?: JSX.Element | null,
  sent = false,
) {
  const { Box, Text, Button } = kit;
  const view = current?.view ?? viewOf(held.form, held.draft);
  const writingAt = current?.writer ? view.step : -1;
  const live = actions;
  const reviewEditor = writingAt === view.count ? editor : null;
  const open = sent || (current ? view.isReview : true);
  return (
    <Box flexDirection="row" minWidth={0}>
      <Box
        width={tokens.prose}
        flexShrink={1}
        minWidth={0}
        flexDirection="column"
        rowGap={tokens.gui.space.md}
      >
        {held.form.items.map((_, index) =>
          nativeQuestion(
            kit,
            held,
            index,
            current,
            live,
            index === writingAt ? editor : null,
            sent,
          ),
        )}
        {kit.surface === "vscode" ? (
          <Box flexDirection="column" rowGap={tokens.gui.space.xs} paddingTop={tokens.gui.space.sm}>
            <Box paddingX={tokens.gui.across.inset} flexDirection="column">
              <Text dimColor>{`${view.answered}/${view.count} answered`}</Text>
              {sent ? <Text {...roleProps("success")}>Sent</Text> : null}
              {view.note ? <Text>{`Round note: ${view.note}`}</Text> : null}
            </Box>
            {live && view.reply
              ? actionBar(kit, [
                  { key: "send", label: "Send reply", isPrimary: true, onPress: live.send },
                  { key: "fill", label: "Fill prompt", onPress: live.fill },
                ])
              : null}
          </Box>
        ) : (
          <Box flexDirection="column" rowGap={tokens.gui.space.sm}>
            <Box
              flexDirection="row"
              flexWrap="wrap"
              alignItems="center"
              columnGap={tokens.gui.across.md}
            >
              {live ? (
                <Button
                  key="review"
                  label={open ? "Hide review" : "Review answers"}
                  dimColor={open || undefined}
                  onPress={() => live.go(view.count)}
                />
              ) : (
                <Text weight="semibold">{sent ? "Answers" : "Review answers"}</Text>
              )}
              <Text dimColor>{`${view.answered}/${view.count} answered`}</Text>
              {sent ? <Text {...roleProps("success")}>Sent</Text> : null}
            </Box>
            {open ? (
              <Box flexDirection="column" rowGap={tokens.gui.space.md}>
                <Box flexDirection="column" rowGap={tokens.gui.space.sm}>
                  {view.review.map((row, i) => (
                    <Box
                      key={row.label}
                      flexDirection="row"
                      columnGap={tokens.gui.across.md}
                      alignItems="flex-start"
                    >
                      {live ? (
                        <Button
                          key={`review-answer-${i}`}
                          label={row.label}
                          dimColor
                          onPress={() => live.go(i)}
                        />
                      ) : (
                        <Text dimColor>{row.label}</Text>
                      )}
                      <Box flexGrow={1} flexShrink={1} minWidth={0} flexDirection="column">
                        <Text weight="semibold">{row.title}</Text>
                        <Text dimColor={!row.isAnswered || undefined}>
                          {row.isAnswered ? row.shown : "Not answered"}
                        </Text>
                        {row.note ? <Text dimColor>{`Note: ${row.note}`}</Text> : null}
                      </Box>
                    </Box>
                  ))}
                </Box>
                {view.note ? <Text dimColor>{`Round note: ${view.note}`}</Text> : null}
                {reviewEditor}
                {live
                  ? actionBar(kit, [
                      ...(!reviewEditor
                        ? [
                            {
                              key: "round-note",
                              label: view.note ? "Edit round note" : "Add round note",
                              onPress: () => live.edit(view.count, "note"),
                            },
                          ]
                        : []),
                      ...(view.reply
                        ? [
                            { key: "fill", label: "Fill prompt", onPress: live.fill },
                            {
                              key: "send",
                              label: "Send reply",
                              isPrimary: true,
                              onPress: live.send,
                            },
                          ]
                        : []),
                    ])
                  : null}
              </Box>
            ) : null}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export const ROUND_FOCUS = "round-current";
const binding = (key: string) => `round-key-${key}`;
const shortcuts = "abcdefghijklmnopqrstuvwxyz";
/**
 * The host sends unmatched printable keys back to the prompt. While the band has the keys, bind
 * every letter so a slip stays there, and every digit so a row answers by its place on screen.
 */
function absorb(kit: Kit, press: (key: string) => unknown) {
  const { Box, Button } = kit;
  return (
    <Box width={0} height={0} overflow="hidden">
      {Array.from(`${shortcuts}${POSITIONS}`, (key) => (
        <Button key={binding(key)} plain hotkey={key} label={key} onPress={() => press(key)} />
      ))}
    </Box>
  );
}

export function controlBar(
  kit: Kit,
  current: Current,
  home: () => unknown,
  press: (key: string) => unknown,
) {
  const { Box, Text, Button } = kit;
  const { view } = current;
  const item = view.item;
  const letters =
    item?.entries
      .flatMap((entry, i) =>
        entry.kind !== "write" && /^[A-H]$/.test(entryLetter(entry, i))
          ? [entryLetter(entry, i)]
          : [],
      )
      .sort() ?? [];
  const write = item ? writeLetter(item) : "";
  const first = letters[0]?.charCodeAt(0) ?? 0;
  const picks =
    letters.length > 1 && letters.every((c, i) => c.charCodeAt(0) === first + i)
      ? `${letters[0]}–${letters.at(-1)}`
      : letters.join("");
  const position = view.isReview
    ? `Review  ${view.answered}/${view.count} answered`
    : `${view.item?.label}/${view.count}`;
  const hint = (hotkey: string, label: string) => ({ hotkey, label });
  // The guide's keys reach the band only while it has them. A click in the transcript hands them
  // back to the prompt and the host does not say so, and the band takes the keys from `Alt+a` or
  // `ctrl+x tab`, not from a click: until a move into the band proves otherwise, the row names
  // the chord instead of promising keys it cannot hear.
  if (!current.hasKeys)
    return (
      <Box columnGap={1}>
        <Button key={ROUND_FOCUS} plain autoFocus label={position} onPress={home}>
          <Text {...roleProps("accent")} weight="semibold">
            {position.padEnd(Math.max(6, cellWidth(`Q${view.count}/${view.count}`)))}
          </Text>
        </Button>
        {buttonRow(kit, [hint("alt+a", "for the keys")])}
        {absorb(kit, press)}
      </Box>
    );
  if (view.isReview) {
    // The last step offers the reply; with none yet, Enter goes back to the first question.
    const action = view.reply ? "fill" : "first question";
    return (
      <Box columnGap={1}>
        <Text {...roleProps("accent")} weight="semibold">
          {position}
        </Text>
        {buttonRow(
          kit,
          [
            hint("jk", "move"),
            {
              id: ROUND_FOCUS,
              hotkey: "enter",
              label: action,
              press: home,
              isLit: true,
              autoFocus: true,
            },
            hint("n", "note"),
            hint("r", "back"),
          ],
          true,
        )}
        <Text dimColor>keys here</Text>
        {absorb(kit, press)}
      </Box>
    );
  }
  return (
    <Box columnGap={1}>
      <Button key={ROUND_FOCUS} plain autoFocus label={position} onPress={home}>
        <Text {...roleProps("accent")} weight="semibold">
          {position.padEnd(Math.max(6, cellWidth(`Q${view.count}/${view.count}`)))}
        </Text>
      </Button>
      {buttonRow(
        kit,
        [
          hint("jk", "move"),
          ...(picks ? [hint(picks, "pick")] : []),
          hint(write, "write"),
          hint("n", "note"),
          hint("r", "review"),
        ],
        true,
      )}
      <Text dimColor>keys here</Text>
      {absorb(kit, press)}
    </Box>
  );
}
