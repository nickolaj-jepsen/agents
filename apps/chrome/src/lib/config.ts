/**
 * The frame's configuration: the few choices that belong to the person, not to the plugin.
 *
 * The palette itself is pi's own theme — the roles below only say which of its colours the frame's
 * secondary words borrow. What a session spends is the host's business too, so the providers whose
 * spend is watched, the router models whose real provider is worth naming, and a short name for a
 * model on a narrow row are all stated here rather than assumed. Nothing personal ships: the
 * neutral configuration renders the frame with pi's own words and no assumptions about an account.
 *
 * It is read from the file `$PI_CHROME_CONFIG` names, as JSON, and validated at that boundary: a
 * field that does not parse is reported and the neutral value stands in for it, so a typo costs a
 * notification rather than the frame.
 */
import type { Role } from "@agents/kit-core/lines.ts";

const ROLES: readonly Role[] = [
  "text",
  "dim",
  "accent",
  "success",
  "warning",
  "error",
  "code",
  "link",
  "border",
];

/**
 * What the effort chip wears: `thinking` is pi's own colour for the level, which is the colour its
 * editor border takes at that level; a role fixes it to one of the theme's words instead.
 */
export type EffortRole = Role | "thinking";

/** The words the frame paints on someone else's behalf. */
export type ChromeRoles = {
  /** The provider a model belongs to, when the row is wide enough to name it. */
  provider: Role;
  /** The model, which is the row's bold word. */
  model: Role;
  /** The effort chip. */
  effort: EffortRole;
  /** The road to the checkout; the checkout's own name is always `text`. */
  path: Role;
};

/** Every value `roles.effort` takes. */
const EFFORT_ROLES: readonly EffortRole[] = [...ROLES, "thinking"];

export type ChromeConfig = {
  roles: ChromeRoles;
  /** Provider ids whose spend the person watches: their model name is drawn as an alarm. */
  watched: readonly string[];
  /** Router models, as `provider/id`, whose answering provider is named beside them. */
  routed: readonly string[];
  /** Short names for a narrow row, by model id. */
  names: Readonly<Record<string, string>>;
};

/** The frame as anyone gets it: pi's theme, and no assumption about anyone's account. */
export const NEUTRAL: ChromeConfig = {
  roles: { provider: "dim", model: "dim", effort: "thinking", path: "dim" },
  watched: [],
  routed: [],
  names: {},
};

/** One thing that did not parse, and what was used instead. */
export type ConfigProblem = { where: string; problem: string };

export type ConfigResult = { config: ChromeConfig; problems: ConfigProblem[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isRole = (value: unknown): value is Role => ROLES.includes(value as Role);

/** `provider/id`, split at the first slash; undefined when it is not one. */
export const routedModel = (entry: string): { provider: string; id: string } | undefined => {
  const cut = entry.indexOf("/");
  if (cut <= 0 || cut === entry.length - 1) return undefined;
  return { provider: entry.slice(0, cut), id: entry.slice(cut + 1) };
};

const strings = (
  value: unknown,
  where: string,
  problems: ConfigProblem[],
): readonly string[] | undefined => {
  if (!Array.isArray(value)) {
    problems.push({ where, problem: "expected a list of words" });
    return undefined;
  }
  const kept: string[] = [];
  value.forEach((entry, i) => {
    if (typeof entry === "string" && entry.trim() !== "") kept.push(entry.trim());
    else problems.push({ where: `${where}[${i}]`, problem: "expected a word" });
  });
  return kept;
};

/** What the frame makes of a parsed configuration file, and what it had to refuse. */
export const parseConfig = (value: unknown): ConfigResult => {
  const problems: ConfigProblem[] = [];
  const config: ChromeConfig = {
    roles: { ...NEUTRAL.roles },
    watched: [],
    routed: [],
    names: {},
  };
  if (value === undefined) return { config, problems };
  if (!isRecord(value)) {
    problems.push({ where: "", problem: "expected an object" });
    return { config, problems };
  }
  for (const key of Object.keys(value))
    if (!["roles", "watched", "routed", "names"].includes(key))
      problems.push({ where: key, problem: "unknown setting, ignored" });

  if (value.roles !== undefined) {
    if (!isRecord(value.roles)) problems.push({ where: "roles", problem: "expected an object" });
    else
      for (const [key, role] of Object.entries(value.roles)) {
        if (!(key in NEUTRAL.roles)) {
          problems.push({ where: `roles.${key}`, problem: "unknown word, ignored" });
          continue;
        }
        if (key === "effort" ? !EFFORT_ROLES.includes(role as EffortRole) : !isRole(role)) {
          problems.push({
            where: `roles.${key}`,
            problem: `expected one of ${(key === "effort" ? EFFORT_ROLES : ROLES).join(", ")}`,
          });
          continue;
        }
        if (key === "effort") config.roles.effort = role as EffortRole;
        else config.roles[key as keyof ChromeRoles] = role as Role;
      }
  }

  if (value.watched !== undefined) {
    const watched = strings(value.watched, "watched", problems);
    if (watched) config.watched = watched;
  }

  if (value.routed !== undefined) {
    const routed = strings(value.routed, "routed", problems);
    if (routed)
      config.routed = routed.filter((entry) => {
        if (routedModel(entry)) return true;
        problems.push({ where: "routed", problem: `"${entry}" is not provider/id` });
        return false;
      });
  }

  if (value.names !== undefined) {
    if (!isRecord(value.names)) problems.push({ where: "names", problem: "expected an object" });
    else {
      const names: Record<string, string> = {};
      for (const [id, name] of Object.entries(value.names)) {
        if (typeof name !== "string" || name.trim() === "") {
          problems.push({ where: `names.${id}`, problem: "expected a word" });
          continue;
        }
        names[id] = name.trim();
      }
      config.names = names;
    }
  }

  return { config, problems };
};

/** The configuration file's text, parsed and validated; absent text is the neutral configuration. */
export const readConfig = (text: string | undefined): ConfigResult => {
  if (text === undefined) return { config: NEUTRAL, problems: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      config: NEUTRAL,
      problems: [{ where: "", problem: `not JSON: ${(error as Error).message}` }],
    };
  }
  return parseConfig(parsed);
};

/** The role a word is painted in; the effort chip's `thinking` is painted by pi's own level colour. */
export const roleFor = <W extends keyof ChromeRoles>(
  config: ChromeConfig,
  word: W,
): ChromeRoles[W] => config.roles[word];

/** A model's short name for a narrow row: the configured one, or the catalogue's own collapsed. */
export const nameFor = (config: ChromeConfig, model: { id: string }, fallback: string): string =>
  config.names[model.id] ?? fallback;
