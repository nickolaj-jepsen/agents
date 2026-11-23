/**
 * The question card on the graphical surfaces. A question's answers stand as rows, each a
 * row of a mark (an icon: open or chosen), the key's Button and its words; the letter is a Button
 * because a Box has no press handler, and a Button's label never wraps. The note is a panel with
 * a full-width field; the steps are tabs, the current one a label; each answer in review is a
 * label in a label column. A card draws no pointer or hover of its own: the host draws those.
 * Rows keep the kit's beat (`rowOf`, `rows`).
 */
import { can } from "@agents/kit-core/surfaces.ts";
import {
  capital,
  meaning,
  panel,
  rowOf,
  rows,
  typed,
  type Gui,
} from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import {
  choiceHit,
  lineHit,
  type Choice,
  type ChoiceList,
  type Closing,
  type FieldProps,
  type Heading,
  type Note,
  type Step,
  type Summary,
} from "./contract.ts";

const { space, across, lead } = tokens.gui;

/** The column that leads a row of answers: the mark's icon and the key's Button. */
const LEAD = lead + 2.2;

const INVITATION = "Write your own answer";

/** A Button that presses its `hit`, quiet: the surface fills any other, and one button of a screen is lit. */
function control(g: Gui, o: { key: string; label: string; hit?: string }): JSX.Element {
  const { Button } = g.els;
  return (
    <Button
      key={o.key}
      dimColor
      label={o.label}
      onPress={() => (o.hit ? g.press(o.hit) : undefined)}
    />
  );
}

/**
 * A field for the host's `Input`, the width of its room: one, or with `lines` (and a host whose
 * field is one line) one per line of its text, the later ones at `lineHit(hit, i)`.
 */
function field(
  g: Gui,
  o: { key: string; value: string; placeholder: string; hit: string; rows?: number },
  fp: FieldProps,
): JSX.Element {
  const { Box, Input } = g.els;
  const first = fp.autoFocus || undefined;
  if (!fp.lines || !can(g, "inputRows:1"))
    return (
      <Input
        key={o.key}
        value={o.value}
        placeholder={o.placeholder}
        autoFocus={first}
        rows={o.rows ?? (fp.rows && fp.rows > 1 ? fp.rows : undefined)}
        onInput={(text) => g.input(o.hit, text)}
        onSubmit={(text) => g.submit(o.hit, text)}
      />
    );
  const parts = o.value.split("\n");
  const count = Math.max(fp.lines, parts.length);
  return (
    <Box flexDirection="column" rowGap={space.sm}>
      {Array.from({ length: count }, (_, i) => (
        <Input
          key={i ? `${o.key}:${i}` : o.key}
          autoFocus={(!i && first) || undefined}
          value={parts[i] ?? ""}
          placeholder={i ? `Line ${i + 1}` : o.placeholder}
          onInput={(text) => g.input(lineHit(o.hit, i), text)}
          onSubmit={(text) => g.submit(lineHit(o.hit, i), text)}
        />
      ))}
    </Box>
  );
}

/** The question: its label dim in the lead column, then its title as the heading. */
export function heading(g: Gui, question: Heading): JSX.Element {
  const { Box, Markdown } = g.els;
  return (
    <Box flexDirection="row" columnGap={across.sm} paddingX={across.inset} alignItems="flex-start">
      {question.label ? (
        <Box flexShrink={0} minWidth={LEAD}>
          {typed(g, "caption", question.label)}
        </Box>
      ) : null}
      <Box width={0} flexGrow={1} flexShrink={1}>
        {/* The title is inline Markdown, so the host's own heading sets it. */}
        <Markdown text={`### ${question.title}`} />
      </Box>
      {question.answered ? (
        <Box flexShrink={0}>{meaning(g, "state:success", { alt: "Answered" })}</Box>
      ) : null}
    </Box>
  );
}

