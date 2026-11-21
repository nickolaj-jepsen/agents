import { describe, expect, test } from "vitest";
import { textOf, widthOf, type Line } from "../claude/kit/lines.ts";
import type { Form } from "./draft.ts";
import {
  act,
  draw,
  keysOf,
  startView,
  type Effect,
  type Intent,
  type Room,
  type View,
} from "./screen.ts";

const option = (label: string) => ({ value: label, label });

const FORM: Form = {
  draftId: "1",
  phase: "ready",
  stage: "writing",
  error: null,
  seed: { kind: "note", text: "the sync worker ignores Retry-After" },
  source: "Source: `acme/sync-worker` · fix/retry-after · session 8055",
  teams: [option("PLT"), option("WEB")],
  statuses: ["Backlog", "Todo", "Done"].map(option),
  labels: Array.from({ length: 40 }, (_, i) => option(`Label ${i} 保存`)),
  projects: [{ value: "", label: "No project" }, option("Order sync")],
  team: "PLT",
  title: "同期ワーカーが Retry-After を無視する: honor the header in every retry path",
  fieldRevision: 0,
  description: [
    "The sync worker never reads `Retry-After`.",
    "",
    ...Array.from(
      { length: 12 },
      (_, i) => `- Step ${i} of the fix, long enough to wrap in a narrow pane`,
    ),
    "",
    "| Answer | Today | After |",
    "| --- | --- | --- |",
    "| `429` | doubles | waits |",
  ].join("\n"),
  priority: 3,
  state: "Todo",
  labelIds: ["Label 2 保存"],
  project: "",
  duplicate: {
    issue: "PLT-212",
    title: "Retries too fast",
    comment: "It also ignores the header.",
    about: "Backs off with a fixed delay.",
  },
  isCheckingDuplicates: false,
  settledAt: 0,
};

const rowsOf = (l: Line) => (l.slot?.kind === "input" ? (l.slot.rows ?? 1) : 1);
const lead = (l: Line) => (l.slot?.kind === "input" ? l.slot.lead.map((s) => s.text).join("") : "");

/** No open issue covers it: Enter creates. */
const PLAIN: Form = { ...FORM, duplicate: null };
const ROOM: Room = { width: 68, rows: 26, hasAllKeys: true };

const screen = (f: Form | null, view: View, room: Room) => {
  const d = draw(f, view, room);
  return [...d.body, ...(d.notice ? [d.notice] : []), ...d.footer].map((l) => textOf(l) || lead(l));
};

/** Plays `intents` from the draft's first view, applying what they change to the form. */
function play(intents: Intent[], form: Form = FORM, room: Room = ROOM) {
  let view: View = startView();
  let f = form;
  const effects: Effect[] = [];
  for (const intent of intents) {
    const acted = act(f, view, intent, draw(f, view, room));
    view = acted.view;
    for (const e of acted.effects) {
      effects.push(e);
      if (e.do === "set") f = { ...f, ...e.patch };
    }
  }
  return { view, form: f, effects, text: screen(f, view, room), keys: keysOf(f, view) };
}

const writes = (effects: Effect[]) =>
  effects.filter((e) => e.do === "create" || e.do === "comment");

const STATES: [string, Form, Intent[]][] = [
  ["the draft", FORM, []],
  ["the draft with nothing to decide", PLAIN, []],
  ["priorities open", FORM, [{ key: "p" }]],
  ["labels open, the keyboard far down", FORM, [{ key: "l" }, { move: 30 }]],
  ["the title typed", FORM, [{ key: "e" }]],
  ["the description typed", FORM, [{ key: "x" }]],
  ["a duplicate to decide on", FORM, [{ enter: true }]],
  ["discard asked", FORM, [{ key: "d" }]],
  ["drafting", { ...FORM, phase: "drafting" }, []],
  ["drafting, discard asked", { ...FORM, phase: "drafting" }, [{ key: "d" }]],
  ["failed", { ...FORM, phase: "failed", error: "Linear said no, at length: ".repeat(8) }, []],
  ["filing", { ...FORM, phase: "filing" }, []],
  ["an error over the buttons", { ...FORM, error: "save_issue failed: the team is archived" }, []],
];

