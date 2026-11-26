/**
 * Where each program keeps what it shares. One place for the layout means the bridge, the CLI and
 * the refresh helper cannot disagree about a filename.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import {
  PROFILE_LOCK,
  PROFILE_MANIFEST,
  REQUESTS_DIR,
  ROOTS_DIR,
  SESSIONS_DIR,
  STATE_DIR_NAME,
  STATE_FILE,
  STATE_LOCK_FILE,
} from "./protocol.ts";

export type Environment = Record<string, string | undefined>;

/** `$XDG_STATE_HOME`, or `~/.local/state`. */
export function stateHome(env: Environment): string {
  return env.XDG_STATE_HOME || join(env.HOME || homedir(), ".local", "state");
}

/** The state directory every part of this design shares. */
export function stateDir(env: Environment): string {
  return join(stateHome(env), STATE_DIR_NAME);
}

export const sessionsDir = (state: string): string => join(state, SESSIONS_DIR);
export const requestsDir = (state: string): string => join(state, REQUESTS_DIR);
export const rootsDir = (state: string): string => join(state, ROOTS_DIR);

/** The published overrides. */
export const stateFilePath = (state: string): string => join(state, STATE_FILE);
/** Serialises updates and resets; the kernel owns the lock, the file is only its inode. */
export const stateLockPath = (state: string): string => join(state, STATE_LOCK_FILE);

/** A session advertises itself as `<state>/sessions/<pid>-<token>.json`. */
export const sessionFilePath = (state: string, pid: number, token: string): string =>
  join(sessionsDir(state), `${pid}-${token}.json`);

/** The request a session's bridge polls for, and the ack it writes beside it. */
export const requestFilePath = (state: string, pid: number, token: string): string =>
  join(requestsDir(state), `${pid}-${token}.json`);

export const profileManifestPath = (profile: string): string => join(profile, PROFILE_MANIFEST);
export const profileLockPath = (profile: string): string => join(profile, PROFILE_LOCK);
export const profileSkillsDir = (profile: string): string => join(profile, "skills");
export const profileSettingsPath = (profile: string): string => join(profile, "settings.json");

/** The registry of installable skills a linked checkout would otherwise be discovered from. */
export const agentsSkillsDir = (home: string): string => join(home, ".agents", "skills");
