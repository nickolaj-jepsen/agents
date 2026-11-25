import { cellWidth, textOf, type Line } from "@agents/kit-core/lines.ts";
import { describe, expect, it } from "vitest";
import {
  artefactsText,
  BAND,
  bandLine,
  bandOf,
  BUTTONS,
  drawScreen,
  emptyText,
  isReaderLive,
  isScreenHit,
  keyIntent,
  pathOf,
  readingState,
  reduce,
  rowHit,
  startState,
  WHEEL_ROWS,
  zoneAt,
  type ScreenOptions,
  type ScreenState,
} from "./screen.ts";
import { memoryGroup, notesOf, shelve, type Group } from "./shelf.ts";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 25, 12);
const at = (hoursAgo: number) => NOW - hoursAgo * HOUR;

const STORE = shelve("/s", [
  { path: "plans/retry-after.md", mtimeMs: at(1) },
  { path: "plans/hub/PLAN.md", mtimeMs: at(30) },
  { path: "plans/hub/diagram.png", mtimeMs: at(30) },
  { path: "reports/Evaluating skills.html", mtimeMs: at(3) },
  { path: "findings/bg.md", mtimeMs: at(5) },
  { path: "screens/list@70x24.png", mtimeMs: at(2) },
  { path: "screens/list@160x45.png", mtimeMs: at(2) },
  { path: "README.md", mtimeMs: at(500) },
]);
const MEMORY = memoryGroup("/m", [{ path: "MEMORY.md", mtimeMs: at(9) }]) as Group;
const GROUPS = [...STORE, MEMORY];

const RETRY = "plans:plans/retry-after.md";
const PLAN = "plans:plans/hub/PLAN.md";
const REPORT = "reports:reports/Evaluating skills.html";

const TALL: ScreenOptions = { width: 70, height: 30, now: NOW };
const SHORT: ScreenOptions = { width: 70, height: 14, now: NOW };
const TINY: ScreenOptions = { width: 70, height: 6, now: NOW };

const texts = (lines: readonly Line[]) => lines.map(textOf);
const shown = (s: ScreenState, o: ScreenOptions) => texts(drawScreen(s, o).lines);
const has = (rows: readonly string[], pattern: RegExp) => rows.some((row) => pattern.test(row));
const fits = (s: ScreenState, o: ScreenOptions) =>
  drawScreen(s, o).lines.every((l) => cellWidth(textOf(l)) <= o.width);

/** The state after `intents`, each through the reducer. */
function after(s: ScreenState, o: ScreenOptions, ...intents: Parameters<typeof reduce>[1][]) {
  let state = s;
  let effect: ReturnType<typeof reduce>["effect"];
  for (const intent of intents) ({ state, effect } = reduce(state, intent, o));
  return { state, effect };
}

/** The reader open on `id` with `text` read. */
const reading = (id: string, text: string, o = TALL) =>
  after(readingState(startState(GROUPS), id), o, { do: "loaded", id, body: { text } }).state;

const LONG = Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n");

