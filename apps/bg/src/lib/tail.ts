/**
 * The tail of a task's log: a bounded read of the file, then at most so many
 * lines, never a line cut at the front. What a log holds is unbounded (a test
 * run prints megabytes), so every path that shows one goes through here.
 */

/** How much of a log a result shows. The node adapter reads at most `bytes` from the end. */
export type TailLimits = { lines: number; bytes: number };

export const TAIL: TailLimits = { lines: 40, bytes: 4096 };

/** What a bounded read of a log gave back: its last bytes, and whether the front was cut off. */
export type LogRead = { bytes: Uint8Array; cut: boolean };

export type LogTail = { text: string; truncated: boolean };

/**
 * Shapes one bounded read into the text a tool result carries. `cut` says the
 * read began mid-file, so its first line is a fragment and is dropped; the same
 * goes for a read longer than `limits.bytes`, whatever the caller passed.
 */
export function tailOfLog(log: LogRead, limits: TailLimits = TAIL): LogTail {
  let { bytes } = log;
  let cut = log.cut;
  if (bytes.length > limits.bytes) {
    bytes = bytes.subarray(bytes.length - limits.bytes);
    cut = true;
  }
  if (bytes.length === 0) return { text: "", truncated: false };

  let lines = new TextDecoder().decode(bytes).split("\n");
  // A log's last line has no newline of its own until the shell writes one.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  if (cut) lines.shift();
  let truncated = cut;
  if (lines.length > limits.lines) {
    lines = lines.slice(-limits.lines);
    truncated = true;
  }
  return { text: lines.join("\n"), truncated };
}