describe.each(STATES)("%s", (_name, form, intents) => {
  test("fits every room: no row wider than it, no more rows than it has", () => {
    for (const rows of [6, 9, 14, 26, 60])
      // No client gives a room narrower than this: Claude Code's narrowest pane is 41 cells.
      for (let width = 40; width <= 120; width += 3) {
        const room: Room = {
          width,
          rows,
          isActive: true,
          hasAllKeys: width % 2 === 0,
          fieldRows: 1 + (width % 2),
          newline: width % 2 ? "shift+enter" : undefined,
          isFieldFlush: width % 3 === 0,
        };
        const { view, form: f } = play(intents, form, room);
        const d = draw(f, view, room);
        const lines = [...d.body, ...(d.notice ? [d.notice] : []), ...d.footer];
        for (const l of lines)
          expect(widthOf(l), `${width}x${rows}: ${textOf(l)}`).toBeLessThanOrEqual(width);
        const used = lines.reduce((n, l) => n + rowsOf(l), 0);
        expect(used, `${width}x${rows}`).toBeLessThanOrEqual(rows);
      }
  });

  test("shows one Enter at most, and binds no key while Discard asks", () => {
    for (const room of [ROOM, { ...ROOM, hasAllKeys: false }, { width: 40, rows: 9 }]) {
      const { text, view, keys } = play(intents, form, room);
      expect(text.join("\n").split("↵").length - 1, text.join("\n")).toBeLessThanOrEqual(1);
      if (view.isConfirming) expect(keys).toEqual(["k"]);
    }
  });
});

describe("a duplicate's page", () => {
  test("shows both answers and the comment in every room, whatever else gives way", () => {
    const long = {
      ...FORM,
      duplicate: {
        ...FORM.duplicate!,
        comment: "It also ignores the header on every retry path. ".repeat(6).trim(),
      },
    };
    for (const form of [FORM, long])
      for (const rows of [6, 8, 12, 26])
        for (const width of [40, 44, 68, 110]) {
          const page = play([{ enter: true }], form, { width, rows }).text.join("\n");
          expect(page, `${width}x${rows}`).toMatch(/A ● Comment on PLT-212/);
          expect(page, `${width}x${rows}`).toMatch(/B ○ Create the new/);
          expect(page, `${width}x${rows}`).toContain("│ It also ignores");
        }
  });

  test("the comment is whole wherever the room can hold it", () => {
    const { text } = play([{ enter: true }], FORM, { width: 44, rows: 14 });
    expect(
      text
        .join(" ")
        .replace(/\s*│\s*/g, " ")
        .replace(/\s+/g, " "),
    ).toContain(FORM.duplicate!.comment);
  });
});

describe("the tightest room", () => {
  test("keeps every field that is set and says the description is there", () => {
    const set = { ...FORM, labelIds: FORM.labels.slice(0, 2).map((l) => l.value) };
    const page = play([], set, { width: 66, rows: 6 }).text.join("\n");
    expect(page).toMatch(/T PLT/);
    expect(page).toMatch(/L Label 0/);
    expect(page).toMatch(/↓ \d+ more/);
    expect(page).not.toMatch(/J None/);
  });

  test("a duplicate's comment is whole in the short box, and says so where it cannot be", () => {
    const comment =
      "The sync worker also ignores Retry-After on a 429: it doubles its own delay, so it retries before the API allows.";
    const form = { ...FORM, duplicate: { ...FORM.duplicate!, comment } };
    const words = (room: Room) =>
      play([{ enter: true }], form, room)
        .text.join(" ")
        .replace(/\s*│\s*/g, " ")
        .replace(/\s+/g, " ");
    // The row about the issue goes before a row of the comment does.
    expect(words({ width: 66, rows: 6 })).toContain(comment);
    expect(words({ width: 40, rows: 6 })).toMatch(/\d+ more rows/);
  });
});

