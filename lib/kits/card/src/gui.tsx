/**
 * The question card on the graphical surfaces: each answer a row led by a Button of its letter,
 * a write-in and the note the host's `Input`, the steps tabs. There is no rail (a card's state is
 * its buttons') and no pointer or hover of its own: the host draws those.
 */
import { capital, icon, type Gui } from "@agents/kit-core/paint/gui.tsx";
import { tokens } from "@agents/kit-core/tokens.ts";
import {
  choiceHit,
  type Choice,
  type ChoiceList,
  type Closing,
  type Heading,
  type Note,
  type Step,
  type Summary,
} from "./contract.ts";

const { space, across, lead, maxLabel } = tokens.gui;

/** What the host's own fields need, which the contract has no types for. */
export type CardGuiOptions = {
  /**
   * Runs with a field's `hit` and its text on every change: a write-in's (`choice:<i>`) or the
   * note's. A field holds what was typed until it is drawn under another `key`, so a caller that
   * resets one changes the story's key.
   */
  onInput?: (hit: string, text: string, line?: number) => unknown;
  /**
   * Runs with the text when Enter is pressed in a field. Without it Enter does nothing. With
   * `lines`, the text is that line's alone and `line` is its place.
   */
  onSubmit?: (hit: string, text: string, line?: number) => unknown;
  /**
   * A write-in whose text is this one is empty, showing it as the placeholder; a note shows it
   * as its own. @default "Write your own answer", and "Add a note" for a note
   */
  invitation?: string;
  /**
   * For a host whose field is one line (VS Code): a write-in or note is one field per line of its
   * text, at least this many, the later ones placeheld `Line 2`, `Line 3`. Each reports its own
   * line, so the caller joins them.
   */
  lines?: number;
  /** The first field takes the focus when it is drawn: a field the person just asked for. */
  autoFocus?: boolean;
  /** Rows a field has where the host's wraps what is typed (Desktop); the note's `max` wins. @default 1 */
  rows?: number;
};

const INVITATION = "Write your own answer";

/** Inline Markdown as a semibold run: a bold of its own would close the one around it. */
const bold = (text: string) => `**${text.replaceAll("**", "")}**`;

/** A Button that presses its `hit`, quiet unless `primary`. */
function control(
  g: Gui,
  o: { key: string; label: string; hit?: string; primary?: boolean },
): JSX.Element {
  const { Button } = g.els;
  return (
    <Button
      key={o.key}
      variant={o.primary ? "primary" : undefined}
      dimColor={!o.primary || undefined}
      label={o.label}
      onPress={() => (o.hit ? g.press?.(o.hit) : undefined)}
    />
  );
}

/**
 * A field for the host's `Input`: one, or with `lines` one per line of its text.
 * @param o `key` is the address of the first field, which a caller moves the focus to.
 */
function field(
  g: Gui,
  o: {
    key: string;
    value: string;
    placeholder: string;
    hit: string;
    label?: string;
    rows?: number;
  },
  options: CardGuiOptions,
): JSX.Element {
  const { Box, Input } = g.els;
  if (!options.lines)
    return (
      <Input
        key={o.key}
        label={o.label}
        value={o.value}
        placeholder={o.placeholder}
        autoFocus={options.autoFocus || undefined}
        rows={o.rows ?? (options.rows && options.rows > 1 ? options.rows : undefined)}
        onInput={(text) => options.onInput?.(o.hit, text)}
        onSubmit={(text) => options.onSubmit?.(o.hit, text)}
      />
    );
  const parts = o.value.split("\n");
  const count = Math.max(options.lines, parts.length);
  return (
    <Box flexDirection="column" rowGap={space.sm}>
      {Array.from({ length: count }, (_, i) => (
        <Input
          key={i ? `${o.key}:${i}` : o.key}
          label={i ? undefined : o.label}
          autoFocus={(!i && options.autoFocus) || undefined}
          value={parts[i] ?? ""}
          placeholder={i ? `Line ${i + 1}` : o.placeholder}
          onInput={(text) => options.onInput?.(o.hit, text, i)}
          onSubmit={(text) => options.onSubmit?.(o.hit, text, i)}
        />
      ))}
    </Box>
  );
}

/** The question: its label dim, then its title in semibold. */
export function heading(g: Gui, question: Heading): JSX.Element {
  const { Box, Text, Markdown } = g.els;
  return (
    <Box flexDirection="row" columnGap={across.sm} paddingX={across.inset}>
      {question.label ? (
        <Box flexShrink={0}>
          <Text dimColor>{question.label}</Text>
        </Box>
      ) : null}
      <Box width={0} flexGrow={1} flexShrink={1}>
        <Markdown text={bold(question.title)} />
      </Box>
      {question.answered ? (
        <Box flexShrink={0}>{icon(g, "success", { tone: "success", alt: "Answered" })}</Box>
      ) : null}
    </Box>
  );
}

/**
 * One answer: its letter on a Button in the lead column (filled when chosen), its words beside
 * it, the dim aside after them on their line and the detail under them. A write-in is the host's `Input` in place of the
 * words. A letter is a word a Button holds; the words, which wrap, never go in one.
 */
