/**
 * What the parser makes of an assistant message, one markdown file per message under `cases/`.
 *
 * A file is a front matter block and then the message exactly as an agent wrote it:
 *
 *     ---
 *     about: What this message is there to prove.
 *     shape: round Q1[ABC*A] Q2[*]
 *     titles: ["First question?", "Second question?"]
 *     tail: "Prose after the last question."
 *     ---
 *     **Q1. First question?**
 *     ...
 *
 * `shape` says what it should become: `none` for a message that asks nothing, else the kind and,
 * for each item, `label[option keys*recommended key]` (a bare `*` for a recommendation naming
 * no option; a pick list's keys are separated by commas). `titles` and `tail` are optional and
 * checked when present. Whatever the shape, every line of the message must be drawn by the head,
 * the items or the tail, and the item starts must be the harness's cut points.
 *
 * `cases/happy` holds the easy messages in each format the parser reads; `cases/tricky` holds the
 * hard ones, built from real transcripts with the wording made up. Set `CASES_DIR` to check
 * another folder of the same layout.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, test } from "vitest";

import { type Form, parse, startLines, tailOf } from "./forms.ts";

type Case = {
  name: string;
  about: string;
  shape: string;
  titles?: string[];
  tail?: string;
  text: string;
};

/** The front matter's lines as `key: value`; a value that is JSON is read as such. */
function readCase(path: string): Case {
  const lines = readFileSync(path, "utf8").replace(/\r\n?/g, "\n").split("\n");
  if (lines[0] !== "---") throw new Error(`${path}: no front matter`);
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new Error(`${path}: front matter never closes`);
  const fields: Record<string, unknown> = {};
  for (const line of lines.slice(1, end)) {
    const at = line.indexOf(":");
    if (at < 0) throw new Error(`${path}: not a field: ${line}`);
    const raw = line.slice(at + 1).trim();
    fields[line.slice(0, at).trim()] = /^["[{]/.test(raw) ? JSON.parse(raw) : raw;
  }
  const { about, shape, titles, tail } = fields;
  if (typeof about !== "string" || typeof shape !== "string")
    throw new Error(`${path}: needs about and shape`);
  return {
    name: basename(path, ".md"),
    about,
    shape,
    ...(Array.isArray(titles) ? { titles: titles as string[] } : {}),
    ...(typeof tail === "string" ? { tail } : {}),
    // One trailing newline is the file's, not the message's.
    text: lines
      .slice(end + 1)
      .join("\n")
      .replace(/\n$/, ""),
  };
}

/** `label[option keys*recommended key]`, a bare `*` for a recommendation naming no option. */
function shapeOf(form: Form | null): string {
  if (!form) return "none";
  const one = (item: Form["items"][number]) => {
    const keys = item.options.map((option) => option.key).join(form.kind === "picks" ? "," : "");
    if (item.recommendedOption !== undefined)
      return `${item.label}[${keys}*${item.options[item.recommendedOption]?.key}]`;
    return `${item.label}[${keys}${item.recommended !== undefined ? "*" : ""}]`;
  };
  return [form.kind, ...form.items.map(one)].join(" ");
}

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? [];

/** The lines whose words the head, the items and the tail between them do not carry. */
function hidden(text: string, form: Form): string[] {
  const lines = text.split("\n");
  const drawn = [lines.slice(0, startLines(text)[0] ?? 0).join("\n"), tailOf(text)];
  for (const item of form.items) {
    drawn.push(item.label, item.title, item.body, item.recommended ?? "");
    for (const option of item.options) drawn.push(option.text, option.detail);
  }
  const have = new Set(words(drawn.join("\n")));
  return lines.filter((line) => {
    const said = words(line);
    return said.length >= 3 && said.filter((word) => !have.has(word)).length / said.length > 0.5;
  });
}

const root = new URL("./cases/", import.meta.url).pathname;
const folders = [
  ...["happy", "tricky"].map((name) => [name, join(root, name)] as const),
  ...(process.env.CASES_DIR ? [["extra", process.env.CASES_DIR] as const] : []),
];

for (const [group, dir] of folders) {
  const files = statSync(dir, { throwIfNoEntry: false })
    ? readdirSync(dir)
        .filter((file) => file.endsWith(".md"))
        .sort()
    : [];
  describe(`cases/${group}`, () => {
    test.each(files.map((file) => readCase(join(dir, file))))("$name", (found) => {
      const form = parse(found.text);
      expect(shapeOf(form), found.about).toBe(found.shape);
      if (found.titles) expect(form?.items.map((item) => item.title)).toEqual(found.titles);
      if (found.tail !== undefined) expect(tailOf(found.text)).toBe(found.tail);
      if (form) {
        expect(hidden(found.text, form), "lines drawn nowhere").toEqual([]);
        expect(startLines(found.text)).toHaveLength(form.items.length);
      } else {
        expect(found.shape).toBe("none");
      }
    });
  });
}

test("every group has cases", () => {
  for (const [group, dir] of folders)
    expect(
      readdirSync(dir).filter((file) => file.endsWith(".md")).length,
      `cases/${group}`,
    ).toBeGreaterThan(0);
});
