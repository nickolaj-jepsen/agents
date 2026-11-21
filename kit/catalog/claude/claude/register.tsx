/**
 * The Claude kit's catalogue, a dev-only mod: `/kit <component> [state]` draws one kit component
 * alone with sample data, in a Pane whose body is exactly the component (or in the band, for
 * what only a band has); `/kit` alone lists them and clears the stage. Not a plugin, so
 * home-manager never loads it; a scenario loads it with `--plugin-dir`.
 */
import { atom, read, update } from "claude-code";
import type { Register } from "claude-code";
import { stageWidth, storyId, stories, type Story } from "../stories";
import { choiceOf, choiceReduce, type ChoiceState } from "./kit/choice/contract.ts";
import { choiceStories } from "./kit/choice/stories.ts";
import { choiceStart, KEY_PREFIX, renders, RING } from "./render";
import { kitOf, onlyOwnRows, paneOptions, withColumns } from "./ui";

const PANE = "kit";
const PLUGIN = "kit-catalog";

const story = atom({ plugin: "kit-catalog", key: "story" } as const, null as string | null, {
  shape: "story-1",
});

/** What a story that reacts has been set to, by story id; a story drawn again starts over. */
const live = atom(
  { plugin: "kit-catalog", key: "live" } as const,
  null as { id: string; state: unknown } | null,
  { shape: "live-1" },
);

const find = (id: string | null): Story | undefined => stories.find((s) => storyId(s) === id);

const listing = () => {
  const by = new Map<string, string[]>();
  for (const s of stories) by.set(s.component, [...(by.get(s.component) ?? []), s.state]);
  return [...by].map(([c, states]) => `${c}: ${states.join(", ")}`).join("\n");
};

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command
      .register({
        name: "kit",
        description: "Draw a Claude UI kit component alone: /kit <component> [state]",
      })
      .catch((error) => $.ui.log(`kit: /kit not registered: ${String(error)}`, { to: "debug" }));
    return next(e);
  });

  on("command.run", { command: "kit" }, async ($, e) => {
    const [component, state] = e.args.trim().split(/[\s/]+/);
    if (!component) {
      await update($, story, () => null);
      await $.ui.close({ id: PANE }).catch(() => undefined);
      return { text: `Components and states\n${listing()}` };
    }
    const found = stories.filter((s) => s.component === component);
    const one = found.find((s) => s.state === state) ?? (found.length === 1 ? found[0] : undefined);
    if (!one) {
      const known = found.length > 0 ? found.map((s) => s.state).join(", ") : listing();
      return { text: `${component}${state ? `/${state}` : ""}: pick a state\n${known}` };
    }
    await update($, story, () => storyId(one));
    await update($, live, () => null);
    if (one.surface === "band") {
      await $.ui.close({ id: PANE }).catch(() => undefined);
      return { text: `Drew ${storyId(one)} in the band.` };
    }
    await $.ui.open(
      paneOptions({ id: PANE, title: storyId(one), focus: true, closeOnEscape: true }),
    );
    return { text: `Drew ${storyId(one)}.` };
  });

  // A live choice story draws its own focus, as pi does, so the engine's ring (which inverts
  // what it rests on) is kept on a button that draws nothing. An arrow tries to move the ring
  // to the stop before or after it, and a click to the row clicked: each becomes the kit's
  // focus instead, and the ring goes back.
  on("ui.focus", { requestId: PANE }, async ($, e, next) => {
    const id = await read($, story);
    const s = choiceStories.find((c) => c.live && `choice/${c.state}` === id);
    const el = e.element;
    if (!s || !id || !el || el === RING.park) return next(e);
    const by = el === RING.up ? -1 : el === RING.down ? 1 : 0;
    const row = choiceOf(el);
    if (!by && row < 0 && !el.startsWith(KEY_PREFIX)) return next(e);
    await update($, live, (held) => {
      const state = (held?.id === id ? (held.state as ChoiceState) : null) ?? choiceStart(s.props);
      return {
        id,
        state: by
          ? choiceReduce(state, { do: "move", by }, s.props)
          : row >= 0
            ? { ...state, focus: row }
            : state,
      };
    });
    return next({ ...e, element: RING.park });
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e);
    const { Box, Text } = els;
    const s = find(await read($, story));
    if (!s || s.surface !== "pane") return <Text dimColor>/kit &lt;component&gt; [state]</Text>;
    const width = stageWidth(s, e.props.bodyColumns);
    const id = storyId(s);
    const held = await read($, live);
    const body = renders[id]?.(
      withColumns(kitOf(els, e), width),
      width,
      { columns: e.props.bodyColumns, rows: e.props.scroll.bodyRows },
      {
        state: held?.id === id ? held.state : null,
        set: (state) => update($, live, () => ({ id, state })),
      },
    );
    return <Box flexDirection="column">{body}</Box>;
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const s = find(await read($, story));
    if (e.props.hasSurvey || !s || s.surface !== "band") return next(e);
    const els = $.ui.resolve(e);
    const make = renders[storyId(s)];
    if (!make) return next(e);
    return (
      make(kitOf(els, e), e.props.bodyColumns, {
        columns: e.props.bodyColumns,
        rows: e.props.maxRows,
      }) ?? next(e)
    );
  });

  // The stage is the band's alone.
  on("ui.render", { component: "AbovePromptList", plugin: "*" }, async ($, e, next) => {
    const s = find(await read($, story));
    if (e.props.hasSurvey || s?.surface !== "band") return next(e);
    return next(onlyOwnRows(e, PLUGIN));
  });
};