describe("the list", () => {
  it("starts on the newest note and says how many there are", () => {
    const s = startState(GROUPS);
    expect(s.focus).toBe(RETRY);
    const rows = shown(s, TALL);
    expect(rows[0]).toMatch(/^─ Notes ── 6 notes ─+ Close × ─$/);
    expect(rows).toHaveLength(TALL.height);
    expect(fits(s, TALL)).toBe(true);
  });

  it("groups by folder, with each note's age and each folder's artefacts beside its name", () => {
    const rows = shown(startState(GROUPS), TALL);
    expect(has(rows, /^ {2}plans {2,}1 artefact$/)).toBe(true);
    expect(has(rows, /^ {2}❯ retry-after\.md {2,}1h$/)).toBe(true);
    expect(has(rows, /^ {4}hub\/PLAN\.md {2,}1d$/)).toBe(true);
    // A folder with only artefacts still stands, with its count; the harness's memory comes last.
    const order = ["plans", "reports", "findings", "store", "screens", "memory"].map((label) =>
      rows.findIndex((row) => new RegExp(`^ {2}${label}\\b`).test(row)),
    );
    expect(order.every((row, i) => row > 0 && (i === 0 || row > (order[i - 1] ?? 0)))).toBe(true);
    expect(has(rows, /^ {2}screens {2,}2 artefacts$/)).toBe(true);
    // A blank row parts one folder from the next.
    const reports = rows.findIndex((row) => /^ {2}reports/.test(row));
    expect(rows[reports - 1]?.trim()).toBe("");
  });

  it("ends on its buttons under a rule: Read, or Open in browser for an HTML note, and Open", () => {
    const rows = shown(startState(GROUPS), TALL);
    expect(rows.at(-1)).toMatch(/^ {2}Read ↵ {2}Open \[o\]/);
    expect(rows.at(-2)).toBe("─".repeat(70));
    const html = after(startState(GROUPS), TALL, { do: "press", hit: "nothing" }).state;
    expect(shown({ ...html, focus: REPORT }, TALL).at(-1)).toMatch(
      /Open in browser ↵ {2}Open \[o\]/,
    );
  });

  it("puts the link's notice over the rows, and has no room for it in a pane of a few rows", () => {
    const s = startState(GROUPS, "store", ".agents/store is tracked by git, so notes stay here.");
    expect(shown(s, TALL)[2]).toMatch(/^ {2}\.agents\/store is tracked by git/);
    expect(has(shown(s, TINY), /tracked by git/)).toBe(false);
    // Longer than its rows, it is cut with `…`, never mid-sentence without one.
    const long = startState(GROUPS, "store", "A notice that says a lot. ".repeat(12));
    const rows = shown(long, { ...SHORT, width: 46 });
    const said = rows.filter((row) => /notice|says|lot/.test(row));
    expect(said).toHaveLength(3);
    expect(said.at(-1)).toMatch(/…$/);
  });

  it("says why it has no rows, and keeps a folder of artefacts", () => {
    const words = (s: ScreenState) => shown(s, TALL).join(" ").replace(/\s+/g, " ");
    expect(words(startState([], "store"))).toContain(
      "No notes yet. What an agent writes under .agents/store shows up here.",
    );
    expect(words(startState([], "outside"))).toContain(
      "This folder is in no git repository, so it has no store.",
    );
    expect(emptyText("none")).toBeUndefined();
    const only = shelve("/s", [{ path: "screens/a.png", mtimeMs: 0 }]);
    const rows = shown(startState(only, "store"), TALL);
    expect(has(rows, /^ {2}screens {2,}1 artefact$/)).toBe(true);
    // Nothing to act on: no buttons, so nothing under the words but the frame's Close.
    expect(has(rows, /Read ↵/)).toBe(false);
  });

  it("in a pane of a few rows, carries each row's folder and keeps the end of a long name", () => {
    const rows = shown(startState(GROUPS), TINY);
    expect(rows).toHaveLength(TINY.height);
    expect(rows[1]).toMatch(/^ {2}❯ plans › retry-after\.md {2,}1h$/);
    const deep = shelve("/s", [
      { path: `plans/${"very-long-folder/".repeat(6)}the-end.md`, mtimeMs: at(1) },
    ]);
    const row = shown(startState(deep), TINY)[1] ?? "";
    expect(row).toMatch(/ …\/[a-z/-]*\/the-end\.md {2,}1h$/);
    expect(cellWidth(row)).toBeLessThanOrEqual(TINY.width);
  });

  it("stays within its width with long names and wide characters", () => {
    const wide = shelve(
      "/s",
      Array.from({ length: 30 }, (_, i) => ({
        path: `日本語のフォルダ/${"とても長いファイル名".repeat(i % 4)}${i}.md`,
        mtimeMs: at(i),
      })),
    );
    for (const o of [TALL, SHORT, TINY, { width: 30, height: 12, now: NOW }])
      expect(fits(startState(wide), o)).toBe(true);
  });
});

