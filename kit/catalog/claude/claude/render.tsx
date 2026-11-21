/**
 * What each catalogue story draws, keyed by `<component>/<state>` (the ids of ../stories.ts).
 * Each gets the kit, the stage's width in cells and the pane's own size, and returns exactly
 * the component: no title, no hints. A band story returns the whole band.
 */
import {
  bandShell,
  buttonRow,
  clamp,
  inlineMarkdown,
  cellWidth,
  emptyState,
  entries,
  imageGallery,
  list,
  note,
  notice,
  paneTitle,
  section,
  tokens,
  widthCap,
  withColumns,
  type Cell,
  type ClampOptions,
  type Kit,
  type ListGroup,
  type ListItem,
} from "./ui";
import {
  CJK,
  EVIDENCE,
  EXTREME as EXTREME_ROWS,
  GROUPED as GROUPED_ROWS,
  LOG,
  LONG,
  LONG_ENTRY,
  LANDSCAPE_PNG,
  PORTRAIT_PNG,
  SENTENCE,
  WIDE as WIDE_ROWS,
  type Row,
} from "./samples";

import {
  choiceKey,
  choiceOf,
  choiceReduce,
  type ChoiceIntent,
  type ChoiceProps,
  type ChoiceState,
} from "./kit/choice/contract.ts";
import { choiceStories } from "./kit/choice/stories.ts";
import { choiceLines } from "./kit/choice/terminal.ts";
import { paintLines } from "./kit/paint/claude.tsx";

export type Env = { columns: number; rows: number };
/** The address of a button that only carries a letter key and draws nothing. */
export const KEY_PREFIX = "choice-key-";
/** Where the engine's focus ring is kept, and the stops either side that an arrow reaches. */
export const RING = {
  up: "choice-ring-up",
  park: "choice-ring",
  down: "choice-ring-down",
} as const;
/** A live choice story's first state: the kit draws focus, on the first row. */
export const choiceStart = (props: ChoiceProps): ChoiceState => ({
  chosen: props.chosen,
  focus: 0,
});
export type ChoiceSend = (intent: ChoiceIntent | undefined) => unknown;

/** A live choice list's rows, where they are drawn: a press on a row picks it. */
export const choiceRows = (
  k: Kit,
  props: ChoiceProps,
  state: ChoiceState,
  width: number,
  send: ChoiceSend,
) =>
  paintLines(k, choiceLines({ ...props, ...state }, width), (hit) =>
    send({ do: "pick", index: choiceOf(hit) }),
  );

/**
 * The keyboard's half of a live choice list, for the site that holds the keys: nothing here is
 * drawn. The engine's ring rests on the middle button, so Enter picks the row the kit drew
 * focus on; the two round it are where an arrow would take the ring, which `ui.focus` turns
 * into a move instead. The rest carry the letter keys.
 */
export function choiceRing(k: Kit, props: ChoiceProps, send: ChoiceSend): JSX.Element {
  const { Box, Button } = k;
  return (
    <Box width={0} height={0} overflow="hidden">
      <Button key={RING.up} plain label="previous" onPress={() => undefined} />
      <Button key={RING.park} plain autoFocus label="pick" onPress={() => send({ do: "pick" })} />
      <Button key={RING.down} plain label="next" onPress={() => undefined} />
      {props.items.map((item) => (
        <Button
          key={`${KEY_PREFIX}${item.key}`}
          plain
          hotkey={item.key.toLowerCase()}
          label={item.key}
          onPress={() => send(choiceKey(props.items, item.key))}
        />
      ))}
    </Box>
  );
}

/** A story that reacts keeps one value in the catalogue's state and replaces it. */
export type LiveState = { state: unknown; set: (next: unknown) => unknown };
type Render = (k: Kit, width: number, env: Env, live?: LiveState) => JSX.Element | null;

const none = () => undefined;

/** Inline markdown wrapped at each width, its later lines hanging under a two-cell lead. */
const MARKDOWN =
  'A 200 response like `{kind: "redirect"}`: `page.tsx` calls `redirect()`, **once**, per _URL_.';
const markdownDemo: Render = (k, width) => {
  const { Box, Text } = k;
  const used = [22, 30, 36].filter(
    (w, i, all) => all.slice(0, i + 1).reduce((a, b) => a + b + 2) <= width,
  );
  return (
    <Box flexDirection="row" columnGap={2}>
      {used.map((w) => (
        <Box key={`w${w}`} flexDirection="column" width={w}>
          <Text dimColor>{`width ${w}`}</Text>
          <Text>
            {"○ "}
            {inlineMarkdown(k, MARKDOWN, { width: w - 2, indent: 2, aside: "  Recommended" })}
          </Text>
        </Box>
      ))}
    </Box>
  );
};

