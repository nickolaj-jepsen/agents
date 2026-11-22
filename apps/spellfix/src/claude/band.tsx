import type { RenderElement } from "claude-code";

import type { Picker, Report } from "./types.d.ts";
import { actionBar, choice, notice, roleProps, stack, statusBand, tokens } from "@agents/kit-legacy/claude/ui.tsx";
import type { Action, ChoiceOption, Kit } from "@agents/kit-legacy/claude/ui.tsx";

/** What the band draws from: the mod's atoms and whether a personal dictionary is set. */
export type BandView = {
  picker: Picker | null;
  report: Report | null;
  added: string[];
  isBusy: boolean;
  count: number;
  hasPersonal: boolean;
};

/** What a press does: `toggle` opens or closes the picker; the others answer one of its keys. */
export type BandActions = {
  toggle: () => unknown;
  pick: (key: string) => unknown;
  answer: (key: string) => unknown;
};

const arrows = (change: string) => change.replace("→", " → ");

/** The keys of the action row that may carry a hotkey, for `expectNative`. */
export const ACTION_KEYS = ["skip", "all", "add", "undo", "dismiss"] as const;

/**
 * The band on the desktop app and VS Code: the count line (its button opens, then closes, the
 * picker) with the picker or the report under it. The terminal's drawing is `terminalBand`.
 */
export function guiBand(k: Kit, v: BandView, a: BandActions): JSX.Element {
  const { Box, Text } = k;
  const { picker: p, report: done, added: words, isBusy, count: n } = v;
  const inset = tokens.gui.across.inset;
  const head = (text: string, hint: string, status: "warning") =>
    statusBand(k, { key: "spellfix", text, hint, status, onPress: a.toggle });

  if (p) {
    const ai: ChoiceOption[] = [];
    if (p.ai || !p.isAiDone) {
      ai.push({
        key: "ai",
        label: p.isAiDone ? (p.ai ?? "") : p.wantsAi ? "Waiting" : "Checking",
        isLiteral: p.isAiDone,
        onPress: () => a.pick("1"),
      });
    }
    const summary = p.summary.map(arrows).join(", ");
    const actions: Action[] = [
      { key: "skip", label: "skip", hotkey: "s", onPress: () => a.pick("s") },
      {
        key: "all",
        label: p.wantsAll ? "Waiting" : "fix all",
        hotkey: "a",
        onPress: () => a.pick("a"),
      },
      ...(v.hasPersonal && !p.isExtra
        ? [{ key: "add", label: "add word", hotkey: "d", onPress: () => a.pick("d") }]
        : []),
      ...(words.length > 0
        ? [{ key: "undo", label: "undo add", hotkey: "8", onPress: () => a.pick("8") }]
        : []),
    ];
    return stack(
      k,
      [
        head(n > 0 ? `${n} misspelled` : "A typo only Haiku found", "close", "warning"),
        <Box key="context" paddingX={inset}>
          <Text>
            <Text dimColor>{p.lead}</Text>
            <Text weight="bold" {...roleProps(p.isExtra ? "warning" : "error")}>
              {p.word}
            </Text>
            <Text dimColor>{p.trail}</Text>
          </Text>
        </Box>,
        <Box
          key="haiku"
          flexDirection="row"
          alignItems="center"
          columnGap={tokens.gui.across.md}
          paddingX={inset}
        >
          {ai.length > 0 ? choice(k, ai, { key: "ai:choice" }) : null}
          <Text dimColor>{ai.length > 0 ? "Haiku" : "Haiku has no suggestion"}</Text>
        </Box>,
        p.suggestions.length > 0 ? (
          <Box key="suggestions" paddingX={inset}>
            {choice(
              k,
              p.suggestions.map((s, i) => ({
                key: `s${i}`,
                label: s,
                isLiteral: true,
                onPress: () => a.pick(String(i + 2)),
              })),
              { key: "suggestions:choice", gui: { layout: "row" } },
            )}
          </Box>
        ) : null,
        summary ? (
          <Box key="summary" paddingX={inset}>
            <Text wrap="truncate-end" dimColor>
              {`Fix all changes ${summary}`}
            </Text>
          </Box>
        ) : null,
        words.length > 0 ? notice(k, `Added ${words.join(", ")} to the dictionary`, "dim") : null,
        actionBar(k, actions),
      ],
      { gui: { gap: "sm" } },
    );
  }

  const notes = [
    ...(done ? [`Fixed ${done.changes.map(arrows).join(", ")}`] : []),
    ...(words.length > 0 ? [`Added ${words.join(", ")} to the dictionary`] : []),
  ];
  return stack(
    k,
    [
      isBusy
        ? notice(k, "Checking spelling", "dim")
        : n > 0
          ? head(`${n} misspelled`, "review", "warning")
          : null,
      ...notes.map((text) => notice(k, text, "text")),
      notes.length > 0
        ? actionBar(k, [
            { key: "undo", label: "undo", hotkey: "8", onPress: () => a.answer("8") },
            { key: "dismiss", label: "dismiss", hotkey: "9", onPress: () => a.answer("9") },
          ])
        : null,
    ],
    { gui: { gap: "sm" } },
  );
}

