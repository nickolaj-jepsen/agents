import { plain, view as viewOf } from "../core/forms";
import { POSITIONS } from "./terminal";
import type { Current, Editing, Held, View } from "./types.d.ts";
import {
  actionBar,
  buttonRow,
  cellWidth,
  clamp,
  choice,
  icon,
  inlineMarkdown,
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
  focusReview?: (index: number) => unknown;
};

const labelOf = (text: string) => text.replace(/^[A-H][.)]\s*/, "");

/** Markdown that `inlineMarkdown` cannot set: a list, a heading, a quote, a fence or a table. */
const BLOCKS = /^\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|>|```|~~~|\|)/m;

type Entry = NonNullable<View["item"]>["entries"][number];

/**
 * The key a terminal card draws and binds for an entry: its own letter, or `A` for a yes, which
 * never sits beside options.
 */
export const entryLetter = (entry: Entry) => (entry.kind === "accept" ? "A" : entry.key);

export function writeLetter(item: NonNullable<View["item"]>) {
  const last = Math.max(
    64,
    ...item.entries.map((entry) =>
      /^[A-H]$/.test(entryLetter(entry)) ? entryLetter(entry).charCodeAt(0) : 64,
    ),
  );
  return String.fromCharCode(last + 1);
}

function inlineField(
  kit: Kit,
  key: string,
  label: string,
  placeholder: string,
  value: string,
  press?: () => unknown,
  style?: { tag: JSX.Element; valueRole: "accent" | "note" | "success" },
) {
  const { Box, Text, Button } = kit;
  const content = value || placeholder;
  const field = <Text {...roleProps(value ? (style?.valueRole ?? "note") : "dim")}>{content}</Text>;
  const tag = style?.tag ?? <Text {...roleProps("dim")}>{label}</Text>;
  if (press && !content.includes("\n") && cellWidth(content) + cellWidth(label) + 2 <= kit.columns)
    return (
      <Button key={key} plain label={`${label} ${content}`} onPress={press}>
        <Text>
          {tag} {field}
        </Text>
      </Button>
    );
  return (
    <Box key={`${key}-line`} columnGap={1} alignItems="flex-start">
      {press ? (
        <Button key={key} plain label={label} onPress={press}>
          {tag}
        </Button>
      ) : (
        tag
      )}
      <Box flexShrink={1}>{field}</Box>
    </Box>
  );
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
  const { single, multi, pointer } = tokens.glyph;
  const marker = several ? multi : single;
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

  const heading = `${item.label}  ${item.title}`;
  const answerTone = sent ? "success" : "note";
  const selectionTone = isActive && !kit.isNative ? "accent" : answerTone;
  const letterTone = (chosen: boolean) => (isActive ? "accent" : chosen ? answerTone : "dim");
  const writeMark = item.written ? single.on : single.off;
  const titleRole = roleProps(
    isActive ? "accent" : !kit.isNative && answered ? answerTone : "text",
  );
  const pointerText = isActive ? `${pointer} ` : "  ";
  // The heading wrapped by the kit to hang under its label, so one Button holds it whole and a
  // click on any of its lines lands; its markdown set as the body's is.
  const terminalHeading = (
    <Text weight="semibold" {...titleRole}>
      {pointerText}
      {inlineMarkdown(kit, heading, {
        width: kit.columns - cellWidth(pointerText) - (answered ? 3 : 0),
        indent: cellWidth(pointerText),
      })}
      {answered ? <Text {...roleProps(selectionTone)}> ✓</Text> : null}
    </Text>
  );
  const activate = !kit.isNative ? (
    interactive ? (
      <Button
        key={`${prefix}-activate`}
        plain
        label={heading}
        onPress={() => interactive.go(index)}
      >
        {terminalHeading}
      </Button>
    ) : (
      terminalHeading
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
      borderColor={
        !kit.isNative
          ? isActive
            ? tokens.role.accent
            : answered
              ? tokens.role[answerTone]
              : undefined
          : undefined
      }
      borderDimColor={(!kit.isNative && !isActive && !answered) || undefined}
      paddingX={1}
    >
      {stack(
        kit,
        [
          activate,
          item.body ? <Markdown text={item.body} /> : null,
          hasChoices || (!kit.isNative && (interactive || item.written)) ? (
            <Box flexDirection="column" rowGap={kit.isNative ? tokens.gui.space.xs : 0}>
              {item.entries.map((entry, i) => {
                if (entry.kind === "write") return null;
                const mark = entry.isChosen ? marker.on : marker.off;
                const words = labelOf(entry.text);
                const tag = entryLetter(entry) ? `${entryLetter(entry)} ` : "";
                const recommendation = entry.isRecommended ? "  Recommended" : "";
                // A Button's label is plain words: it draws no markdown.
                const said = plain(words);
                const label = `${tag}${mark} ${said}${recommendation}`;
                const weight = entry.isChosen ? "semibold" : undefined;
                const pick = () => interactive?.pick(index, i);
                const key = `${prefix}-choose-${i}`;
                const letterRole = roleProps(letterTone(entry.isChosen));
                const markRole = roleProps(entry.isChosen ? selectionTone : "dim");
                const choiceRole = roleProps(
                  !kit.isNative && entry.isChosen ? selectionTone : "text",
                );
                const lead = cellWidth(`${tag}${mark} `);
                const lines = { width: kit.columns - 1 - lead, indent: lead };
                const hang = `\n${" ".repeat(lead)}`;
                // A detail of plain paragraphs is the option's too; one with blocks keeps its
                // Markdown under the row.
                const isDetailInline =
                  !kit.isNative && !!entry.detail && !BLOCKS.test(entry.detail);
                // One Text the row's Button holds whole, so a click on any of its lines picks it:
                // the words wrapped by the kit to hang under their first line, their markdown set.
                const option = kit.isNative ? null : (
                  <Text>
                    <Text weight={weight} {...choiceRole}>
                      {tag ? (
                        <Text weight="semibold" {...letterRole}>
                          {tag}
                        </Text>
                      ) : null}
                      <Text {...markRole}>{`${mark} `}</Text>
                      {inlineMarkdown(kit, words, { ...lines, aside: recommendation })}
                    </Text>
                    {isDetailInline ? (
                      <Text dimColor>
                        {entry.detail.split(/\n\s*\n/).map((paragraph, p) => (
                          <Text key={`detail${p}`}>
                            {p ? `\n${hang}` : hang}
                            {inlineMarkdown(kit, paragraph, { ...lines, isDim: true })}
                          </Text>
                        ))}
                      </Text>
                    ) : null}
                  </Text>
                );
                return (
                  <Box
                    key={`${prefix}-option-${i}`}
                    flexDirection="column"
                    paddingLeft={kit.isNative ? 0 : 1}
                  >
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
                    ) : interactive ? (
                      <Button key={key} plain label={label} onPress={pick}>
                        {option}
                      </Button>
                    ) : (
                      option
                    )}
                    {entry.detail && !isDetailInline ? (
                      <Box paddingLeft={kit.isNative ? 1 : 4}>
                        <Markdown text={entry.detail} dimColor />
                      </Box>
                    ) : null}
                  </Box>
                );
              })}
              {!kit.isNative && (interactive || item.written) ? (
                <Box paddingLeft={1}>
                  {inlineField(
                    kit,
                    `${prefix}-write`,
                    `${writeLetter(item)} ${writeMark}`,
                    "Write your own answer",
                    item.written,
                    interactive && (() => interactive.edit(index, "write")),
                    {
                      tag: (
                        <Text {...roleProps(letterTone(!!item.written))}>
                          {writeLetter(item)} <Text {...roleProps("dim")}>{writeMark}</Text>
                        </Text>
                      ),
                      valueRole: selectionTone,
                    },
                  )}
                </Box>
              ) : null}
            </Box>
          ) : null,
          item.recommended ? (
            <Markdown text={`**Recommended:** ${item.recommended}`} dimColor />
          ) : null,
          kit.isNative && item.written ? (
            <Text>
              <Text weight="semibold" {...roleProps(sent ? "success" : "note")}>
                {"Answer: "}
              </Text>
              {item.written}
            </Text>
          ) : null,
          interactive && answered ? (
            <Box paddingLeft={kit.isNative ? 0 : 1}>
              <Button
                key={`${prefix}-clear`}
                plain={kit.isNative ? undefined : true}
                dimColor
                label="Clear answer"
                onPress={() => interactive.clear(index)}
              >
                {kit.isNative ? null : <Text>Clear answer</Text>}
              </Button>
            </Box>
          ) : null,
          kit.isNative ? (
            item.note ? (
              noteLines(kit, item.note, { role: "note" })
            ) : null
          ) : interactive || item.note ? (
            <Box paddingLeft={1}>
              {inlineField(
                kit,
                `${prefix}-note`,
                "Note:",
                item.note ? "" : "Add a note",
                item.note,
                interactive && (() => interactive.edit(index, "note")),
              )}
            </Box>
          ) : null,
          editor ?? null,
          !controls.length ? null : kit.isNative ? (
            actionBar(kit, controls)
          ) : (
            <Box columnGap={tokens.gutter} flexWrap="wrap" paddingLeft={1}>
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

// Group rows so Claude's spacing between transcript entries is not repeated on every row.
const reviewHeading = "review-heading";
const reviewRow = (index: number) => `review-row-${index}`;

export function reviewTarget(view: View, cursor: number | undefined) {
  return cursor === undefined || cursor < 0 || cursor >= view.count
    ? reviewHeading
    : reviewRow(cursor);
}

export function terminalReview(
  outer: Kit,
  view: View,
  current: Current | null,
  actions: RoundActions | undefined,
  sent: boolean,
) {
  const { Box, Text, Button } = outer;
  const width = widthCap("reading", outer.columns);
  const kit = withColumns(outer, Math.max(1, width - 4));
  const open = current?.view.isReview === true;
  const cursor = current?.reviewCursor ?? (view.reply ? -1 : 0);
  const answerTone = sent ? "success" : "note";
  const cardTone = open ? "accent" : view.answered ? answerTone : "text";
  const title = `Answers  ${view.answered} of ${view.count} answered`;
  const pageSize = REVIEW_PAGE;
  const start = open ? Math.floor(Math.max(0, cursor) / pageSize) * pageSize : 0;
  const end = Math.min(start + pageSize, view.count);
  const toggle = open
    ? "Hide questions"
    : `Show ${view.count === 1 ? "question" : `all ${view.count} questions`}`;
  const header = (
    <Box key={reviewHeading} flexDirection="column">
      <Text weight="semibold" {...roleProps(cardTone)}>
        {`  ${title}`}
        {sent ? <Text {...roleProps("success")}> ✓ Sent</Text> : null}
      </Text>
      {actions ? (
        <Box columnGap={tokens.gutter} flexWrap="wrap" paddingLeft={1}>
          {view.reply ? (
            <Button
              key="review-fill"
              variant="primary"
              label={open && cursor < 0 ? `${tokens.glyph.pointer} Fill prompt` : "Fill prompt"}
              onPress={actions.fill}
            />
          ) : null}
          <Button key="review-toggle" label={toggle} plain onPress={() => actions.go(view.count)}>
            <Text dimColor>{`${open ? "▾" : "▸"} ${toggle}`}</Text>
          </Button>
        </Box>
      ) : null}
    </Box>
  );
  const rowAt = (row: View["review"][number], i: number) => {
    const selected = open && cursor === i;
    const prefix = `${selected ? tokens.glyph.pointer : " "} ${row.label.padEnd(cellWidth(`Q${view.count}`))}  `;
    const indent = cellWidth(prefix);
    const textWidth = Math.max(1, kit.columns - indent);
    const tone = selected ? "accent" : row.isAnswered ? answerTone : "text";
    const [first, ...rest] = clamp(`${row.title}${row.isAnswered ? " ✓" : ""}`, textWidth);
    const heading = (
      <Text weight="semibold" {...roleProps(tone)}>
        {prefix}
        {first}
      </Text>
    );
    return (
      <Box key={reviewRow(i)} flexDirection="column">
        {actions ? (
          <Button
            key={`${reviewRow(i)}-jump`}
            plain
            label={`${row.label} ${row.title}`}
            onPress={() => actions.go(i)}
          >
            {heading}
          </Button>
        ) : (
          heading
        )}
        <Box flexDirection="column" paddingLeft={indent}>
          {rest.length ? (
            <Text weight="semibold" {...roleProps(tone)}>
              {rest.join("\n")}
            </Text>
          ) : null}
          <Text
            weight={row.isAnswered ? "semibold" : undefined}
            {...roleProps(row.isAnswered ? tone : "dim")}
          >
            {row.isAnswered ? clamp(row.shown, textWidth).join("\n") : "Unanswered"}
          </Text>
          {row.note
            ? inlineField(
                withColumns(kit, textWidth),
                `${reviewRow(i)}-note`,
                "Note:",
                "",
                row.note,
              )
            : null}
        </Box>
      </Box>
    );
  };
  return (
    <Box
      width={width}
      borderStyle="quote"
      borderColor={cardTone === "text" ? undefined : tokens.role[cardTone]}
      borderDimColor={!open && !view.answered}
      paddingX={1}
      flexDirection="column"
    >
      {header}
      {open || sent ? (
        <Box paddingTop={1} flexDirection="column">
          {open && view.count > pageSize ? (
            <Box columnGap={tokens.gutter} paddingLeft={1}>
              <Text dimColor>{`Questions ${start + 1}–${end} of ${view.count}`}</Text>
              {start > 0 && actions?.focusReview ? (
                <Button
                  key="review-prev"
                  plain
                  label="Previous"
                  onPress={() => actions.focusReview?.(start - pageSize)}
                />
              ) : null}
              {end < view.count && actions?.focusReview ? (
                <Button
                  key="review-next"
                  plain
                  label="Next"
                  onPress={() => actions.focusReview?.(end)}
                />
              ) : null}
            </Box>
          ) : null}
          {(open ? view.review.slice(start, end) : view.review).map((row, i) =>
            rowAt(row, start + i),
          )}
        </Box>
      ) : null}
    </Box>
  );
}

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
    const label =
      entry.kind === "accept"
        ? entry.text.replace(/^(?:Yes:\s*)?(?:Yes\b[.,:]?\s*)?/i, "") || "As recommended"
        : labelOf(entry.text);
    return [
      {
        key: `${prefix}-choose-${i}`,
        tag: entry.kind === "accept" ? "Yes" : entry.key,
        label,
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
/** The rows one page of the review holds, so a digit answers a row of the page on screen. */
export const REVIEW_PAGE = 5;
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
      .flatMap((entry) =>
        entry.kind === "accept" || (entry.kind === "option" && /^[A-H]$/.test(entry.key))
          ? [entryLetter(entry)]
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
    const action = view.reply && (current.reviewCursor ?? -1) < 0 ? "fill" : "open";
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
            ...(view.reply && action !== "fill" ? [hint("f", "fill")] : []),
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
