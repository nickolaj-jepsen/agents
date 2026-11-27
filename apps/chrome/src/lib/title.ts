/**
 * The terminal title's words: the session's label, the folder it works in, how long it has been
 * going and the state word when the session wants you. A frozen frame of pi's spinner stands in
 * for a running turn, because the title is rewritten by the operating system rather than animated.
 */
import { shortPath } from "./format.ts";

// A frozen frame, not the animation: the title is rewritten by the OS.
const WORK_GLYPH = "⠿";

export type TitleInput = {
  label?: string;
  cwd: string;
  home: string;
  /** A coarse age from `formatAge`, or empty for a title written as a session ends. */
  age?: string;
  word?: string;
  working?: boolean;
};

export const titleText = (input: TitleInput): string => {
  const lead = input.working ? `${WORK_GLYPH} ` : "";
  const label = input.label ? `${input.label} · ` : "";
  const age = input.age ? ` · ${input.age}` : "";
  const word = input.word ? ` · ${input.word}` : "";
  return `${lead}${label}${shortPath(input.cwd, input.home)}${age}${word}`;
};
