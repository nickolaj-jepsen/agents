/**
 * JSON on disk the way both entry points have always written it: two-space indent, a trailing
 * newline, non-ASCII escaped, a temporary file renamed over the target so a reader never sees half
 * a file, and (for the published state) an fsync so the rename survives a crash.
 */
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { UpdatesError, describeError } from "./errors.ts";

/** Escape everything outside ASCII, as Python's `json.dump` does by default. */
function asciiJson(text: string): string {
  return text.replace(/[^\x00-\x7f]/g, (character) => {
    const code = character.charCodeAt(0);
    return `\\u${code.toString(16).padStart(4, "0")}`;
  });
}

/** A file's JSON text: two-space indent and a trailing newline. */
export function jsonDocument(value: unknown, indent = 2): string {
  return `${asciiJson(JSON.stringify(value, null, indent) ?? "null")}\n`;
}

/**
 * One line of JSON for stdout, exactly as Python's `json.dump` wrote it: `", "` between items and
 * `": "` after a key, so a launcher that hashes the line keeps the same line.
 */
export function jsonLine(value: unknown): string {
  return `${asciiJson(compact(value))}\n`;
}

function compact(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => compact(item)).join(", ")}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}: ${compact(item)}`).join(", ")}}`;
}

export type WriteJsonOptions = {
  /** The mode the temporary file is created with; 0600 for everything this design writes. */
  mode?: number;
  indent?: number;
  /** fsync the file and its directory. The refresh helper leaves both to the filesystem. */
  sync?: boolean;
  /** A seam for the spec that proves a failed rename leaves the old file and no temporary. */
  rename?: (from: string, to: string) => void;
};

/**
 * Write `bytes` to `path` through a temporary file and one atomic rename, so a reader sees the old
 * file or the new one and never half of either.
 *
 * Both writers of the published state go through here — the forward one in `writeJsonAtomic` and
 * the undo that puts the previous bytes back — because they need the same mechanics: the same
 * temporary name beside the target, the same 0600, and the same fsyncs. Neither may write in
 * place: a launch reads `current.json`, and a truncating write would hand it a partial document.
 */
export function writeBytesAtomic(
  path: string,
  bytes: Buffer | string,
  options: WriteJsonOptions = {},
): void {
  const { mode = 0o600, sync = true, rename = fs.renameSync } = options;
  const directory = dirname(path);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = join(directory, `.${basename(path)}.${randomUUID().slice(0, 8)}`);
  try {
    const descriptor = fs.openSync(
      temporary,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      mode,
    );
    try {
      fs.writeFileSync(descriptor, bytes);
      if (sync) fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    rename(temporary, path);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {
      // The failure may have happened before the temporary existed.
    }
    throw error;
  }
  if (!sync) return;
  try {
    const descriptor = fs.openSync(directory, fs.constants.O_RDONLY);
    try {
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    // A filesystem that cannot fsync a directory still has the rename.
  }
}

/** `value` as the JSON text both entry points write, in one atomic rename. */
export function writeJsonAtomic(
  path: string,
  value: unknown,
  options: WriteJsonOptions = {},
): void {
  writeBytesAtomic(path, jsonDocument(value, options.indent), options);
}

/** Remove `path` if it is there: the undo of a first write, where absent is the success. */
export function removeFileIfPresent(path: string): void {
  try {
    fs.unlinkSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Read JSON, reporting why it could not: a missing file and a broken one read differently. */
export function readJsonFile(path: string): unknown {
  let text: string;
  try {
    text = fs.readFileSync(path, "utf8");
  } catch (error) {
    throw new UpdatesError(`cannot read ${path}: ${describeError(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UpdatesError(`${path} is not JSON: ${describeError(error)}`);
  }
}

/** Read JSON without caring: a launch must not fail over a file another process is writing. */
export function readJsonQuietly(path: string): unknown {
  try {
    return readJsonFile(path);
  } catch {
    return undefined;
  }
}

/** Read a JSON object, or undefined: session files and acks are untrusted. */
export function readJsonObject(path: string): Record<string, unknown> | undefined {
  const value = readJsonQuietly(path);
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