describe("moving in the list", () => {
  it("steps through the notes in the order they are listed, and stops at either end", () => {
    const ids = notesOf(GROUPS).map((n) => n.id);
    const down = after(startState(GROUPS), TALL, { do: "move", by: 1 }).state;
    expect(down.focus).toBe(ids[1]);
    expect(after(startState(GROUPS), TALL, { do: "move", by: -1 }).state.focus).toBe(ids[0]);
    expect(after(startState(GROUPS), TALL, { do: "move", by: 99 }).state.focus).toBe(ids.at(-1));
  });

  it("moves the window only as far as keeps the keyboard's row in it", () => {
    const s = startState(GROUPS);
    expect(after(s, SHORT, { do: "move", by: 1 }).state.top).toBe(0);
    const last = after(s, SHORT, { do: "move", by: 99 }).state;
    expect(last.top).toBeGreaterThan(0);
    expect(has(shown(last, SHORT), /❯ MEMORY\.md/)).toBe(true);
  });

  it("scrolls by the wheel over the rows, not over the rest", () => {
    const { zones } = drawScreen(startState(GROUPS), SHORT);
    const [from, to] = zones.list ?? [0, 0];
    expect(zoneAt(zones, from)).toBe("list");
    expect(zoneAt(zones, to)).toBeUndefined();
    expect(zoneAt(zones, 0)).toBeUndefined();
    const s = after(startState(GROUPS), SHORT, {
      do: "scroll",
      zone: "list",
      by: WHEEL_ROWS,
    }).state;
    expect(s.top).toBe(WHEEL_ROWS);
    expect(s.focus).toBe(RETRY);
    // Not past the end.
    expect(after(s, SHORT, { do: "scroll", zone: "list", by: 999 }).state.top).toBeLessThan(40);
  });
});

describe("the reader", () => {
  it("opens on Enter for a Markdown note and asks for its text", () => {
    const { state, effect } = after(startState(GROUPS), TALL, { do: "main" });
    expect(state.reader).toEqual({ id: RETRY, offset: 0 });
    expect(effect).toMatchObject({ do: "read", note: { id: RETRY } });
    expect(has(shown(state, TALL), /^ {2}Reading…/)).toBe(true);
  });

  it("shows the note's path, its folder and age on the rule under it, and the text as prose", () => {
    const rows = shown(reading(RETRY, "# Retry-After\n\nThe worker **honours** it."), TALL);
    expect(rows[2]).toBe(`  plans/retry-after.md${" ".repeat(48)}`.trimEnd());
    expect(rows[3]).toMatch(/^─ plans ── 1h ─+$/);
    expect(rows[4]).toBe("  Retry-After");
    expect(rows).toContain("  The worker honours it.");
    expect(rows.at(-1)).toMatch(/^ {2}Back ↵ {2}Open \[o\]/);
  });

  it("scrolls with the arrows, the page keys and the wheel, and says what it hides", () => {
    let s = reading(RETRY, LONG);
    expect(has(shown(s, TALL), /↓ \d+ more/)).toBe(true);
    s = after(s, TALL, { do: "move", by: 1 }).state;
    expect(s.reader?.offset).toBe(1);
    const page = keyIntent("pagedown", s, TALL);
    expect(page).toMatchObject({ do: "scroll", zone: "reader" });
    s = after(s, TALL, page!).state;
    expect(s.reader?.offset).toBeGreaterThan(10);
    expect(has(shown(s, TALL), /↑ \d+ more/)).toBe(true);
    const { zones } = drawScreen(s, TALL);
    expect(zoneAt(zones, zones.reader?.[0] ?? -1)).toBe("reader");
    s = after(s, TALL, { do: "scroll", zone: "reader", by: 9999 }).state;
    expect(has(shown(s, TALL), /Paragraph 60\./)).toBe(true);
    expect(has(shown(s, TALL), /↓ \d+ more/)).toBe(false);
  });

  it("goes back to the list at the same row on Enter, Escape or Back", () => {
    const s = after(startState(GROUPS), SHORT, { do: "move", by: 99 }, { do: "main" }).state;
    expect(s.reader?.id).toBe(notesOf(GROUPS).at(-1)?.id);
    for (const intent of [
      { do: "main" },
      { do: "escape" },
      { do: "press", hit: BUTTONS.back },
    ] as const) {
      const back = after(s, SHORT, intent);
      expect(back.state.reader).toBeUndefined();
      expect(back.effect).toBeUndefined();
      expect(back.state.focus).toBe(s.reader?.id);
      expect(has(shown(back.state, SHORT), /❯ MEMORY\.md/)).toBe(true);
    }
  });

  it("does not read a note too large for it, and lights Open instead", () => {
    const s = after(readingState(startState(GROUPS), RETRY), TALL, {
      do: "loaded",
      id: RETRY,
      body: { problem: "This note is 300 KiB, too large to read here. Open hands it to an app." },
    }).state;
    const drawn = drawScreen(s, TALL).lines;
    expect(texts(drawn).join("\n")).toContain("too large to read here");
    const open = drawn.at(-1)?.spans.find((sp) => sp.text === "Open");
    expect(open?.role).toBe("accent");
  });

  it("drops text read for a note it is no longer on, and leaves a note gone from the store", () => {
    const s = readingState(startState(GROUPS), RETRY);
    expect(after(s, TALL, { do: "loaded", id: PLAN, body: { text: "x" } }).state.reader?.body).toBe(
      undefined,
    );
    const gone = { ...s, groups: GROUPS.filter((g) => g.label !== "plans") };
    expect(has(shown(gone, TALL), /Open in browser ↵/)).toBe(true);
    expect(after(gone, TALL, { do: "move", by: 1 }).state.reader).toBeUndefined();
  });

  it("in a pane of a few rows, puts the note in the caption and its text under it", () => {
    const rows = shown(reading(RETRY, LONG, TINY), TINY);
    expect(rows).toHaveLength(TINY.height);
    expect(rows[0]).toMatch(/^─ plans\/retry-after\.md ── 1h ─+ Close × ─$/);
    expect(rows[1]).toBe("  Paragraph 1.");
  });
});