/**
 * The band in the terminal: plain Buttons with their keys in the labels. The kit's statusBand,
 * choice and actionBar draw other cells, so this stays the mod's own.
 * @param toggle The Button that opens and closes the picker; the caller keeps it mounted.
 */
export function terminalBand(
  k: Kit,
  v: BandView,
  a: BandActions,
  toggle: RenderElement,
  hidden: RenderElement,
  isQuiet: boolean,
): RenderElement {
  const { Box, Button, Text } = k;
  const { picker: p, report: done, added: words, isBusy, count: n } = v;
  if (isQuiet) return hidden;

  if (p) {
    const slot = p.isAiDone ? (p.ai ?? "no idea") : p.wantsAi ? "waiting…" : "…";
    // Ideally these would be marked inline in the prompt itself; mods can't decorate the
    // composer's text yet, so the band lists them instead.
    const summary = [...p.summary, ...(words.length ? [`added: ${words.join(", ")}`] : [])];
    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text dimColor>…{p.before}</Text>
          <Text weight="bold" underline color={p.isExtra ? "yellow" : "red"}>
            {p.word}
          </Text>
          <Text dimColor>{p.after}…</Text>
        </Text>
        <Box flexWrap="wrap" columnGap={2}>
          <Button key="ai" hotkey="1" plain onPress={() => a.pick("1")}>
            {slot}
            <Text dimColor> (Haiku)</Text>
          </Button>
          {p.suggestions.map((s, i) => (
            <Button
              key={`s${i}`}
              hotkey={String(i + 2)}
              plain
              onPress={() => a.pick(String(i + 2))}
            >
              {s}
            </Button>
          ))}
          <Button key="skip" hotkey="s" plain label="skip" onPress={() => a.pick("s")} />
          {v.hasPersonal && !p.isExtra ? (
            <Button
              key="add"
              hotkey="d"
              plain
              label="add to dictionary"
              onPress={() => a.pick("d")}
            />
          ) : null}
          <Button
            key="all"
            hotkey="a"
            plain
            label={p.wantsAll ? "waiting…" : "fix all"}
            onPress={() => a.pick("a")}
          />
          {toggle}
        </Box>
        {summary.length > 0 && (
          <Box columnGap={2}>
            <Text wrap="truncate-end" dimColor>
              {summary.join(" · ")}
            </Text>
            {words.length > 0 && (
              <Button key="undo" hotkey="8" plain label="undo add" onPress={() => a.pick("8")} />
            )}
          </Box>
        )}
      </Box>
    );
  }

  const notes: [string, string][] = [
    ...(done ? [["fixed: ", done.changes.join(", ")] as [string, string]] : []),
    ...(words.length ? [["added: ", words.join(", ")] as [string, string]] : []),
  ];
  return (
    <Box columnGap={2}>
      {notes.length > 0 && (
        <>
          <Text wrap="truncate-end">
            {notes.flatMap(([label, list], i) => [
              <Text key={`n${i}`} dimColor>
                {i ? ` · ${label}` : label}
              </Text>,
              list,
            ])}
          </Text>
          <Button key="undo" hotkey="8" plain label="undo" onPress={() => a.answer("8")} />
          <Button
            key="dismiss"
            hotkey="9"
            plain
            label="dismiss"
            role="dismiss"
            onPress={() => a.answer("9")}
          />
        </>
      )}
      {isBusy || n > 0 ? toggle : hidden}
    </Box>
  );
}
