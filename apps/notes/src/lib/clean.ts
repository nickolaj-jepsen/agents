/**
 * What may be drawn: text from a file, a file's name or a command's output with every control
 * character made visible. The harnesses refuse a tree with one in a text (Claude Code) or hand it
 * to the terminal as it is (pi: a clipboard write, a title, a cleared screen), and a note's text
 * and a folder's names are not ours to trust.
 */

/** What stands in for a character that is not drawn. */
export const REPLACEMENT = "�";

// C0 but `\t` and `\n` (a `\r` is a line end, turned before this runs), DEL, and C1.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/**
 * `text` with line ends as `\n` (`\r\n` and a lone `\r` both) and every other control character
 * (C0 but tab and newline, DEL, C1) as U+FFFD.
 */
export const clean = (text: string): string =>
  text.replace(/\r\n?/g, "\n").replace(CONTROL, REPLACEMENT);
