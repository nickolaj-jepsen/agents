/**
 * What the parser makes of an assistant message, one markdown file per message under `cases/`.
 *
 * A file is YAML front matter and then the message exactly as an agent wrote it:
 *
 *     ---
 *     about: What this message is there to prove.
 *     kind: round                     # round, picks, or none for a message that asks nothing
 *     items:
 *       - label: Q1                   # as printed ("Q1", 2)
 *         title: First question?
 *         body: Context under it.     # optional; what it said besides title, options and lean
 *         options:                    # the options, as printed; a pick list's are build, /grill-me…
 *           - key: A
 *             text: The option's words.
 *             detail: The lines that continued it.   # optional
 *         recommended: A              # an option key, [A, C] for several, true for a lean that
 *                                     # names no option; leave out when there is none
 *         reason: A. Why.             # optional; the recommendation's own words
 *         unlabelled: true            # the message printed no label for this lone question
 *     tail: Prose after the last question.   # optional
 *     ---
 *     **Q1. First question?**
 *     ...
 *
 * The values are written by hand from the message, never copied from what the parser says: a
 * case that only repeats the parser proves nothing.
 *
 * The items are what the parser must find, in order, with nothing missing and nothing extra.
 * Whatever they say, every line of the message must be drawn by the head, the items or the tail,
 * and the item starts must be the harness's cut points.
 *
 * `cases/happy` holds the easy messages in each format the parser reads; `cases/tricky` holds the
 * hard ones, built from real transcripts with the wording made up. Set `CASES_DIR` to check
 * another folder of the same layout.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, test } from "vitest";
import { parse as readYaml } from "yaml";
import { z } from "zod";

import { type Form, parse, startLines, tailOf } from "./forms.ts";

/** A label or key as a person writes it in YAML: `Q1`, `A`, `2`. */
const Key = z.union([z.string(), z.number()]).transform(String);

const Option = z.strictObject({ key: Key, text: z.string(), detail: z.string().default("") });

const Item = z.strictObject({
  label: Key,
  title: z.string(),
  body: z.string().optional(),
  options: z.array(Option).default([]),
  recommended: z.union([z.literal(true), Key, z.array(Key).min(2)]).optional(),
  reason: z.string().optional(),
  unlabelled: z.literal(true).optional(),
});

const Front = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("none"),
    about: z.string().min(1),
    tail: z.string().optional(),
  }),
  z.strictObject({
    kind: z.enum(["round", "picks"]),
    about: z.string().min(1),
    items: z.array(Item).min(1),
    tail: z.string().optional(),
  }),
]);

type Case = { name: string; front: z.output<typeof Front>; text: string };

function readCase(path: string): Case {
  const lines = readFileSync(path, "utf8").replace(/\r\n?/g, "\n").split("\n");
  if (lines[0] !== "---") throw new Error(`${path}: no front matter`);
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new Error(`${path}: front matter never closes`);
  const front = Front.safeParse(readYaml(lines.slice(1, end).join("\n")));
  if (!front.success) throw new Error(`${path}: ${z.prettifyError(front.error)}`);
  return {
    name: basename(path, ".md"),
    front: front.data,
    // One trailing newline is the file's, not the message's.
    text: lines
      .slice(end + 1)
      .join("\n")
      .replace(/\n$/, ""),
  };
}

type Item = z.output<typeof Item>;
type Found = Omit<Item, "unlabelled"> & { unlabelled: boolean };

/** What the parser found of one item, in the terms a case file states it. `body` and `reason` only when the case does. */
function found(item: Form["items"][number], want: Pick<Item, "body" | "reason">): Found {
  const keys = (indices: number[]) => indices.map((index) => item.options[index]?.key ?? "?");
  const recommended = item.recommendedOptions
    ? keys(item.recommendedOptions)
    : item.recommendedOption !== undefined
      ? keys([item.recommendedOption])[0]
      : item.recommended !== undefined || undefined;
  return {
    label: item.label,
    title: item.title,
    ...(want.body !== undefined ? { body: item.body } : {}),
    options: item.options.map(({ key, text, detail }) => ({ key, text, detail })),
    recommended,
    ...(want.reason !== undefined ? { reason: item.recommended } : {}),
    unlabelled: item.unlabelled ?? false,
  };
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

const casesIn = (dir: string) =>
  statSync(dir, { throwIfNoEntry: false })
    ? readdirSync(dir)
        .filter((file) => file.endsWith(".md"))
        .sort()
    : [];

for (const [group, dir] of folders) {
  describe(`cases/${group}`, () => {
    test.each(casesIn(dir).map((file) => readCase(join(dir, file))))("$name", ({ front, text }) => {
      const form = parse(text);
      if (front.kind === "none") {
        expect(form?.kind, front.about).toBeUndefined();
      } else {
        expect(form?.kind, front.about).toBe(front.kind);
        const want = front.items.map((item) => ({ ...item, unlabelled: item.unlabelled ?? false }));
        expect(form?.items.map((item, i) => found(item, want[i] ?? {}))).toEqual(want);
      }
      if (front.tail !== undefined) expect(tailOf(text)).toBe(front.tail);
      if (form) {
        expect(hidden(text, form), "lines drawn nowhere").toEqual([]);
        expect(startLines(text)).toHaveLength(form.items.length);
      }
    });
  });
}

test("the front matter refuses what it cannot read", () => {
  const item = {
    label: "Q1",
    title: "Which?",
    options: [
      { key: "A", text: "One." },
      { key: "B", text: "Two." },
    ],
  };
  const good = { about: "x", kind: "round", items: [item] };
  expect(Front.safeParse(good).success).toBe(true);
  // A misspelt key, a lean that is a list of one, a round with no items, a none with some.
  expect(Front.safeParse({ ...good, items: [{ ...item, recomended: "A" }] }).success).toBe(false);
  expect(Front.safeParse({ ...good, items: [{ ...item, recommended: ["A"] }] }).success).toBe(
    false,
  );
  expect(Front.safeParse({ ...good, items: [] }).success).toBe(false);
  expect(Front.safeParse({ about: "x", kind: "none", items: [item] }).success).toBe(false);
  expect(Front.safeParse({ ...good, kind: "form" }).success).toBe(false);
  expect(Front.safeParse({ ...good, items: [{ ...item, title: undefined }] }).success).toBe(false);
  // Numbers as a person writes them in YAML are the labels and keys they print.
  expect(
    Front.parse({ ...good, items: [{ label: 2, title: "t", options: [{ key: 1, text: "x" }] }] }),
  ).toMatchObject({ items: [{ label: "2", options: [{ key: "1", text: "x", detail: "" }] }] });
});

test("every group has cases", () => {
  for (const [group, dir] of folders)
    expect(casesIn(dir).length, `cases/${group}`).toBeGreaterThan(0);
});