describe("what a key or a click does", () => {
  it("hands an HTML note to the browser on Enter and a click, and any note to an app on o", () => {
    const html = { ...startState(GROUPS), focus: REPORT };
    expect(after(html, TALL, { do: "main" }).effect).toMatchObject({
      do: "hand",
      way: "browser",
      note: { id: REPORT },
    });
    expect(after(html, TALL, { do: "press", hit: rowHit(REPORT) }).effect).toMatchObject({
      do: "hand",
      way: "browser",
    });
    expect(after(html, TALL, { do: "open" }).effect).toMatchObject({ do: "hand", way: "app" });
    const read = reading(RETRY, "text");
    expect(after(read, TALL, { do: "press", hit: BUTTONS.open }).effect).toMatchObject({
      do: "hand",
      way: "app",
      note: { id: RETRY },
    });
  });

  it("reads a Markdown note a click lands on, and moves the keyboard there first", () => {
    const { state, effect } = after(startState(GROUPS), TALL, { do: "press", hit: rowHit(PLAN) });
    expect(state.focus).toBe(PLAN);
    expect(state.reader?.id).toBe(PLAN);
    expect(effect).toMatchObject({ do: "read", note: { id: PLAN } });
    const focused = after(startState(GROUPS), TALL, { do: "focus", hit: rowHit(PLAN) });
    expect(focused.state.focus).toBe(PLAN);
    expect(focused.state.reader).toBeUndefined();
    expect(focused.effect).toBeUndefined();
  });

  it("closes on Escape, Close, and Enter where there is nothing to act on", () => {
    expect(after(startState(GROUPS), TALL, { do: "escape" }).effect).toEqual({ do: "close" });
    expect(after(startState(GROUPS), TALL, { do: "press", hit: "frame:close" }).effect).toEqual({
      do: "close",
    });
    expect(after(startState([]), TALL, { do: "main" }).effect).toEqual({ do: "close" });
    expect(after(startState([]), TALL, { do: "open" }).effect).toBeUndefined();
  });

  it("says what went wrong until the next key, and shows the control under the pointer", () => {
    let s = after(startState(GROUPS), TALL, { do: "say", text: "No app that opens a file." }).state;
    expect(shown(s, TALL).at(-3)).toMatch(/^ {2}No app that opens a file\./);
    s = after(s, TALL, { do: "move", by: 1 }).state;
    expect(s.said).toBeUndefined();
    s = after(s, TALL, { do: "hover", hit: rowHit(RETRY) }).state;
    const row = drawScreen(s, TALL).lines.find((l) => textOf(l).includes("retry-after.md"));
    expect(row?.spans.find((sp) => sp.text.includes("retry-after"))?.bold).toBe(true);
  });

  it("names its keys, and tells its own controls from others", () => {
    const s = startState(GROUPS);
    expect(keyIntent("j", s, TALL)).toEqual({ do: "move", by: 1 });
    expect(keyIntent("up", s, TALL)).toEqual({ do: "move", by: -1 });
    expect(keyIntent("enter", s, TALL)).toEqual({ do: "main" });
    expect(keyIntent("escape", s, TALL)).toEqual({ do: "escape" });
    expect(keyIntent("o", s, TALL)).toEqual({ do: "open" });
    expect(keyIntent("x", s, TALL)).toBeUndefined();
    expect(keyIntent("pageup", s, TALL)).toMatchObject({ do: "scroll", zone: "list" });
    for (const hit of [rowHit(RETRY), BUTTONS.main, BUTTONS.open, BUTTONS.back, "frame:close"])
      expect(isScreenHit(hit)).toBe(true);
    expect(isScreenHit(BAND.read)).toBe(false);
  });
});

