/**
 * The editor's top border, right of the session's label: the context the session has used and its
 * window, then the meters that go with it, and ahead of them the two words that condense the
 * transcript. Pure, so a spec can say which reading a 70-column border loses first without a
 * terminal.
 *
 * The context pill opens the session tree, where a full window is navigated; its own colour is the
 * alarm, so a reading worth acting on is the only thing that leaves the neutral one.
 */
import type { Role } from "@agents/kit-core/lines.ts";
import { formatTokens } from "./format.ts";
import type { Part } from "./line.ts";

/** One reading beside the context, as the session measured it. */
export type Meter = { id: string; text: string; action?: string };

/** A fill at or above these is worth looking at. */
export const WARN_PCT = 60;
export const ERROR_PCT = 85;

/** Only a context fill worth acting on leaves the neutral colour. */
export const contextRole = (percent: number | undefined): Role =>
  percent !== undefined && percent >= ERROR_PCT
    ? "error"
    : percent !== undefined && percent >= WARN_PCT
      ? "warning"
      : "dim";

/**
 * The context reading: its share of the window, and the window itself dimmed after it. Absent
 * when pi reports no percentage, since a `?` would read as a measurement that went wrong; the
 * window is left out when the model declares none.
 */
export const contextPart = (percent: number | undefined, window = 0): Part | undefined => {
  if (percent === undefined || !Number.isFinite(percent)) return undefined;
  const share = Math.max(0, Math.min(100, percent));
  const pct = `${Math.floor(share)}%`;
  const rest = window > 0 ? ` / ${formatTokens(window)}` : "";
  return {
    id: "context",
    action: "tree",
    text: `${pct}${rest}`,
    spans: [
      { text: pct, role: contextRole(share) },
      ...(rest ? [{ text: rest, role: "dim" as const }] : []),
    ],
  };
};

export type MeasurementInput = {
  /** The two condense toggles; they lead every level, so a narrow border keeps them. */
  chips: readonly Part[];
  /** The context fill, absent when pi has not measured one yet. */
  percent?: number;
  /** The model's window, in tokens. */
  window?: number;
  /** Cost, then speed: the furthest right is dropped first. */
  meters: readonly Meter[];
};

/**
 * The border's right-hand readings, fullest first: the meters give way from the right, then the
 * window, and the chips stay to the end.
 */
export const measurementLevels = (input: MeasurementInput): Part[][] => {
  const context = contextPart(input.percent, input.window);
  const meters: Part[] = input.meters.map((meter) => ({
    id: meter.id,
    text: meter.text,
    role: "dim",
    ...(meter.action ? { action: meter.action } : {}),
  }));
  const withContext = (part: Part | undefined) => [...input.chips, ...(part ? [part] : [])];
  const levels: Part[][] = [];
  for (let keep = meters.length; keep >= 0; keep--)
    levels.push([...withContext(context), ...meters.slice(0, keep)]);
  // The window is the first thing the reading itself gives up.
  const bare = context && {
    ...context,
    text: context.text.split(" / ")[0] ?? context.text,
    spans: context.spans?.slice(0, 1),
  };
  if (bare) levels.push(withContext(bare));
  return levels;
};
