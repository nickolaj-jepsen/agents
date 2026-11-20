import { view as viewOf } from "../core/forms";
import type { Current, Editing, Held, View } from "./types.d.ts";
import {
  actionBar,
  cellWidth,
  clamp,
  note as noteLines,
  roleProps,
  section,
  stack,
  tokens,
  widthCap,
  withColumns,
  type Kit,
} from "./ui";

export type RoundActions = {
  go: (index: number) => unknown;
  pick: (question: number, entry: number) => unknown;
  edit: (question: number, field: NonNullable<Editing>, from?: number) => unknown;
  clear: (question: number) => unknown;
  accept: (question: number) => unknown;
  fill: () => unknown;
  send: () => unknown;
  focusReview?: (index: number) => unknown;
};

const labelOf = (text: string) => text.replace(/^[A-H][.)]\s*/, "");

export function writeLetter(item: NonNullable<View["item"]>) {
  const last = Math.max(
    64,
    ...item.entries.map((entry) => (/^[A-H]$/.test(entry.key) ? entry.key.charCodeAt(0) : 64)),
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
                label: item.note ? "Edit note" : "Write note",
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
  const terminalHeading = (
    <Text weight="semibold" {...titleRole}>
      {heading}
      {answered ? <Text {...roleProps(selectionTone)}> ✓</Text> : null}
    </Text>
  );
  const activate =
    !kit.isNative && interactive && cellWidth(heading) + (answered ? 5 : 2) <= kit.columns ? (
      <Button
        key={`${prefix}-activate`}
        plain
        label={heading}
        onPress={() => interactive.go(index)}
      >
        <Text weight="semibold" {...titleRole}>
          {pointerText}
          {terminalHeading}
        </Text>
      </Button>
    ) : (
      <Box columnGap={kit.isNative ? tokens.gui.across.sm : 0} alignItems="flex-start">
        {kit.isNative ? (
          <Text {...titleRole} weight="semibold">
            {item.label}
          </Text>
        ) : (
          <Text {...titleRole}>{pointerText}</Text>
        )}
        <Box flexShrink={1} width={0} flexGrow={1}>
          {kit.isNative ? (
            <Text weight="semibold" {...titleRole}>
              {item.title}
            </Text>
          ) : (
            terminalHeading
          )}
        </Box>
        {kit.isNative && isActive ? <Text {...titleRole}>Current</Text> : null}
      </Box>
    );

  return (
    <Box
      key={item.label}
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
                const tag = entry.key ? `${entry.key} ` : "";
                const recommendation = entry.isRecommended ? "  Recommended" : "";
                const label = `${tag}${mark} ${words}${recommendation}`;
                const weight = entry.isChosen ? "semibold" : undefined;
                const pick = () => interactive?.pick(index, i);
                const key = `${prefix}-choose-${i}`;
                const letterRole = roleProps(letterTone(entry.isChosen));
                const markRole = roleProps(entry.isChosen ? selectionTone : "dim");
                const choiceRole = roleProps(
                  !kit.isNative && entry.isChosen ? selectionTone : "text",
                );
                const option = (
                  <Text weight={weight} {...choiceRole}>
                    {tag ? (
                      <Text weight="semibold" {...letterRole}>
                        {tag}
                      </Text>
                    ) : null}
                    <Text {...markRole}>{`${mark} `}</Text>
                    {words}
                    {recommendation ? <Text dimColor>{recommendation}</Text> : null}
                  </Text>
                );
                const short = cellWidth(label) <= kit.columns - 1;
                return (
                  <Box
                    key={`${prefix}-option-${i}`}
                    flexDirection="column"
                    paddingLeft={kit.isNative ? 0 : 1}
                  >
                    {kit.isNative ? (
                      <Box columnGap={tokens.gui.across.sm} alignItems="flex-start">
                        {interactive ? (
                          <Button
                            key={key}
                            label={entry.key || words}
                            dimColor={!entry.isChosen || undefined}
                            onPress={pick}
                          />
                        ) : null}
                        {entry.key || !interactive ? (
                          <Box flexShrink={1} width={0} flexGrow={1}>
                            <Text weight={weight}>
                              {entry.key && !interactive ? `${entry.key}  ` : ""}
                              {words}
                              {entry.isChosen ? (
                                <Text {...markRole}>{sent ? "  Sent" : "  Picked"}</Text>
                              ) : null}
                              {recommendation ? <Text dimColor>{recommendation}</Text> : null}
                            </Text>
                          </Box>
                        ) : null}
                      </Box>
                    ) : interactive && short ? (
                      <Button key={key} plain label={label} onPress={pick}>
                        {option}
                      </Button>
                    ) : interactive ? (
                      <Box columnGap={1} alignItems="flex-start">
                        <Button key={key} plain label={`${tag}${mark}`} onPress={pick}>
                          <Text {...letterRole}>
                            {tag}
                            <Text {...markRole}>{mark}</Text>
                          </Text>
                        </Button>
                        <Box flexShrink={1}>
                          <Text weight={weight} {...choiceRole}>
                            {words}
                            <Text dimColor>{recommendation}</Text>
                          </Text>
                        </Box>
                      </Box>
                    ) : (
                      option
                    )}
                    {entry.detail ? (
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
  const pageSize = 5;
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
            <Button key="review-fill" label="Fill prompt" plain onPress={actions.fill}>
              <Text weight="semibold" {...roleProps(open && cursor < 0 ? "accent" : "note")}>
                {`${open && cursor < 0 ? tokens.glyph.pointer : " "} Fill prompt`}
              </Text>
            </Button>
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

export function reviewCard(
  outer: Kit,
  view: View,
  active: boolean,
  actions?: RoundActions,
  editor?: JSX.Element | null,
  sent = false,
) {
  const { Box, Text, Button } = outer;
  const width = widthCap("reading", outer.columns);
  const kit = withColumns(outer, Math.max(1, width - 4));
  const title = `${active && !outer.isNative ? `${tokens.glyph.pointer} ` : ""}Review answers  ${view.answered}/${view.count}`;
  return (
    <Box
      key="review-card"
      width={outer.isNative ? undefined : width}
      paddingX={outer.isNative ? undefined : 1}
      borderStyle={outer.isNative ? undefined : "round"}
      borderColor={!outer.isNative && active ? tokens.role.accent : undefined}
      borderDimColor={(!outer.isNative && !active) || undefined}
      backgroundColor={outer.isNative ? undefined : "userMessageBackground"}
    >
      {stack(
        kit,
        [
          <Box flexDirection="column">
            {outer.isNative ? (
              section(kit, title)
            ) : (
              <Text weight="semibold" {...roleProps(active ? "accent" : "text")}>
                {title}
              </Text>
            )}
            {sent ? (
              <Text weight="semibold" {...roleProps("success")}>
                {outer.isNative ? "Sent" : "✓ Sent"}
              </Text>
            ) : null}
          </Box>,
          <Box
            flexDirection="column"
            rowGap={kit.isNative ? tokens.gui.space.sm : 1}
            paddingX={kit.isNative ? tokens.gui.across.inset : undefined}
          >
            {view.review.map((row, i) => (
              <Box key={row.label} flexDirection="column">
                <Box columnGap={1} alignItems="flex-start">
                  {actions && !outer.isNative ? (
                    <Button
                      key={`review-answer-${i}`}
                      label={row.label}
                      plain
                      dimColor
                      onPress={() => actions.go(i)}
                    />
                  ) : (
                    <Text dimColor>{row.label}</Text>
                  )}
                  <Box flexShrink={1}>
                    <Text weight="semibold">{row.title}</Text>
                  </Box>
                </Box>
                <Box flexDirection="column" paddingLeft={outer.isNative ? undefined : 4}>
                  {row.isAnswered ? (
                    outer.isNative ? (
                      <Text>
                        <Text {...roleProps(sent ? "success" : "note")}>
                          {sent ? "Sent  " : "Picked  "}
                        </Text>
                        {row.shown}
                      </Text>
                    ) : (
                      <Text {...roleProps(sent ? "success" : "note")}>{row.shown}</Text>
                    )
                  ) : (
                    <Text dimColor>Unanswered</Text>
                  )}
                  {row.note
                    ? outer.isNative
                      ? noteLines(kit, row.note, { role: "note" })
                      : inlineField(
                          kit,
                          `review-note-${i}`,
                          "Note",
                          `Edit note for ${row.label}`,
                          row.note,
                          actions && (() => actions.edit(i, "note", view.count)),
                        )
                    : null}
                  {outer.isNative && row.note && actions ? (
                    <Button
                      key={`review-note-${i}`}
                      label={`Edit note for ${row.label}`}
                      plain={!outer.isNative || undefined}
                      dimColor
                      onPress={() => actions.edit(i, "note", view.count)}
                    />
                  ) : null}
                </Box>
              </Box>
            ))}
          </Box>,
          view.note
            ? outer.isNative
              ? noteLines(kit, view.note, { role: "note" })
              : inlineField(kit, "review-note", "Note", "Edit round note", view.note)
            : null,
          editor ?? null,
          actions
            ? actionBar(kit, [
                {
                  key: "round-note",
                  label: view.note ? "Edit round note" : "Write round note",
                  onPress: () => actions.edit(view.count, "note"),
                },
                ...(view.reply
                  ? [
                      {
                        key: "fill",
                        label: "Fill prompt",
                        onPress: actions.fill,
                      },
                      {
                        key: "send",
                        label: "Send reply",
                        onPress: actions.send,
                        isPrimary: true,
                      },
                    ]
                  : []),
              ])
            : null,
        ],
        { gui: { gap: "sm" } },
      )}
    </Box>
  );
}

export const ROUND_FOCUS = "round-current";
export const PENDING_FOCUS = "write-handoff";
const binding = (key: string) => `round-key-${key}`;
const shortcuts = "abcdefghijklmnopqrstuvwxyz";

/**
 * The host sends unmatched printable keys back to the prompt. While the band has the keys, bind
 * every letter so a slip stays there. `press` is what each does; a handoff only keeps them.
 */
function absorb(kit: Kit, press: (key: string) => unknown) {
  const { Box, Button } = kit;
  return (
    <Box width={0} height={0} overflow="hidden">
      {Array.from(shortcuts, (key) => (
        <Button key={binding(key)} plain hotkey={key} label={key} onPress={() => press(key)} />
      ))}
    </Box>
  );
}

/**
 * The field a transcript click asked for, with the way into it. Nothing here takes typing: the
 * keys stay in the prompt until `Alt+a` gives them to the band. A click on this row does not give
 * them (the band takes the keys from the chord or `ctrl+x tab`, not from a press), so it names
 * only the chord.
 */
export function writePending(
  kit: Kit,
  current: Current,
  onWrite: () => unknown,
  onCancel: () => unknown,
) {
  const { Box, Text, Button } = kit;
  const pending = current.pending;
  if (!pending) return null;
  const item = current.view.item;
  const field = pending.field === "note" ? "Note" : "Answer";
  const where = item ? `${field} · ${item.label} ${item.title}` : field;
  const caption = clamp(where, Math.max(1, kit.columns - 24), {
    min: 1,
    max: 1,
  }).join("");
  const hint = current.hasKeys ? "Enter writes it" : "Alt+a, then Enter, writes it";
  return (
    <Box columnGap={1}>
      <Button
        key={PENDING_FOCUS}
        plain
        autoFocus
        label={`write ${field.toLowerCase()}`}
        onPress={onWrite}
      >
        <Text weight="semibold" {...roleProps("accent")}>
          {caption}
        </Text>
        <Text dimColor>{`  ${hint}`}</Text>
      </Button>
      <Button key="pending-cancel" plain dimColor label="Cancel" onPress={onCancel} />
      {absorb(kit, () => undefined)}
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
      .flatMap((entry) => (entry.kind === "option" && /^[A-H]$/.test(entry.key) ? [entry.key] : []))
      .sort() ?? [];
  const write = item ? writeLetter(item) : "";
  const first = letters[0]?.charCodeAt(0) ?? 0;
  const picks =
    letters.length > 1 && letters.every((c, i) => c.charCodeAt(0) === first + i)
      ? `${letters[0]}–${letters.at(-1)}`
      : letters.join("");
  const pickWidth = 9;
  const position = view.isReview
    ? `Review  ${view.answered}/${view.count} answered`
    : `${view.item?.label}/${view.count}`;
  const hint = (keys: string, label: string, enabled = true) =>
    enabled ? (
      <Text>
        <Text {...roleProps("note")}>{keys}</Text>
        <Text dimColor>{` ${label}`}</Text>
      </Text>
    ) : (
      <Text dimColor>{`${keys} ${label}`}</Text>
    );
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
        <Text>
          <Text {...roleProps("note")}>alt+a</Text>
          <Text dimColor> for the keys</Text>
        </Text>
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
        <Text>{hint("jk", "move")}</Text>
        <Button key={ROUND_FOCUS} plain autoFocus label={`Enter to ${action}`} onPress={home}>
          <Text>{hint("enter", action)}</Text>
        </Button>
        {view.reply && action !== "fill" ? <Text>{hint("f", "fill")}</Text> : null}
        <Text>{hint("r", "back")}</Text>
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
      <Text>{hint("jk", "move")}</Text>
      <Text>
        {picks ? hint(picks, "pick") : null}
        {" ".repeat(Math.max(1, pickWidth - (picks ? cellWidth(picks) + 5 : 0)))}
        {hint(write, "write")}
        {"  "}
        {hint("n", "note")}
        {"  "}
        {hint("r", "review")}
      </Text>
      <Text dimColor>keys here</Text>
      {absorb(kit, press)}
    </Box>
  );
}