describe("the small words", () => {
  it("names a note by its folder and path, and one in no folder bare", () => {
    const [retry] = notesOf(GROUPS);
    expect(pathOf(GROUPS, retry!)).toBe("plans/retry-after.md");
    const readme = notesOf(GROUPS).find((n) => n.name === "README.md");
    expect(pathOf(GROUPS, readme!)).toBe("README.md");
  });

  it("counts the folders' artefacts in a sentence", () => {
    expect(artefactsText(GROUPS)).toBe("1 artefact in plans and 2 in screens.");
    expect(artefactsText(shelve("/s", [{ path: "a/x.png", mtimeMs: 0 }]))).toBe("1 artefact in a.");
    expect(artefactsText(STORE.filter((g) => g.artefacts === 0))).toBeUndefined();
  });
});

describe("a reader that Escape can leave", () => {
  it("is one on a note that is on the shelf", () => {
    expect(isReaderLive(GROUPS, { id: RETRY })).toBe(true);
    expect(isReaderLive(GROUPS, { id: "plans:plans/gone.md" })).toBe(false);
    expect(isReaderLive(GROUPS, null)).toBe(false);
    expect(isReaderLive(GROUPS, undefined)).toBe(false);
    // The list is what a reader on a gone note draws, so there is nothing to go back from.
    const stale = readingState(startState(GROUPS), "plans:plans/gone.md");
    expect(has(shown(stale, TALL), /❯ retry-after\.md/)).toBe(true);
  });
});

describe("the band", () => {
  it("is the newest note written since a time, and nothing when none was", () => {
    expect(bandOf(GROUPS, at(4))).toEqual({
      text: "2 notes written, last plans/retry-after.md",
      newest: RETRY,
    });
    // Memory is the harness's own: a note it wrote is not news.
    expect(bandOf(GROUPS, at(1))).toBeUndefined();
  });

  it("is one line: the way in, then Dismiss, each a control of its own", () => {
    const l = bandLine({ text: "Note written: plans/retry-after.md", hint: "read", width: 70 });
    expect(textOf(l)).toBe("✓ Note written: plans/retry-after.md read  Dismiss");
    expect(l.spans[0]?.hit).toBe(BAND.read);
    expect(l.spans.at(-1)?.hit).toBe(BAND.dismiss);
    const narrow = bandLine({
      text: "Note written: plans/retry-after.md",
      hint: "/notes",
      width: 30,
    });
    expect(cellWidth(textOf(narrow))).toBeLessThanOrEqual(30);
    expect(textOf(narrow)).toMatch(/… \/notes {2}Dismiss$/);
  });
});