/** Each width's lines in a column of its own, side by side; as many as fit, as in the pi story. */
const clampDemo =
  (source: string, options: ClampOptions): Render =>
  (k, width) => {
    const { Box, Text } = k;
    const used: number[] = [];
    let total = 0;
    for (const w of [22, 30, 36]) {
      const next = total + (used.length ? 2 : 0) + w;
      if (next > width) break;
      used.push(w);
      total = next;
    }
    return (
      <Box flexDirection="row" columnGap={2}>
        {used.map((w) => (
          <Box key={`w${w}`} flexDirection="column" width={w}>
            <Text dimColor>{`width ${w}`}</Text>
            <Text>{clamp(source, w, options).join("\n")}</Text>
          </Box>
        ))}
      </Box>
    );
  };

type Kind = "wrong" | "missing" | "stale";
const ICON: Record<Kind, string> = { wrong: "!", missing: "+", stale: "↻" };
const meta = (kind: Kind, seen: number, age: string): Cell[] => [
  { text: `${ICON[kind]} ${kind}`, width: 9, role: kind === "wrong" ? "error" : "dim" },
  { text: `${seen}×`, width: 4, align: "right", role: seen >= 3 ? "warning" : "dim" },
  { text: age, width: 5, align: "right" },
];
/** The shared sample rows as the kit's groups, in the order they come. */
const groupsOf = (rows: Row[], isMarked?: boolean): ListGroup[] => {
  const groups: ListGroup[] = [];
  for (const r of rows) {
    const item: ListItem = {
      key: r.id,
      title: r.title,
      isMarked,
      meta: meta(r.kind, r.seen, r.age),
      onPress: none,
    };
    const last = groups.at(-1);
    if (last && last.title === r.group) last.rows.push(item);
    else groups.push({ title: r.group, rows: [item] });
  }
  return groups;
};
const GROUPED = (isMarked?: boolean) => groupsOf(GROUPED_ROWS, isMarked);

const TITLE: ClampOptions = { target: 120, max: 3 };

const EXTREME = groupsOf(EXTREME_ROWS);
const WIDE = groupsOf(WIDE_ROWS);

/** A pane has no frame of its own: its title line and a line of prose, both held to the cap. */
const capped =
  (cls: "reading" | "dialog"): Render =>
  (k, width, env) => {
    const { Box, Text } = k;
    const cap = Math.min(width, widthCap(cls, env.columns));
    return (
      <Box flexDirection="column" rowGap={1} width={cap}>
        <Box>{paneTitle(withColumns(k, cap), "Doc suggestions", 3)}</Box>
        <Text>{clamp(SENTENCE, cap).join("\n")}</Text>
      </Box>
    );
  };

const listAt =
  (groups: ListGroup[], isColumns = false): Render =>
  (k) =>
    list(k, groups, { tui: { isColumns, title: TITLE } });

const KEYS = (labels: string[]) =>
  labels.map((label, i) => ({ hotkey: String(i + 1), label, press: none, isLit: i === 0 }));

/** The band story's divider slot: the question stops answer draws. */
const stops = (k: Kit) => {
  const { Button, Text } = k;
  const rows = ["Q1", "Q2", "Q3"];
  return {
    nodes: [
      ...rows.map((label, i) => (
        <Button key={`q${i}`} plain dimColor={i !== 1} onPress={none}>
          {i === 0 ? <Text color="success">✓ </Text> : <Text dimColor>○ </Text>}
          {label}
        </Button>
      )),
      <Button key="review" plain dimColor hotkey="r" label="review" onPress={none} />,
    ],
    width: rows.reduce((n, label) => n + cellWidth(label) + 2, 0) + 3 * rows.length + 9,
  };
};

const bandOf =
  (o: { title?: string; right?: boolean; lines: number; height: number }): Render =>
  (k, width, env) => {
    const { Box, Text } = k;
    return bandShell(k, {
      tui: { columns: width, height: o.height, maxRows: env.rows },
      title: o.title,
      right: o.right ? stops(k) : undefined,
      body: (
        <Box flexDirection="column">
          <Text weight="semibold">Which of these does the page get wrong?</Text>
          {Array.from({ length: o.lines }, (_, i) => (
            <Text key={`l${i}`}>{`${i + 1}: option ${i + 1}`}</Text>
          ))}
        </Box>
      ),
      footer: buttonRow(k, KEYS(["back", "next", "skip"])),
    });
  };

