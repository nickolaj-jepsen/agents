/**
 * The on-disk protocol three programs share: the `agents` CLI publishes it, `agents-refresh` and a
 * pi session's bridge read it, and the CLI reads the bridge's answers back. Keeping the shapes and
 * their validation here is what lets the bridge import the same rules without the CLI's build.
 */
import { UpdatesError } from "./errors.ts";

export const HARNESSES = ["pi", "claude"] as const;
export type Harness = (typeof HARNESSES)[number];

export const LIVE_CHOICES = ["pi", "claude", "all"] as const;
export type LiveChoice = (typeof LIVE_CHOICES)[number];

/** Under `$XDG_STATE_HOME`, which defaults to `~/.local/state`. */
export const STATE_DIR_NAME = "agents-updates";
/** The published overrides: per plugin variant, per skill, and the revision each came from. */
export const STATE_FILE = "current.json";
export const ROOTS_DIR = "roots";
export const SESSIONS_DIR = "sessions";
export const REQUESTS_DIR = "requests";
export const STATE_LOCK_FILE = "lock";

/** The package.json field an app declares its Herdr UI artifact in: `"herdr": {"ui": true}`. */
export const UI_METADATA = "herdr";

/** What `agents-refresh` owns inside one profile. */
export const PROFILE_MANIFEST = ".agents-updates.json";
export const PROFILE_LOCK = ".agents-updates.lock";
/** The pi setting holding a durable agent's tool extensions: a pinned choice, never published. */
export const TWIN_KEY = "piAgents";
/** What a previous generation's links point into; only entries like these are replaced. */
export const STORE_ROOT = "/nix/store/";

/** A request the bridge never answered is replaced after this long, so a crash cannot wedge us. */
export const REQUEST_TTL_SECONDS = 600;

export const SESSION_STATUS = { idle: "idle", busy: "busy" } as const;

/**
 * A name becomes a directory under `apps/` or `skills/` and a Nix attribute name: letters, digits,
 * '.', '_' and '-', not starting with '.', so it cannot traverse or hide.
 */
export const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type VariantPaths = { pi: string | null; claude: string | null };

/** `AGENTS_BASELINE`: what this generation pins. A missing variant reads as null. */
export type Baseline = {
  revision: string;
  plugins: Record<string, VariantPaths>;
  skills: Record<string, string>;
  /** Herdr UI artifacts: a folder of the runtime UI, deployed rather than linked. */
  ui: Record<string, string>;
};

/** One plugin's entry in `current.json`; `baseline` is the revision it was published from. */
export type PluginState = VariantPaths & { baseline: string };
export type SkillState = { path: string; baseline: string };
export type UiState = { path: string; baseline: string };
export type State = {
  plugins: Record<string, PluginState>;
  skills: Record<string, SkillState>;
  ui: Record<string, UiState>;
};

/** What both harnesses should load: overrides over the pin. What `agents resolve` prints. */
export type Resolved = {
  plugins: Record<string, VariantPaths>;
  skills: Record<string, string | null>;
  /** Added after the keys that were there first: a consumer of plugins and skills is unaffected. */
  ui: Record<string, string | null>;
};

/** A session file a bridge advertised; every field is untrusted. */
export type SessionRecord = {
  pid?: unknown;
  harness?: unknown;
  sessionId?: unknown;
  status?: unknown;
  requestPath?: unknown;
};

/** `<state>/requests/<pid>-<token>.json`: the CLI asks, the bridge claims and answers. */
export type ReloadRequest = { id: string; requestedAt: string };
export type ReloadAck = { id: unknown; status?: unknown; message?: unknown };

/** The refresh helper's record of what this design wrote, so a reset can still recognise it. */
export type ProfileManifest = {
  skills?: string[];
  packages?: Record<string, string>;
  twins?: Record<string, string>;
};

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function revision(value: unknown, where: string): string {
  if (typeof value !== "string") {
    throw new UpdatesError(`${where} must be a string, not ${typeName(value)}`);
  }
  return value;
}

/** A plugin's two variant paths: a path, or null for a half the plugin does not have. */
function variantPaths(raw: Record<string, unknown>, where: string): VariantPaths {
  const entry: VariantPaths = { pi: null, claude: null };
  for (const harness of HARNESSES) {
    const value = raw[harness] ?? null;
    if (value !== null && typeof value !== "string") {
      throw new UpdatesError(`${where}.${harness} must be a path or null`);
    }
    entry[harness] = value;
  }
  return entry;
}

function table(value: unknown, where: string, subject: string): Record<string, unknown> {
  const resolved = value ?? {};
  if (!isObject(resolved)) throw new UpdatesError(`${where}: ${subject} must be an object`);
  return resolved;
}

/** `AGENTS_BASELINE`, validated. `path` only names the problem. */
export function parseBaseline(raw: unknown, path: string): Baseline {
  if (!isObject(raw)) throw new UpdatesError(`AGENTS_BASELINE ${path} must hold a JSON object`);
  const plugins: Record<string, VariantPaths> = {};
  for (const [name, variants] of Object.entries(table(raw.plugins, path, "plugins"))) {
    if (!isObject(variants)) throw new UpdatesError(`${path}: plugins.${name} must be an object`);
    plugins[name] = variantPaths(variants, `${path}: plugins.${name}`);
  }
  const skills: Record<string, string> = {};
  for (const [name, value] of Object.entries(table(raw.skills, path, "skills"))) {
    if (typeof value !== "string") throw new UpdatesError(`${path}: skills.${name} must be a path`);
    skills[name] = value;
  }
  const ui: Record<string, string> = {};
  for (const [name, value] of Object.entries(table(raw.ui, path, "ui"))) {
    if (typeof value !== "string") throw new UpdatesError(`${path}: ui.${name} must be a path`);
    ui[name] = value;
  }
  const revisionText = raw.revision === undefined ? "" : raw.revision;
  return {
    revision: revision(revisionText, `${path}: revision`),
    plugins,
    skills,
    ui,
  };
}

