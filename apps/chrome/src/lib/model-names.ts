/**
 * Short names for a narrow line: the catalogue's name with the best-known lab names shortened, and
 * the provider as a person reads it.
 *
 * Only data in, words out, so a spec can pin the collapse without a catalogue. A model is taken as
 * the two fields the footer reads, `name` and `id`.
 */
export type NamedModel = { name?: string; id: string };

/**
 * Long, well-known lab names only; Qwen, GLM, Kimi, Nemotron and LongCat keep their catalogue
 * names. Claude is redundant next to the spelled-out provider.
 */
const ALIAS_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bDeepSeek\b/gi, "DS"],
  [/\bMiniMax\b/gi, "MM"],
  [/\bClaude\s+/gi, ""],
];

/** The name as the catalogue spells it, e.g. `DeepSeek V4.1 Flash`. */
const modelName = (model: NamedModel): string => (model.name || model.id).trim();

/** The provider squeezed for a narrow line: `OpenCode Go` collapses to its last word. */
export const providerShortName = (name: string): string =>
  name.slice(name.lastIndexOf(" ") + 1) || name;

/** The name collapsed for a narrow line; the footer's second tier. */
export const modelAlias = (model: NamedModel): string => {
  let alias = modelName(model);
  for (const [pattern, replacement] of ALIAS_PATTERNS) {
    alias = alias.replace(pattern, replacement);
  }
  return alias.replace(/\s+/g, " ").trim() || modelName(model);
};