/**
 * One answer: the mark (an icon, filled where chosen), the letter on a quiet Button and its
 * words beside them, the dim aside after them on their line and the detail under them. A
 * write-in is the host's `Input` in place of the words. With no key the mark stands alone.
 */
export function choice(g: Gui, c: Choice): JSX.Element {
  const { Box, Text, Markdown } = g.els;
  const invitation = c.invitation ?? INVITATION;
  const mark = meaning(g, c.chosen ? "choice:chosen" : "choice:open", {
    alt: c.chosen ? "Chosen" : "Not chosen",
  });
  const letter = c.key
    ? control(g, { key: `key:${c.hit ?? c.key}`, label: capital(c.key), hit: c.hit })
    : null;
  const body =
    c.literal && can(g, "input") ? (
      field(
        g,
        {
          key: `write:${c.hit ?? c.key}`,
          value: c.text === invitation ? "" : c.text,
          placeholder: invitation,
          hit: c.hit ?? "",
        },
        c,
      )
    ) : c.literal ? (
      <Text>{c.text}</Text>
    ) : c.aside ? (
      // The aside stands on the label's line, after it, and wraps with it.
      <Box flexDirection="row" flexWrap="wrap" columnGap={across.sm} alignItems="flex-start">
        <Box flexShrink={1}>
          <Markdown text={c.text} />
        </Box>
        <Text dimColor>{c.aside}</Text>
      </Box>
    ) : (
      <Markdown text={c.text} />
    );
  // The mark and the key stand at the first line of the words, whatever the words take.
  return (
    <Box
      key={`choice:${c.hit ?? c.key}`}
      flexDirection="row"
      alignItems="flex-start"
      columnGap={across.sm}
      paddingY={tokens.gui.row.pad}
    >
      <Box
        key="lead"
        flexDirection="row"
        alignItems="center"
        columnGap={across.xs}
        flexShrink={0}
        minWidth={LEAD}
      >
        {mark}
        {letter}
      </Box>
      <Box
        key="body"
        flexDirection="column"
        width={0}
        flexGrow={1}
        flexShrink={1}
        rowGap={space.xs}
      >
        {body}
        {c.aside && c.literal ? <Text dimColor>{c.aside}</Text> : null}
        {c.detail ? <Markdown text={c.detail} dimColor /> : null}
      </Box>
    </Box>
  );
}

/**
 * The answers of one question as rows that keep one beat. They are tied together by their
 * marks and the one left edge, not by a rail or an outline: the host draws no left border, and a
 * visible round border is not allowed (`expectNative`), nor a fill for rows that are always there.
 */
export function choices(g: Gui, all: readonly Choice[]): JSX.Element {
  const { Box } = g.els;
  return (
    <Box key="choices" flexDirection="column" paddingX={across.inset}>
      {rows(g, {}, ...all.map((c) => choice(g, c)))}
    </Box>
  );
}

/** A list of answers; several of many toggle, one of many replaces. */
export function choiceList(g: Gui, list: ChoiceList): JSX.Element {
  return choices(
    g,
    list.items.map((item, i) => ({
      key: item.key,
      text: item.text,
      detail: item.detail,
      chosen: list.chosen.includes(i),
      multiple: list.multiple,
      literal: item.writeIn,
      hit: choiceHit(i),
    })),
  );
}

/**
 * The card's note, in a panel: a caption and a field the panel's whole width, under the answers.
 * On a surface with no field the note is its words.
 */
export function note(g: Gui, n: Note): JSX.Element {
  const { Box } = g.els;
  const hit = n.hit ?? "note";
  const body = can(g, "input")
    ? field(
        g,
        {
          key: `note:${hit}`,
          value: n.value,
          placeholder: n.invitation ?? "Add a note",
          rows: n.max && n.max > 1 ? n.max : undefined,
          hit,
        },
        n,
      )
    : typed(g, "body", n.value);
  return (
    <Box key={`panel:${hit}`} flexDirection="column" paddingX={across.inset}>
      {panel(g, {}, typed(g, "caption", "Note"), body)}
    </Box>
  );
}