describe("the draft keeps one height", () => {
  test("opening a field, typing the title and asking to discard move nothing under them", () => {
    const height = (intents: Intent[]) => play(intents, PLAIN).text.length;
    for (const key of ["p", "t", "d", "e"]) expect(height([{ key }]), key).toBe(height([]));
  });

  test("a short draft grows for a field's choices instead of windowing a handful", () => {
    const short = { ...PLAIN, description: "One line.", labelIds: [] };
    const { text } = play([{ key: "s" }], short, { width: 68, rows: 30 });
    for (const status of ["Backlog", "Todo", "Done"]) expect(text.join("\n")).toContain(status);
  });

  test("the title is whole before the description gets a row", () => {
    const long = {
      ...PLAIN,
      title: "A title of many words that takes four rows in a narrow pane ".repeat(3).trim(),
    };
    for (const rows of [9, 12, 16, 30]) {
      const { text } = play([], long, { width: 44, rows });
      expect(text.join(" ").replace(/\s+/g, " "), `${rows} rows`).toContain(long.title);
    }
  });
});

describe("keys and clicks", () => {
  test("only Enter writes to Linear: no letter the screen binds files anything", () => {
    for (const form of [FORM, PLAIN])
      for (const before of [
        [],
        [{ enter: true }],
        [{ key: "p" }],
        [{ key: "l" }],
        [{ key: "d" }],
      ] as Intent[][]) {
        const at = play(before, form);
        if (writes(at.effects).length) continue;
        for (const key of [...at.keys, "o", "c", "n", "y"])
          expect(
            writes(play([...before, { key }, { key }], form).effects),
            `${JSON.stringify(before)} ${key}`,
          ).toEqual([]);
      }
  });

  test("Enter creates; the box says whether it is opened after", () => {
    expect(play([{ enter: true }], PLAIN).effects).toEqual([{ do: "create", open: false }]);
    expect(play([{ key: "o" }, { enter: true }], PLAIN).effects).toEqual([
      { do: "create", open: true },
    ]);
    expect(play([{ key: "o" }], PLAIN).text.at(-1)).toContain("■ Then open in Linear [o]");
    expect(play([{ enter: true }], { ...PLAIN, phase: "drafting" }).effects).toEqual([]);
    expect(play([{ enter: true }], { ...PLAIN, phase: "filing" }).effects).toEqual([]);
  });

  test("an Enter right after the draft arrives, or a duplicate is found, is not taken", () => {
    const fresh = { ...PLAIN, settledAt: 10_000 };
    const at = (now: number) => act(fresh, startView(), { enter: true }, undefined, now).effects;
    expect(at(10_200)).toEqual([]);
    expect(at(10_700)).toEqual([{ do: "create", open: false }]);
    // A click counts as Enter does: the step before had its lit button in the same cell.
    const press = (now: number) =>
      act(fresh, startView(), { hit: "act:create" }, undefined, now).effects;
    expect(press(10_200)).toEqual([]);
    expect(press(10_700)).toEqual([{ do: "create", open: false }]);
    const picking: View = { ...startView(), step: { pick: "priority" }, focus: 2 };
    const chosen = act(fresh, picking, { enter: true }, undefined, 30_000);
    expect(chosen.view.step).toBe("review");
    expect(act(fresh, chosen.view, { hit: "act:create" }, undefined, 30_100).effects).toEqual([]);
    // The page a duplicate is decided on asks for an Enter of its own, too.
    const page = act(FORM, startView(), { enter: true }, undefined, 20_000).view;
    expect(act(FORM, page, { enter: true }, undefined, 20_100).effects).toEqual([]);
    expect(act(FORM, page, { hit: "act:send" }, undefined, 20_100).effects).toEqual([]);
    expect(act(FORM, page, { enter: true }, undefined, 21_000).effects).toEqual([
      { do: "comment", open: false },
    ]);
  });

  test("a duplicate is decided on its own page: Enter goes there, and sends what is chosen", () => {
    expect(play([]).text.at(-1)).toContain("Create… ↵");
    const page = play([{ enter: true }]);
    expect(page.effects).toEqual([]);
    expect(page.view.step).toBe("duplicate");
    expect(page.text.join("\n")).toContain("It also ignores the header.");
    expect(page.text.at(-1)).toContain("Send comment ↵");
    expect(play([{ enter: true }, { enter: true }]).effects).toEqual([
      { do: "comment", open: false },
    ]);
    const anyway = play([{ hit: "duplicate" }, { key: "b" }]);
    expect(anyway.text.at(-1)).toContain("Create issue ↵");
    expect(play([{ enter: true }, { key: "b" }, { enter: true }]).effects).toEqual([
      { do: "create", open: false },
    ]);
    expect(play([{ enter: true }, { escape: true }]).view.step).toBe("review");
    expect(play([{ enter: true }, { key: "0" }]).view.step).toBe("review");
  });

  test("a field's letter opens it on the value it has; a letter or Enter picks and closes", () => {
    expect(play([{ key: "p" }]).view).toMatchObject({ step: { pick: "priority" }, focus: 2 });
    expect(play([{ key: "p" }, { key: "a" }]).form.priority).toBe(1);
    expect(play([{ key: "p" }, { move: 1 }, { enter: true }]).form.priority).toBe(4);
    expect(play([{ key: "p" }, { key: "a" }]).view.step).toBe("review");
    expect(play([{ key: "p" }, { enter: true }]).effects).toEqual([]);
    expect(play([{ hit: "field:team" }, { key: "b" }]).effects).toEqual([
      { do: "team", team: "WEB" },
    ]);
  });

  test("labels stay open while they are ticked; Enter is done with them", () => {
    const ticked = play([{ key: "l" }, { key: "a" }, { key: "c" }]);
    expect(ticked.view.step).toEqual({ pick: "labels" });
    expect(ticked.form.labelIds).toEqual(["Label 0 保存"]);
    expect(play([{ key: "l" }, { space: true }]).form.labelIds).toEqual([]);
    expect(play([{ key: "l" }]).text.at(-1)).toContain("Done ↵  Tick [space]");
    // Without Space, a digit ticks the row under the pointer.
    const pane = { ...ROOM, hasAllKeys: false };
    expect(play([{ key: "l" }], FORM, pane).text.at(-1)).toContain("Done ↵  Tick [1]");
    expect(play([{ key: "l" }, { move: 1 }, { hit: "act:choose" }]).form.labelIds).toContain(
      "Label 3 保存",
    );
    expect(play([{ key: "l" }, { move: 30 }, { key: "1" }], FORM, pane).form.labelIds).toContain(
      "Label 32 保存",
    );
    expect(play([{ key: "l" }, { key: "0" }], FORM, pane).view.step).toBe("review");
    expect(play([{ key: "l" }], FORM, { ...ROOM, hasAllKeys: false }).text.at(-1)).not.toContain(
      "space",
    );
    const done = play([{ key: "l" }, { move: 1 }, { enter: true }]);
    expect(done.view.step).toBe("review");
    expect(done.form.labelIds).toEqual(FORM.labelIds);
  });

  test("the title is saved as one line, and an empty one keeps what it was", () => {
    expect(play([{ key: "e" }, { text: "Cap outage\nlatency " }]).form.title).toBe(
      "Cap outage latency",
    );
    expect(play([{ key: "e" }, { text: "  " }]).form.title).toBe(FORM.title);
    expect(play([{ key: "e" }, { escape: true }]).view.step).toBe("review");
  });

  test("x opens the description as its Markdown: saved as typed, and left as it was otherwise", () => {
    const open = play([{ key: "x" }]);
    expect(open.view.step).toBe("body");
    // Every key is the field's while it is typed in.
    expect(open.keys).toEqual([]);
    expect(open.text.at(-1)).toMatch(/Save ↵\s+Cancel \[esc\]$/);
    expect(play([{ hit: "act:edit" }]).view.step).toBe("body");
    const saved = play([{ key: "x" }, { text: "First line.\r\n\r\n- a\n- b\n  " }]);
    expect(saved.form.description).toBe("First line.\n\n- a\n- b");
    expect(saved.view).toMatchObject({ step: "review", top: 0 });
    expect(saved.form.fieldRevision).toBe(FORM.fieldRevision + 1);
    expect(writes(saved.effects)).toEqual([]);
    for (const leave of [{ escape: true }, { hit: "act:back" }, { enter: true }] as Intent[]) {
      const left = play([{ key: "x" }, leave]);
      expect(left.view.step).toBe("review");
      expect(left.form.description).toBe(FORM.description);
    }
    // A description may be emptied.
    expect(play([{ key: "x" }, { text: " " }]).form.description).toBe("");
  });

  test("the description's field takes the rows under the title, and names its key for a new line", () => {
    const field = (form: Form, room: Room) => {
      const d = draw(form, play([{ key: "x" }], form, room).view, room);
      const slot = d.body.find((l) => l.slot?.kind === "input")?.slot;
      if (slot?.kind !== "input") throw new Error("no field");
      return { slot, rows: d.body.reduce((n, l) => n + rowsOf(l), 0) + d.footer.length };
    };
    // A long draft keeps its height: the field has what the fields and the description had.
    const long = field(FORM, ROOM);
    expect(long.rows).toBe(play([], FORM, ROOM).text.length);
    expect(long.slot.rows).toBeGreaterThanOrEqual(18);
    // A short one grows to be written in, as far as the room goes.
    const short = { ...PLAIN, title: "Short", description: "One line." };
    expect(field(short, { width: 68, rows: 40 }).slot.rows).toBe(12);
    expect(field(short, { width: 68, rows: 9 }).slot.rows).toBeGreaterThanOrEqual(3);
    // Set in like the rest, or at the room's edge for a client whose field cannot be set in.
    expect(field(FORM, ROOM).slot.width).toBeLessThan(ROOM.width);
    expect(field(FORM, { ...ROOM, isFieldFlush: true }).slot).toMatchObject({
      lead: [],
      width: ROOM.width,
    });
    expect(play([{ key: "x" }], FORM, { ...ROOM, newline: "shift+enter" }).text.at(-1)).toContain(
      "shift+enter new line",
    );
    expect(play([{ key: "x" }]).text.at(-1)).not.toContain("new line");
  });

  test("discard asks in the buttons' row: Enter throws the draft away, anything else keeps it", () => {
    const asked = play([{ key: "d" }]);
    expect(asked.effects).toEqual([]);
    expect(asked.text.at(-1)).toMatch(/Discard draft\?\s+Discard ↵\s+Keep \[esc\]/);
    expect(asked.text.join("\n")).not.toContain("Create");
    expect(play([{ key: "d" }], FORM, { ...ROOM, hasAllKeys: false }).text.at(-1)).toContain(
      "Keep [k]",
    );
    expect(play([{ key: "d" }, { enter: true }]).effects).toEqual([{ do: "discard" }]);
    expect(play([{ key: "d" }, { escape: true }])).toMatchObject({
      effects: [],
      view: { isConfirming: false },
    });
    expect(play([{ key: "d" }, { key: "k" }]).view.isConfirming).toBe(false);
    expect(play([{ key: "d" }, { hit: "frame:discard" }]).effects).toEqual([{ do: "discard" }]);
    // A draft still being written, or one that failed, asks too.
    expect(play([{ key: "d" }], { ...FORM, phase: "drafting" }).effects).toEqual([]);
    expect(play([{ key: "d" }, { enter: true }], { ...FORM, phase: "failed" }).effects).toEqual([
      { do: "discard" },
    ]);
  });

  test("arrows and the rows that count what is cut step the description, within what there is", () => {
    const room: Room = { width: 68, rows: 16 };
    expect(play([{ move: 1 }], FORM, room).view.top).toBe(3);
    expect(play([{ move: -1 }], FORM, room).view.top).toBe(0);
    const end = play(
      Array.from({ length: 40 }, () => ({ hit: "scroll:down" })),
      FORM,
      room,
    );
    expect(end.text.join("\n")).toMatch(/↑ \d+ more/);
    expect(end.text.join("\n")).not.toMatch(/↓ \d+ more/);
  });

  test("Escape puts the draft aside; a failed draft can be tried again", () => {
    expect(play([{ escape: true }]).effects).toEqual([{ do: "hide" }]);
    expect(play([{ hit: "frame:close" }]).effects).toEqual([{ do: "hide" }]);
    expect(play([{ enter: true }], { ...FORM, phase: "failed", error: "no" }).effects).toEqual([
      { do: "retry" },
    ]);
  });

  test("the keys a client binds are the ones the screen takes", () => {
    expect(keysOf(FORM, startView())).toEqual(["e", "t", "s", "p", "l", "j", "x", "o", "d"]);
    expect(play([{ key: "p" }]).keys).toEqual(["a", "b", "c", "d", "e", "0"]);
    expect(play([{ enter: true }]).keys).toEqual(["a", "b", "o", "0"]);
    expect(keysOf({ ...FORM, phase: "filing" }, startView())).toEqual([]);
  });
});
