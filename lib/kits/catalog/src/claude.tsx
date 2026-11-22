/**
 * The Claude kit's catalogue, a dev-only mod: `/kit <component> [state]` draws one kit component
 * alone with sample data, in a Pane whose body is exactly the component; `/kit` alone lists them
 * and clears the stage. Not a plugin, so
 * home-manager never loads it; a scenario loads it with `--plugin-dir`.
 */
import { atom, read, update } from "claude-code";
import type { Register } from "claude-code";
import { stageWidth, storyId, stories, type Story } from "./claude/stories";
import { choiceOf, choiceReduce, type ChoiceListState } from "@agents/kit-card/contract.ts";
import { liveChoices, liveStart } from "@agents/kit-card/stories.ts";
import { keysHint, RING, ringMove } from "@agents/kit-core/paint/claude.tsx";
import { guiOf, isGui, paneOptions } from "@agents/kit-core/paint/host.tsx";
import { guiStoryOf } from "./stories.gui.tsx";
import { choiceRing, choiceRows, renders, type ChoiceSend } from "./claude/render";

/** The room in cells a row of the transcript is set in. */
const columnsOf = (e: { viewport?: { columns: number } }) =>
  Math.max(1, Math.floor(e.viewport?.columns ?? 80));

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

/** The live choice story in a pane. */
const LIVE = "card/live";
/**
 * `/kit card placed`: the live choice list placed as a row of the transcript, where a question
 * card goes, with its keys in the band. The transcript keeps no focus ring, so this is the
 * arrangement a card's keyboard has to work in. Tried by hand; it has no scenario.
 */
const PLACED = "card/placed";
const PLACED_ROW = "kit-card";

const isLiveChoice = (id: string | null) => id === LIVE || id === PLACED;

/**
 * Whether the site with a live choice story's keys holds the keyboard, as far as the engine
 * says. It tells a mod when the ring moves into its band or pane, when the person types in the
 * prompt, and when a row of the transcript is pressed (which hands the keys to the prompt).
 * Escape hands them back too, and nothing says so: until the next of those, this is stale.
 */
const keys = atom({ plugin: "kit-catalog", key: "keys" } as const, false, { shape: "keys-1" });

async function hold($: Parameters<typeof read>[0], held: boolean) {
  if ((await read($, keys)) !== held) await update($, keys, () => held);
}

/** The placed story's state and the way to change it, from either site that draws it. */
async function placedChoice($: Parameters<typeof read>[0]) {
  if ((await read($, story)) !== PLACED) return undefined;
  const held = await read($, live);
  const state = (held?.id === PLACED ? (held.state as ChoiceListState) : null) ?? liveStart();
  const send: ChoiceSend = (intent) =>
    intent &&
    update($, live, () => ({ id: PLACED, state: choiceReduce(state, intent, liveChoices) }));
  return { state, send };
}

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
    // The command was typed in the prompt, so the keyboard is there until a site takes it.
    await hold($, false);
    if (!component) {
      await update($, story, () => null);
      await $.ui.close({ id: PANE }).catch(() => undefined);
      return { text: `Components and states\n${listing()}` };
    }
    if (`${component}/${state}` === PLACED) {
      await update($, story, () => PLACED);
      await update($, live, () => null);
      await $.ui.close({ id: PANE }).catch(() => undefined);
      const row = await $.ui.place({ id: PLACED_ROW });
      return { text: row.isPlaced ? `Drew ${PLACED}.` : `${PLACED}: no row was placed` };
    }
    const found = stories.filter((s) => s.component === component);
    const one = found.find((s) => s.state === state) ?? (found.length === 1 ? found[0] : undefined);
    if (!one) {
      const known = found.length > 0 ? found.map((s) => s.state).join(", ") : listing();
      return { text: `${component}${state ? `/${state}` : ""}: pick a state\n${known}` };
    }
    await update($, story, () => storyId(one));
    await update($, live, () => null);
    await $.ui.open(
      paneOptions({ id: PANE, title: storyId(one), focus: true, closeOnEscape: true }),
    );
    return { text: `Drew ${storyId(one)}.` };
  });

  // A live choice story draws its own focus, as pi does, so the engine's ring (which inverts
  // what it rests on) is kept on a button that draws nothing. An arrow tries to move the ring
  // to the stop before or after it, and a click to the row clicked: each becomes the kit's
  // focus instead, and the ring goes back.
  on("ui.focus", async ($, e, next) => {
    const id = await read($, story);
    if (!id || !isLiveChoice(id)) return next(e);
    const move = ringMove(e.element, (hit) => choiceOf(hit) >= 0);
    if (move)
      await update($, live, (held) => {
        const state = (held?.id === id ? (held.state as ChoiceListState) : null) ?? liveStart();
        return {
          id,
          state:
            "hit" in move
              ? { ...state, focus: choiceOf(move.hit) }
              : move.by
                ? choiceReduce(state, { do: "move", by: move.by }, liveChoices)
                : state,
        };
      });
    const moved = await next(move ? { ...e, element: RING.park } : e);
    // A ring that moved in the site says the site has the keyboard.
    if (!moved.deny) await hold($, true);
    return moved;
  });

  // What the person types in the prompt went to the prompt, and a letter the site does not
  // bind takes the keyboard there with it.
  on("prompt.edit", async ($, e, next) => {
    // A `prompt.edit` is always the person's (its origin is the composer), unlike a change.
    await hold($, false);
    return next(e);
  });
  on("prompt.change", async ($, e, next) => {
    if (e.origin.kind !== "plugin") await hold($, false);
    return next(e);
  });

  // A press on a row of the transcript hands the keyboard to the prompt.
  on("ui.press", async ($, e, next) => {
    const pressed = await next(e);
    if (e.component === "Placed" && e.plugin === PLUGIN) await hold($, false);
    return pressed;
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e);
    const { Box, Text } = els;
    const s = find(await read($, story));
    if (!s) return <Text dimColor>/kit &lt;component&gt; [state]</Text>;
    const id = storyId(s);
    // A graphical surface draws the story's `gui.tsx` drawing: native controls, no width in cells.
    if (isGui(e)) {
      const draw = guiStoryOf(id);
      if (draw) return draw(guiOf(els, e));
    }
    const width = stageWidth(s, e.props.bodyColumns);
    const held = await read($, live);
    const body = renders[id]?.(els, width, {
      state: held?.id === id ? held.state : null,
      set: (state) => update($, live, () => ({ id, state })),
    });
    // A pane without the keyboard says how to give it; Escape closes this one, so it names no way back.
    const hint = isLiveChoice(id) ? keysHint(els, await read($, keys)) : null;
    return (
      <Box flexDirection="column">
        {body}
        {hint}
      </Box>
    );
  });

  on("ui.render", { component: "Placed" }, async ($, e, next) => {
    const choice = e.props.plugin === PLUGIN ? await placedChoice($) : undefined;
    if (!choice) return next(e);
    return choiceRows($.ui.resolve(e), choice.state, Math.min(columnsOf(e) - 2, 96), choice.send);
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const choice = e.props.hasSurvey ? undefined : await placedChoice($);
    if (!choice) return next(e);
    const els = $.ui.resolve(e);
    const { Box } = els;
    return (
      <Box flexDirection="column">
        {keysHint(els, await read($, keys), true)}
        {choiceRing(els, choice.send)}
      </Box>
    );
  });
};