export const renders: Record<string, Render> = {
  "image/landscape": (k, width) =>
    imageGallery(
      k,
      [
        {
          key: "landscape",
          source: { png: LANDSCAPE_PNG },
          size: { width: 64, height: 36 },
          alt: "[image] landscape.png",
          path: "/tmp/a picture #1.png",
        },
      ],
      { columns: width, rows: 15 },
    ),
  "image/gallery": (k, width) =>
    imageGallery(
      k,
      [
        {
          key: "landscape",
          source: { png: LANDSCAPE_PNG },
          size: { width: 64, height: 36 },
          alt: "[image] landscape.png",
          path: "/tmp/landscape.png",
        },
        {
          key: "portrait",
          source: { png: PORTRAIT_PNG },
          size: { width: 24, height: 64 },
          alt: "[image] portrait.png",
          path: "/tmp/portrait.png",
        },
        {
          key: "unknown",
          source: { png: LANDSCAPE_PNG },
          size: null,
          alt: "[image] 日本語 mixed ＡＢＣ.png",
          path: `/tmp/${"a-very-long-directory-name/".repeat(4)}a picture #1 日本語.png`,
        },
      ],
      {
        columns: width,
        rows: 12,
        caption:
          "Generated images with a very long caption that wraps instead of pushing the gallery beyond the terminal width.",
      },
    ),

  "clamp/unbounded": clampDemo(SENTENCE, {}),
  "clamp/truncate": clampDemo(LONG, { min: 1, max: 1 }),
  "clamp/max-lines": clampDemo(LONG, { max: 2 }),
  "clamp/min-lines": clampDemo("A short title.", { min: 3 }),
  "clamp/target": clampDemo(LONG, { target: 90 }),
  "clamp/target-bounded": clampDemo(LONG, { target: 90, min: 2, max: 3 }),
  "clamp/wide-chars": clampDemo(CJK, { max: 3 }),
  "clamp/markdown": markdownDemo,

  "detail/section": (k) => {
    const { Box } = k;
    return (
      <Box flexDirection="column" rowGap={1}>
        {section(k, "Evidence")}
        {section(
          k,
          "docs/a-very-long-directory-name/with/several/nested/levels/and-an-equally-long-file-name-for-the-guide.md",
        )}
        {section(withColumns(k, 12), "docs/agents.md")}
      </Box>
    );
  },
  "detail/notes": (k, width) => {
    const { Box } = k;
    return (
      <Box flexDirection="column" rowGap={1}>
        {note(withColumns(k, Math.min(48, width)), SENTENCE, { isWrapped: true })}
        {note(withColumns(k, Math.min(48, width)), "One line.", { isWrapped: true })}
      </Box>
    );
  },

  "entries/wide": (k) => entries(k, LOG),
  "entries/narrow": (k, width) => entries(withColumns(k, Math.min(40, width)), LOG),
  "entries/one": (k) => entries(k, LOG.slice(0, 1)),
  "entries/long-text": (k) => entries(k, [LONG_ENTRY, ...LOG.slice(1)], { lines: { max: 3 } }),
  "entries/wide-chars": (k) =>
    entries(
      k,
      [
        { date: "2026-11-13", text: CJK },
        { date: "2026-10-16", text: `混在 mixed ＡＢＣ ${CJK}` },
      ],
      { lines: { max: 3 } },
    ),

  "empty/default": (k) => emptyState(k, "Nothing to review: no open doc suggestions in this repo."),
  "empty/long": (k) => emptyState(k, `${SENTENCE} ${SENTENCE}`),

  "notice/success": (k) => notice(k, "Dismissed 2", "success"),
  "notice/warning": (k) =>
    notice(k, "Two of the files changed on disk since the queue loaded", "warning"),
  "notice/error": (k) =>
    notice(
      k,
      "Dismiss failed: EACCES: permission denied, open '/home/user/.agents/store/docfix/x.md'",
      "error",
    ),
  "notice/long": (k) => notice(k, `${SENTENCE} ${SENTENCE}`, "dim"),

  "list/empty": (k) => emptyState(k, "Nothing to review: no open items in this repo."),
  "list/one": listAt(GROUPED().slice(0, 1)),
  "list/grouped": listAt(GROUPED()),
  "list/marks-multi": (k) => {
    const groups = GROUPED(false);
    groups[0]!.rows[0]!.isMarked = true;
    groups[1]!.rows[1]!.isMarked = true;
    return list(k, groups, { tui: { title: TITLE } });
  },
  "list/marks-single": (k) => {
    const groups = GROUPED(false);
    groups[1]!.rows[0]!.isMarked = true;
    return list(k, groups, { tui: { title: TITLE }, marks: "single" });
  },
  "list/coloured-metadata": listAt(GROUPED(false)),
  "list/column-drop": (k, width) => {
    const { Box, Text } = k;
    const rows = GROUPED().slice(0, 2);
    return (
      <Box flexDirection="column" rowGap={1}>
        <Text dimColor>isColumns</Text>
        {list(k, rows, { tui: { isColumns: true, title: TITLE } })}
        <Text dimColor>not isColumns</Text>
        {list(withColumns(k, Math.min(44, width)), rows, { tui: { title: TITLE } })}
      </Box>
    );
  },
  "list/extreme-titles": listAt(EXTREME),
  "list/wide-chars": listAt(WIDE),

  "frame/title-count": (k) => <k.Box>{paneTitle(k, "Doc suggestions", 3)}</k.Box>,
  "frame/title-bare": (k) => <k.Box>{paneTitle(k, "Doc suggestions")}</k.Box>,
  "frame/reading": capped("reading"),
  "frame/dialog": capped("dialog"),

  "detail/block": (k, width) => {
    const { Box, Text } = k;
    return (
      <Box flexDirection="column" width={width}>
        <Text wrap="wrap">{GROUPED_ROWS[0]!.title}</Text>
        <Box marginTop={1} columnGap={3}>
          <Text>
            <Text color="error">!</Text>
            <Text dimColor> wrong</Text>
          </Text>
          <Text color="warning">seen 3×</Text>
          <Text dimColor>2 days ago</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          {section(k, "Evidence")}
          {entries(k, EVIDENCE)}
        </Box>
      </Box>
    );
  },
  "detail/prose-measure": (k, width) => {
    const { Box, Text } = k;
    const measure = Math.min(tokens.prose, width);
    return (
      <Box flexDirection="column" width={width}>
        {section(k, `Prose at width ${width}`)}
        <Text>{clamp(LONG, measure).join("\n")}</Text>
      </Box>
    );
  },

  "split/stacked": (k) => {
    const { Box } = k;
    return (
      <Box flexDirection="column" rowGap={1}>
        {list(k, GROUPED().slice(0, 2), { tui: { title: TITLE } })}
        {section(k, "Evidence")}
        {entries(k, LOG.slice(0, 2), { lines: { max: 3 } })}
      </Box>
    );
  },

  "buttons/row": (k) =>
    buttonRow(k, [
      { hotkey: "a", label: "apply", press: none, isLit: true },
      { hotkey: "d", label: "dismiss", press: none },
      { hotkey: "↑↓", label: "move" },
      { hotkey: "q", label: "later", press: none },
    ]),
  "buttons/wrap": (k, width) => {
    const { Box } = k;
    return (
      <Box flexDirection="column" width={Math.min(width, 40)}>
        {buttonRow(k, [
          ...KEYS(["back", "next", "skip"]),
          { hotkey: "↑↓", label: "move" },
          ...KEYS(["quit", "review", "yes", "more"]),
        ])}
      </Box>
    );
  },

  ...Object.fromEntries(
    choiceStories.map((s): [string, Render] => [
      `choice/${s.state}`,
      (k, width, _env, live) => {
        const { Box } = k;
        if (!s.live || !live) return paintLines(k, choiceLines(s.props, width));
        const state = (live.state as ChoiceState | null) ?? choiceStart(s.props);
        const send: ChoiceSend = (intent) =>
          intent && live.set(choiceReduce(state, intent, s.props));
        return (
          <Box flexDirection="column">
            {choiceRows(k, s.props, state, width, send)}
            {choiceRing(k, s.props, send)}
          </Box>
        );
      },
    ]),
  ),

  "band/default": bandOf({ title: "Questions", right: true, lines: 3, height: 8 }),
  "band/title-only": bandOf({ title: "Questions", lines: 3, height: 8 }),
  "band/height": bandOf({ right: true, lines: 1, height: 9 }),
};