export function choice(g: Gui, c: Choice, options: CardGuiOptions = {}): JSX.Element {
  const { Box, Text, Markdown } = g.els;
  const { invitation = INVITATION } = options;
  const mark = c.key
    ? control(g, {
        key: `key:${c.hit ?? c.key}`,
        label: capital(c.key),
        hit: c.hit,
        primary: c.chosen,
      })
    : icon(g, c.chosen ? "success" : "pending", { tone: c.chosen ? "success" : "neutral" });
  const body = c.literal ? (
    field(
      g,
      {
        key: `write:${c.hit ?? c.key}`,
        value: c.text === invitation ? "" : c.text,
        placeholder: invitation,
        hit: c.hit ?? "",
      },
      c.hit ? options : { lines: options.lines },
    )
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
  return (
    <Box
      key={`choice:${c.hit ?? c.key}`}
      flexDirection="row"
      columnGap={across.sm}
      paddingX={across.inset}
      alignItems="flex-start"
    >
      <Box flexShrink={0} minWidth={lead}>
        {mark}
      </Box>
      <Box flexDirection="column" width={0} flexGrow={1} flexShrink={1} rowGap={space.xs}>
        {body}
        {c.aside && c.literal ? <Text dimColor>{c.aside}</Text> : null}
        {c.detail ? <Markdown text={c.detail} dimColor /> : null}
      </Box>
    </Box>
  );
}

/** A list of answers, one row each; several of many toggle, one of many replaces. */
export function choiceList(g: Gui, list: ChoiceList, options: CardGuiOptions = {}): JSX.Element {
  const { Box } = g.els;
  return (
    <Box flexDirection="column" rowGap={space.sm}>
      {list.items.map((item, i) =>
        choice(
          g,
          {
            key: item.key,
            text: item.text,
            detail: item.detail,
            chosen: list.chosen.includes(i),
            multiple: list.multiple,
            literal: item.writeIn,
            hit: choiceHit(i),
          },
          options,
        ),
      )}
    </Box>
  );
}

/** The card's note: the host's `Input` labelled Note, under the answers. */
export function note(g: Gui, n: Note, options: CardGuiOptions = {}): JSX.Element {
  const { Box } = g.els;
  const hit = n.hit ?? "note";
  return (
    <Box paddingX={across.inset}>
      {field(
        g,
        {
          key: `note:${hit}`,
          label: "Note",
          value: n.value,
          placeholder: options.invitation ?? "Add a note",
          rows: n.max && n.max > 1 ? n.max : undefined,
          hit,
        },
        options,
      )}
    </Box>
  );
}

/**
 * The steps of several questions as tabs: the current one filled, a done one marked with a tick,
 * the rest quiet. A name too long for a Button is left out for the step's short word.
 */
export function steps(g: Gui, all: readonly Step[]): JSX.Element | undefined {
  const { Box } = g.els;
  if (all.length === 0) return undefined;
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      alignItems="center"
      columnGap={across.xs}
      rowGap={space.xs}
      paddingX={across.inset}
    >
      {all.map((step, i) => {
        const named = step.name && step.name.length <= maxLabel;
        return (
          <Box
            key={`step:${step.hit ?? i}`}
            flexDirection="row"
            alignItems="center"
            columnGap={across.xs}
          >
            {step.done && !step.current
              ? icon(g, "success", { tone: "success", alt: "Done" })
              : null}
            {control(g, {
              key: `tab:${step.hit ?? i}`,
              label: named ? `${step.short} ${step.name}` : step.short,
              hit: step.hit,
              primary: step.current,
            })}
          </Box>
        );
      })}
    </Box>
  );
}

/** A question's answers for review: its label on a Button that goes back to it, the title in semibold, one line per answer, the note. */
export function summary(g: Gui, s: Summary): JSX.Element {
  const { Box, Text, Markdown } = g.els;
  return (
    <Box flexDirection="row" columnGap={across.sm} paddingX={across.inset} alignItems="flex-start">
      <Box flexShrink={0} minWidth={lead}>
        {s.hit ? (
          control(g, { key: `go:${s.hit}`, label: s.label, hit: s.hit })
        ) : (
          <Text dimColor>{s.label}</Text>
        )}
      </Box>
      <Box flexDirection="column" width={0} flexGrow={1} flexShrink={1} rowGap={space.xs}>
        <Markdown text={bold(s.title)} />
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
    </Box>
  );
}

/**
 * The row after a round's last card: the count, which goes to the first question, and Fill
 * prompt, filled once there is a reply. A sent round says so; one with no `hits` is the count only.
 */
export function closing(g: Gui, c: Closing): JSX.Element {
  const { Box, Text } = g.els;
  const { hits } = c;
  const count = `${c.answered} of ${c.total} answered`;
  return (
    <Box
      flexDirection="row"
      flexWrap="wrap"
      alignItems="center"
      columnGap={across.md}
      rowGap={space.xs}
      paddingX={across.inset}
    >
      {hits && !c.sent ? (
        control(g, { key: "count", label: count, hit: hits.count })
      ) : (
        <Text>{count}</Text>
      )}
      {c.sent ? (
        <Box flexDirection="row" alignItems="center" columnGap={across.xs}>
          {icon(g, "success", { tone: "success", alt: "Sent" })}
          <Text color="success">Sent</Text>
        </Box>
      ) : null}
      {hits && !c.sent
        ? control(g, { key: "fill", label: "Fill prompt", hit: hits.fill, primary: c.canFill })
        : null}
    </Box>
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