/**
 * The steps of several questions as tabs: a done one marked with a tick, the others quiet
 * Buttons, and the current one a label, which is where the person is and not a control. A name
 * too long for a Button is left out for the step's short word.
 */
export function steps(g: Gui, all: readonly Step[]): JSX.Element | undefined {
  const { Box } = g.els;
  if (all.length === 0) return undefined;
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      alignItems="center"
      columnGap={across.sm}
      rowGap={space.xs}
      paddingX={across.inset}
    >
      {all.map((step, i) => {
        const named = step.name && step.name.length <= tokens.gui.maxLabel;
        const label = named ? `${step.short} ${step.name}` : step.short;
        return (
          <Box
            key={`step:${step.hit ?? i}`}
            flexDirection="row"
            alignItems="center"
            columnGap={across.xs}
          >
            {step.done && !step.current ? meaning(g, "state:success", { alt: "Done" }) : null}
            {step.current
              ? typed(g, "body", label)
              : control(g, { key: `tab:${step.hit ?? i}`, label, hit: step.hit })}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * A question's answers for review: its label in the label column, then its title, one line per
 * answer and the note. The label is words, not a Button; where the question can be gone back to
 * from here (a `hit`) a quiet Change stands at the row's far edge.
 */
export function summary(g: Gui, s: Summary): JSX.Element {
  const { Box, Text, Markdown } = g.els;
  return (
    <Box flexDirection="row" columnGap={across.sm} paddingX={across.inset} alignItems="flex-start">
      <Box flexShrink={0} minWidth={LEAD}>
        {typed(g, "caption", s.label)}
      </Box>
      <Box flexDirection="column" width={0} flexGrow={1} flexShrink={1} rowGap={space.xs}>
        <Markdown text={`**${s.title.replaceAll("**", "")}**`} />
        {s.values.length > 0 ? (
          s.values.map(({ text, literal }, i) =>
            literal ? (
              <Text key={`${s.label}:v${i}`}>{text}</Text>
            ) : (
              <Markdown key={`${s.label}:v${i}`} text={text} />
            ),
          )
        ) : (
          <Text dimColor>Not answered</Text>
        )}
        {s.note ? <Text dimColor>{`Note: ${s.note}`}</Text> : null}
      </Box>
      {s.hit ? (
        <Box flexShrink={0}>{control(g, { key: `go:${s.hit}`, label: "Change", hit: s.hit })}</Box>
      ) : null}
    </Box>
  );
}

/**
 * The row after a round's last card: the count, which goes to the first question, and Fill
 * prompt. A sent round says so; one with no `hits` is the count only.
 */
export function closing(g: Gui, c: Closing): JSX.Element {
  const { Box, Button } = g.els;
  const { hits } = c;
  const count = `${c.answered} of ${c.total} answered`;
  return rowOf(
    g,
    { key: "closing" },
    <Box key="count" paddingX={across.inset}>
      {hits && !c.sent
        ? control(g, { key: "count", label: count, hit: hits.count })
        : typed(g, "body", count, { tabular: true })}
    </Box>,
    c.sent ? (
      <Box key="sent" flexDirection="row" alignItems="center" columnGap={across.xs}>
        {meaning(g, "state:success", { alt: "Sent" })}
        {typed(g, "body", "Sent")}
      </Box>
    ) : null,
    hits && !c.sent ? (
      <Button
        key="fill"
        variant={c.canFill ? "primary" : undefined}
        dimColor={!c.canFill || undefined}
        label="Fill prompt"
        onPress={() => g.press(hits.fill)}
      />
    ) : null,
  );
}

/** The nonempty parts of a card, a gap between them. */
export function sections(
  g: Gui,
  ...parts: readonly (JSX.Element | null | undefined)[]
): JSX.Element {
  const { Box } = g.els;
  return (
    <Box flexDirection="column" rowGap={space.sm}>
      {parts.filter(Boolean)}
    </Box>
  );
}
