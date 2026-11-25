/**
 * What a store holds, sorted for reading: its notes under the folder each is in, newest first,
 * and a count of everything else. A harness walks the folders; this decides what the walk means.
 */

import { clean } from "./clean.ts";

/** A file as a harness found it. */
export type Entry = {
  /** Its path below the folder that was walked, with `/` between the parts. */
  path: string;
  mtimeMs: number;
};

export type NoteKind = "markdown" | "html";

export type Note = {
  /** The note's own address in the list: its group and its path below the store. */
  id: string;
  /** Its path below its group's folder. */
  name: string;
  /** Its whole path on disk. */
  file: string;
  kind: NoteKind;
  /** When it was last written. */
  at: number;
};

export type Group = {
  /** The folder's name; `MEMORY` for what the harness saved. */
  label: string;
  /** Newest first. */
  notes: Note[];
  /** How many of the folder's files are no notes. */
  artefacts: number;
  /** The harness writes these, not the agent's skills: they are read, never moved. */
  isMemory?: boolean;
};

/** The label of the notes that are in no folder of the store. */
export const LOOSE = "store";
/** The label of the group for what the harness itself saved. */
export const MEMORY = "memory";

/** Whether a walk goes into a folder: not a dot folder, which no note is in. */
export const isWalked = (folder: string) => !folder.startsWith(".");

const kindOf = (path: string): NoteKind | undefined => {
  const lower = path.toLowerCase();
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  return undefined;
};

/** A superseded copy, which skills keep under a `history` folder, is no note to read. */
const isSuperseded = (parts: readonly string[]) => parts.slice(0, -1).includes("history");

const newestFirst = (a: Note, b: Note) => b.at - a.at || a.name.localeCompare(b.name);

/**
 * The store's files as groups, one per top-level folder: the group written to last comes first,
 * and a folder with no notes at all comes after those that have some.
 * @param root The store's path on disk.
 */
export function shelve(root: string, entries: readonly Entry[]): Group[] {
  const groups = new Map<string, Group>();
  for (const entry of entries) {
    // What is drawn holds no control character; `file` below keeps the name the disk has.
    const parts = clean(entry.path).split("/").filter(Boolean);
    if (parts.length === 0 || parts.some((part) => part.startsWith("."))) continue;
    const label = parts.length > 1 ? (parts[0] as string) : LOOSE;
    const group = groups.get(label) ?? { label, notes: [], artefacts: 0 };
    groups.set(label, group);
    const kind = isSuperseded(parts) ? undefined : kindOf(entry.path);
    if (!kind) {
      group.artefacts += 1;
      continue;
    }
    group.notes.push({
      id: `${label}:${parts.join("/")}`,
      name: parts.length > 1 ? parts.slice(1).join("/") : (parts[0] as string),
      file: `${root}/${entry.path}`,
      kind,
      at: entry.mtimeMs,
    });
  }
  const shelved = [...groups.values()];
  for (const group of shelved) group.notes.sort(newestFirst);
  const latest = (group: Group) => group.notes[0]?.at ?? -1;
  return shelved.sort((a, b) => latest(b) - latest(a) || a.label.localeCompare(b.label));
}

/**
 * What the harness saved about the project, as one more group; none when it saved nothing.
 * @param root The memory folder's path on disk.
 */
export function memoryGroup(root: string, entries: readonly Entry[]): Group | undefined {
  const notes = entries
    .filter((entry) => kindOf(entry.path) === "markdown")
    .map((entry): Note => ({
      id: `${MEMORY}:${clean(entry.path)}`,
      name: clean(entry.path),
      file: `${root}/${entry.path}`,
      kind: "markdown",
      at: entry.mtimeMs,
    }))
    .sort(newestFirst);
  return notes.length ? { label: MEMORY, notes, artefacts: 0, isMemory: true } : undefined;
}

/** Every note of the groups, in the order they are listed. */
export const notesOf = (groups: readonly Group[]): Note[] => groups.flatMap((group) => group.notes);

/** How long ago, in the fewest letters: `now`, `12m`, `5h`, `3d`. */
export const age = (ms: number): string => {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
};

/** What a group's heading says after its name: how many files it has that are no notes. */
export const artefactsLabel = (count: number): string | undefined =>
  count === 0 ? undefined : count === 1 ? "1 artefact" : `${count} artefacts`;

/**
 * The store's notes written since `since`, newest first: what the band tells the person about.
 * Memory is the harness's own and is left out.
 * @param within Whether a time is one this session wrote in (`duringTurns`): the store is shared
 *   by every worktree, so a note's time says whose it is. Every time when left out.
 */
export const written = (
  groups: readonly Group[],
  since: number,
  within: (at: number) => boolean = () => true,
): Note[] =>
  groups
    .filter((group) => !group.isMemory)
    .flatMap((group) => group.notes)
    .filter((note) => note.at > since && within(note.at))
    .sort(newestFirst);

/** What the band says about notes written this session; nothing when there are none. */
export function writtenLabel(notes: readonly Note[], groups: readonly Group[]): string | undefined {
  const [newest] = notes;
  if (!newest) return undefined;
  const group = groups.find((g) => g.notes.includes(newest));
  const path = group && group.label !== LOOSE ? `${group.label}/${newest.name}` : newest.name;
  return notes.length === 1
    ? `Note written: ${path}`
    : `${notes.length} notes written, last ${path}`;
}

/** Claude Code's longest folder name for a project before it adds a hash. */
const KEY_MAX = 200;

/**
 * Claude Code's name for a project's folder (2.1.330): the path with every character that is not a
 * letter or digit as `-`; one over 200 is cut there and followed by `-` and the base-36 of a hash
 * of the whole path, a 32-bit sum over its UTF-16 units.
 */
export function projectKey(path: string): string {
  const slug = path.replace(/[^a-zA-Z0-9]/g, "-");
  if (slug.length <= KEY_MAX) return slug;
  let hash = 0;
  for (let i = 0; i < path.length; i++) hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0;
  return `${slug.slice(0, KEY_MAX)}-${Math.abs(hash).toString(36)}`;
}

/**
 * Where Claude Code keeps a project's memory when no setting moves it: a folder named after the
 * main checkout's path (`projectKey`), under the configuration directory the session runs with.
 * @param configDir `$CLAUDE_CONFIG_DIR`, else `~/.claude`.
 * @param main The main checkout's root, which every worktree of a repository shares.
 */
export const claudeMemoryDir = (configDir: string, main: string) =>
  `${configDir}/projects/${projectKey(main)}/memory`;
