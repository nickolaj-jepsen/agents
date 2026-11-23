/**
 * What each catalogue story draws on the terminal, keyed by `<component>/<state>` (the ids of
 * ../stories.ts): the kit's lines for the stage's width, painted. A live story keeps its state in
 * the catalogue.
 */
import {
  choiceKey,
  choiceOf,
  choiceReduce,
  type ChoiceIntent,
  type ChoiceListState,
} from "@agents/kit-card/contract.ts";
import { liveChoices, liveStart } from "@agents/kit-card/stories.ts";
import { choiceList } from "@agents/kit-card/terminal.ts";
import { paintLines, ring } from "@agents/kit-core/paint/claude.tsx";
import { storyId } from "@agents/kit-core/stories.ts";
import { catalogueStories } from "../registry.ts";

/** The elements a story is painted with: what `$.ui.resolve(e)` answers. */
export type Els = Parameters<typeof paintLines>[0];

export type ChoiceSend = (intent: ChoiceIntent | undefined) => unknown;

/** The live choice list's rows, where they are drawn: a press on a row picks it. */
export const choiceRows = (els: Els, state: ChoiceListState, width: number, send: ChoiceSend) =>
  paintLines(els, choiceList({ ...liveChoices, ...state }, width), {
    press: (hit) => send({ do: "pick", index: choiceOf(hit) }),
    width,
  });

/** The live choice list's keyboard, for the site that holds the keys: Enter and the letters. */
export const choiceRing = (els: Els, send: ChoiceSend) =>
  ring(
    els,
    () => send({ do: "pick" }),
    liveChoices.items.map((item) => ({
      key: item.key.toLowerCase(),
      press: () => send(choiceKey(liveChoices.items, item.key)),
    })),
  );

/** A story that reacts keeps one value in the catalogue's state and replaces it. */
export type LiveState = { state: unknown; set: (next: unknown) => unknown };
type Render = (els: Els, width: number, live?: LiveState) => JSX.Element;

export const renders: Record<string, Render> = Object.fromEntries(
  catalogueStories.map((s): [string, Render] => [
    storyId(s),
    (els, width, live) => {
      const { Box } = els;
      if (!s.isLive || !live) return paintLines(els, s.lines(width));
      const state = (live.state as ChoiceListState | null) ?? liveStart();
      const send: ChoiceSend = (intent) =>
        intent && live.set(choiceReduce(state, intent, liveChoices));
      return (
        <Box flexDirection="column">
          {choiceRows(els, state, width, send)}
          {choiceRing(els, send)}
        </Box>
      );
    },
  ]),
);