/** `current.json`, validated. An entry always carries both variants, so a reset can null one. */
export function parseState(raw: unknown, path: string): State {
  if (!isObject(raw)) throw new UpdatesError(`${path} must hold a JSON object`);
  const plugins: Record<string, PluginState> = {};
  for (const [name, entry] of Object.entries(table(raw.plugins, path, "plugins"))) {
    if (!isObject(entry)) throw new UpdatesError(`${path}: plugins.${name} must be an object`);
    const variants = variantPaths(entry, `${path}: plugins.${name}`);
    plugins[name] = {
      ...variants,
      baseline: revision(
        entry.baseline === undefined ? "" : entry.baseline,
        `${path}: plugins.${name}.baseline`,
      ),
    };
  }
  const skills: Record<string, SkillState> = {};
  for (const [name, entry] of Object.entries(table(raw.skills, path, "skills"))) {
    if (!isObject(entry)) throw new UpdatesError(`${path}: skills.${name} must be an object`);
    if (typeof entry.path !== "string") {
      throw new UpdatesError(`${path}: skills.${name}.path must be a path`);
    }
    skills[name] = {
      path: entry.path,
      baseline: revision(
        entry.baseline === undefined ? "" : entry.baseline,
        `${path}: skills.${name}.baseline`,
      ),
    };
  }
  // Absent in a state written before there were UI artifacts: an older current.json keeps working,
  // and its UI names simply have no override.
  const ui: Record<string, UiState> = {};
  for (const [name, entry] of Object.entries(table(raw.ui, path, "ui"))) {
    if (!isObject(entry)) throw new UpdatesError(`${path}: ui.${name} must be an object`);
    if (typeof entry.path !== "string") {
      throw new UpdatesError(`${path}: ui.${name}.path must be a path`);
    }
    ui[name] = {
      path: entry.path,
      baseline: revision(
        entry.baseline === undefined ? "" : entry.baseline,
        `${path}: ui.${name}.baseline`,
      ),
    };
  }
  return { plugins, skills, ui };
}

/** What `agents resolve` printed, as `agents-refresh` must read it. */
export function parseResolved(raw: unknown, cli: string): Resolved {
  if (!isObject(raw) || !isObject(raw.plugins) || !isObject(raw.skills)) {
    throw new UpdatesError(`${cli} resolve printed an unexpected shape`);
  }
  const plugins: Record<string, VariantPaths> = {};
  for (const [name, entry] of Object.entries(raw.plugins)) {
    if (!isObject(entry)) throw new UpdatesError(`${cli} resolve printed an unexpected shape`);
    for (const harness of HARNESSES) {
      const value = entry[harness] ?? null;
      if (value !== null && typeof value !== "string") {
        throw new UpdatesError(`${cli} resolve printed an unexpected shape`);
      }
    }
    plugins[name] = variantPaths(entry, `${cli} resolve: plugins.${name}`);
  }
  const skills: Record<string, string | null> = {};
  for (const [name, value] of Object.entries(raw.skills)) {
    if (value !== null && typeof value !== "string") {
      throw new UpdatesError(`${cli} resolve printed an unexpected shape`);
    }
    skills[name] = value;
  }
  const ui: Record<string, string | null> = {};
  for (const [name, value] of Object.entries(isObject(raw.ui) ? raw.ui : {})) {
    if (value !== null && typeof value !== "string") {
      throw new UpdatesError(`${cli} resolve printed an unexpected shape`);
    }
    ui[name] = value;
  }
  return { plugins, skills, ui };
}

/** A malformed request answers with an ack that names no id, so nothing reports it as applied. */
export function parseReloadRequest(raw: unknown): ReloadRequest {
  if (!isObject(raw) || typeof raw.id !== "string") {
    throw new UpdatesError("Missing request id");
  }
  return {
    id: raw.id,
    requestedAt: typeof raw.requestedAt === "string" ? raw.requestedAt : "",
  };
}

export function sessionRecord(
  pid: number,
  sessionId: string,
  idle: boolean,
  requestPath: string,
): SessionRecord {
  return {
    pid,
    harness: "pi",
    sessionId,
    status: idle ? SESSION_STATUS.idle : SESSION_STATUS.busy,
    requestPath,
  };
}

/** `2024-01-01T00:00:00Z`, the timestamp a request and a generation both carry. */
export function isoSeconds(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** The first seven characters of a revision, or "unknown" when there is none. */
export function shortRevision(revisionText: string | undefined | null): string {
  return revisionText ? revisionText.slice(0, 7) : "unknown";
}

export function validateNames(names: readonly string[]): void {
  for (const name of names) {
    if (!NAME_PATTERN.test(name) || name.includes("..")) {
      throw new UpdatesError(
        `bad name ${JSON.stringify(name)}: use letters, digits, '.', '_' and '-', not starting with '.'`,
      );
    }
  }
}
