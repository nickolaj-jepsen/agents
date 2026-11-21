import { describe, expect, test } from "vitest";

import { cellWidth, textOf, widthOf, type Line, type Span } from "../claude/kit/lines.ts";
import { openQueue, type Suggestion } from "./docfix.ts";
import {
  drawScreen,
  keyIntent,
  reduce,
  startState,
  zoneAt,
  type Intent,
  type ScreenOptions,
  type ScreenState,
} from "./screen.ts";

const NOW = Date.parse("2026-11-15T10:00:00Z");
const DAY = 86_400_000;

const make = (
  id: string,
  target: string,
  claim: string,
  seenBy = 1,
  evidence = [`${target}: the line contradicts what the code does now.`],
): Suggestion => ({
  id,
  target,
  kind: "wrong",
  claim,
  status: "open",
  created: new Date(NOW - 5 * DAY).toISOString(),
  updated: new Date(NOW - 2 * DAY).toISOString(),
  dismissed: "",
  sessions: Array.from({ length: seenBy }, (_, i) => `s${i}`),
  evidence: evidence.map((text, i) => ({
    at: new Date(NOW - (evidence.length - i) * DAY).toISOString(),
    session: `pi:${i}`,
    text,
  })),
});

const QUEUE = openQueue([
  make("a1", "docs/agent-hub.md", "Unittest suite needs a short `TMPDIR` and markdown-it-py", 2),
  make("a2", "docs/agent-hub.md", "Socket tests fail with AF_UNIX path too long"),
  make(
    "b1",
    "docs/agents.md",
    "pi's permission gate cannot resolve shell variables, so `cat $S/id` reads what `cat ~/.ssh/id` denies.",
    3,
    [
      'Migrated from pi memory `gate-vars`.\n\nMeasured: the path projection resolves only HOME.\n\nWhy the repo didn\'t say it: the docs describe the gate as matching on the command text.\n\nCitations: [{"kind":"path","value":"modules/pi/default.nix"}]',
      "Hit it again from a worktree.",
    ],
  ),
  make("b2", "docs/agents.md", "The hub migration plan is finished"),
  make(
    "c1",
    "skills/agent-plugin-dev/references/a-very-long-folder-name/style.md",
    "東京の節は古くなっています。全角文字の説明文が続きます。",
    12,
  ),
]);

const MANY = openQueue(
  Array.from({ length: 28 }, (_, i) =>
    make(`m${String(i).padStart(2, "0")}`, `docs/page-${Math.floor(i / 4)}.md`, `Claim ${i + 1}`),
  ),
);

const WIDTHS = [44, 48, 64, 100];
const HEIGHTS = [4, 6, 12, 18, 24, 45];

const run = (s: ScreenState, intents: Intent[], o: ScreenOptions) =>
  intents.reduce((at, intent) => reduce(at, intent, o).state, s);

const down = (n: number): Intent[] => Array(n).fill({ do: "move", by: 1 });

/** Every state the design names, reached through the reducer as a person would. */
function states(o: ScreenOptions): Record<string, ScreenState> {
  const queue = startState(QUEUE, 4);
  return {
    queue,
    many: run(startState(MANY), down(13), o),
    set: run(
      queue,
      [
        { do: "set", choice: "apply" },
        { do: "set", choice: "dismiss" },
      ],
      o,
    ),
    decided: run(queue, [{ do: "press", hit: "all:apply:docs/agent-hub.md" }], o),
    dismissOnly: run(queue, [{ do: "set", choice: "dismiss" }], o),
    reader: run(queue, [{ do: "press", hit: "row:b1" }, { do: "reader" }], o),
    readerNext: run(queue, [{ do: "press", hit: "row:b1" }, { do: "reader" }, { do: "next" }], o),
    readerSet: run(queue, [{ do: "reader" }, { do: "set", choice: "dismiss" }], o),
    confirm: run(queue, [{ do: "set", choice: "apply" }, { do: "close" }], o),
    failed: {
      ...run(queue, [{ do: "set", choice: "apply" }], o),
      notice: "The prompt box can't take the draft right now: press Enter to try again.",
    },
    hover: run(queue, [{ do: "hover", hit: "row:b2" }], o),
    empty: startState([], 4),
  };
}

const at = (width: number, height: number): ScreenOptions => ({
  width,
  height,
  now: NOW,
  wholeDoc: true,
});

const spansOf = (lines: Line[]) => lines.flatMap((l) => l.spans);
const find = (lines: Line[], text: string) => lines.find((l) => textOf(l).includes(text));
const texts = (s: ScreenState, o: ScreenOptions) => drawScreen(s, o).lines.map(textOf);

describe("every state at every size", () => {
  for (const width of WIDTHS)
    for (const height of HEIGHTS) {
      const o = at(width, height);
      for (const [name, s] of Object.entries(states(o)))
        test(`${name} at ${width}x${height} fits its width and, with a queue, its height`, () => {
          const { lines } = drawScreen(s, o);
          for (const l of lines)
            expect(widthOf(l), `${name}: ${textOf(l)}`).toBeLessThanOrEqual(width);
          if (s.queue.length) expect(lines).toHaveLength(height);
          // Back is on the reader's first row at every size, and the evidence rule under the queue.
          if (s.reader !== undefined && s.queue.length)
            expect(lines.some((l) => textOf(l).includes("Back [esc]"))).toBe(true);
          if (s.reader === undefined && s.queue.length && height >= 9)
            expect(lines.some((l) => /Evidence .*Read \[e\]/.test(textOf(l)))).toBe(true);
        });
    }
});

describe("the footer never changes", () => {
  test("it is the main action, Apply and Dismiss, nothing else, in every state", () => {
    const o = at(64, 45);
    for (const [name, s] of Object.entries(states(o))) {
      if (!s.queue.length) continue;
      const row = texts(s, o)
        .find((l) => l.includes("Apply [a]"))!
        .trim();
      expect(row, name).toMatch(/^(Draft prompt|Dismiss|Close) ↵  Apply \[a\]  Dismiss \[d\]$/);
    }
  });

  test("the main action is one of three, accented only when armed", () => {
    const o = at(64, 45);
    const main = (s: ScreenState) =>
      spansOf(drawScreen(s, o).lines).find((sp) => sp.hit === "main");
    const s = startState(QUEUE);
    expect(main(s)).toMatchObject({ text: "Close", role: "text" });
    expect(main(run(s, [{ do: "set", choice: "dismiss" }], o))).toMatchObject({
      text: "Dismiss",
      role: "accent",
    });
    expect(
      main(
        run(
          s,
          [
            { do: "set", choice: "dismiss" },
            { do: "set", choice: "apply" },
          ],
          o,
        ),
      ),
    ).toMatchObject({ text: "Draft prompt", role: "accent" });
  });

  test("while Close asks, the footer is dim and inert, and the question has the number", () => {
    const o = at(44, 18);
    const s = run(startState(QUEUE), [{ do: "set", choice: "apply" }, { do: "close" }], o);
    const lines = drawScreen(s, o).lines;
    expect(textOf(lines[0]!)).toContain("Discard 1?  Discard ↵  Keep [esc]");
    const footer = find(lines, "Apply [a]")!;
    for (const sp of footer.spans.filter((x) => x.text.trim())) {
      expect(sp.role).toBe("dim");
      expect(sp.hit).toBeUndefined();
    }
    expect(reduce(s, { do: "press", hit: "main" }, o).effect).toBeUndefined();
  });
});

describe("nothing jumps", () => {
  const o = at(64, 45);
  const rowOf = (s: ScreenState, text: string) => texts(s, o).findIndex((l) => l.includes(text));

  test("moving, setting a row and a click keep the frame, the zones and the footer", () => {
    const start = startState(QUEUE);
    const base = drawScreen(start, o);
    for (const intents of [
      [{ do: "move", by: 1 }],
      [{ do: "set", choice: "apply" }],
      [
        { do: "set", choice: "dismiss" },
        { do: "move", by: 3 },
      ],
      [{ do: "press", hit: "row:b1" }],
      [{ do: "press", hit: "all:dismiss:docs/agent-hub.md" }],
    ] as Intent[][]) {
      const s = run(start, intents, o);
      const drawn = drawScreen(s, o);
      expect(drawn.lines).toHaveLength(base.lines.length);
      expect(drawn.zones).toEqual(base.zones);
      expect(rowOf(s, "Apply [a]")).toBe(rowOf(start, "Apply [a]"));
    }
  });

  test("the window moves only when the keyboard would leave it, never for a click", () => {
    const s = startState(MANY);
    const top = (x: ScreenState) => x.scroll.list;
    const steps = Array.from({ length: 20 }, (_, n) => top(run(s, down(n), o)));
    expect(steps.slice(0, 10).every((t) => t === 0)).toBe(true);
    for (let n = 1; n < steps.length; n++) expect(steps[n]! - steps[n - 1]!).toBeLessThanOrEqual(2);
    // A click on the window's last row puts the keyboard there; the window stays.
    const lines = drawScreen(s, o);
    const last = lines.lines[lines.zones.list![1] - 2]!;
    const hit = last.spans.find((sp) => sp.hit?.startsWith("row:"))!.hit!;
    const clicked = reduce(s, { do: "press", hit }, o).state;
    expect(clicked.focus).toBe(hit.slice(4));
    expect(top(clicked)).toBe(0);
  });

  test("the wheel moves the window three rows a notch, and not the keyboard", () => {
    const o = at(64, 24);
    const s = startState(MANY);
    const once = reduce(s, { do: "scroll", zone: "list", by: 3 }, o).state;
    expect(once.scroll.list).toBe(3);
    expect(once.focus).toBe(s.focus);
    const end = run(s, Array(40).fill({ do: "scroll", zone: "list", by: 3 }), o);
    expect(texts(end, o).some((l) => l.includes("Claim 28"))).toBe(true);
    expect(run(end, Array(40).fill({ do: "scroll", zone: "list", by: -3 }), o).scroll.list).toBe(0);
  });
});

describe("the queue", () => {
  const o = at(64, 45);

  test("is grouped by doc behind rails, the keyboard's path in the accent with its controls", () => {
    const { lines } = drawScreen(startState(QUEUE), o);
    const head = find(lines, "docs/agent-hub.md")!;
    expect(head.spans.find((sp) => sp.text === "docs/agent-hub.md")).toMatchObject({
      role: "accent",
    });
    expect(textOf(head)).toMatch(/Apply all  Dismiss all$/);
    expect(textOf(find(lines, "docs/agents.md")!).trim()).toBe("│  docs/agents.md");
    expect(textOf(find(lines, "…/")!)).toContain("style.md");
  });

  test("keeps the seen count's column, blank when seen once, so the cut text lines up", () => {
    const lines = texts(startState(QUEUE), o);
    // Latin rows: a wide character at the cut ends it a cell early.
    const cut = lines.filter((l) => /^│ {2}[ ❯] [○●–] [ -~]*…/.test(l));
    expect(cut.length).toBeGreaterThan(1);
    expect(new Set(cut.map((l) => cellWidth(l.slice(0, l.indexOf("…"))))).size).toBe(1);
  });

  test("a row set to apply is in the accent with a filled mark; dismissed, the whole row is dim", () => {
    const s = run(
      startState(QUEUE),
      [
        { do: "set", choice: "apply" },
        { do: "set", choice: "dismiss" },
      ],
      o,
    );
    const { lines } = drawScreen(s, o);
    const applied = find(lines, "Unittest suite")!;
    expect(textOf(applied)).toContain("● Unittest");
    expect(applied.spans.find((sp) => sp.text.startsWith("Unittest"))).toMatchObject({
      role: "accent",
      bold: true,
    });
    const dropped = find(lines, "Socket tests")!;
    expect(textOf(dropped)).toContain("– Socket");
  });

  test("Apply all sets the doc without moving the keyboard; again, it undoes it", () => {
    const s = startState(QUEUE);
    const all = reduce(s, { do: "press", hit: "all:apply:docs/agent-hub.md" }, o).state;
    expect(all.set).toEqual({ a1: "apply", a2: "apply" });
    expect(all.focus).toBe(s.focus);
    expect(find(drawScreen(all, o).lines, "docs/agent-hub.md")!.spans[0]).toMatchObject({
      role: "success",
    });
    expect(reduce(all, { do: "press", hit: "all:apply:docs/agent-hub.md" }, o).state.set).toEqual(
      {},
    );
  });

  test("a click on a mark steps it: alone, apply, dismiss, alone; elsewhere it only moves", () => {
    let s = startState(QUEUE);
    const marks: (string | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      s = reduce(s, { do: "press", hit: "mark:b2" }, o).state;
      marks.push(s.set.b2);
    }
    expect(marks).toEqual(["apply", "dismiss", undefined, "apply"]);
    expect(s.focus).toBe("b2");
    const moved = reduce(startState(QUEUE), { do: "press", hit: "row:b2" }, o).state;
    expect(moved.focus).toBe("b2");
    expect(moved.set).toEqual({});
  });

  test("the accent is only on what will be applied, the keyboard's path and the armed main action", () => {
    const s = run(startState(QUEUE), [{ do: "set", choice: "apply" }], o);
    const accented = spansOf(drawScreen(s, o).lines)
      .filter((sp: Span) => sp.role === "accent")
      .map((sp) => sp.text);
    expect(accented.join("|")).toBe(
      "Doc suggestions|● 1|docs/agent-hub.md|●|Unittest suite needs a short |TMPDIR| and markdown-|…|Draft prompt",
    );
  });

  test("the caption tallies in the rows' own glyphs", () => {
    const s = run(
      startState(QUEUE),
      [
        { do: "set", choice: "apply" },
        { do: "set", choice: "dismiss" },
      ],
      o,
    );
    expect(texts(s, o)[0]).toContain("● 1 · – 1 · 3 left");
  });

  test("more-rows say suggestions and docs alike at both ends", () => {
    const o = at(64, 24);
    const s = run(startState(MANY), down(16), o);
    const drawn = drawScreen(s, o);
    const more = textOf(drawn.lines[drawn.zones.list![1] - 1]!);
    expect(more).toMatch(/↑ \d+ in \d+ docs?/);
    expect(more).toMatch(/↓ \d+ in \d+ docs?/);
  });
});

describe("the room", () => {
  test("the focused suggestion takes what it needs, nine rows at most, the queue the rest", () => {
    const o = at(64, 45);
    const drawn = drawScreen(run(startState(MANY), down(9), o), o);
    const [from, to] = drawn.zones.list!;
    const zone = drawn.lines.slice(to + 1, -3).map(textOf);
    expect(zone.filter((l) => l.trim()).length).toBeLessThanOrEqual(9);
    // The queue's window is full: no blank row above its more-row.
    expect(drawn.lines.slice(from, to - 1).every((l) => textOf(l).trim())).toBe(true);
  });

  test("a short screen has no blank row under the caption, no meta line, and keeps the rule", () => {
    const o = at(45, 12);
    const lines = texts(startState(QUEUE), o);
    expect(lines[1]).toMatch(/^│/);
    expect(lines.some((l) => l.includes("seen 2×"))).toBe(false);
    expect(lines.some((l) => /Evidence · .*Read \[e\]/.test(l))).toBe(true);
  });

  test("Claude Code's six-row pane: rows carry their doc, no bottom rule", () => {
    const o = at(66, 4);
    const lines = texts(startState(QUEUE), o);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^─ Doc suggestions/);
    expect(lines[1]).toContain("❯ ○ docs/agent-hub.md › Unittest");
    expect(lines[2]).toContain("docs/agent-hub.md › Socket");
    expect(lines[3]).toContain("Apply [a]");
  });

  test("the reader in four rows: where it is and Back, then text", () => {
    const o = at(66, 4);
    const lines = texts(run(startState(QUEUE), [{ do: "reader" }], o), o);
    expect(lines[1]).toMatch(/○ docs\/agent-hub\.md · wrong · seen 2× .*Back \[esc\]$/);
    expect(lines[2]).toContain("Unittest suite");
  });
});

describe("the reader", () => {
  const o = at(64, 45);

  test("its first row is the state, the path, the meta line and Back", () => {
    const s = run(
      startState(QUEUE),
      [{ do: "press", hit: "row:b1" }, { do: "reader" }, { do: "set", choice: "apply" }],
      o,
    );
    const row = drawScreen(s, o).lines[2]!;
    expect(textOf(row)).toMatch(
      /^ {3}● docs\/agents\.md · wrong · seen 3× · 2 days ago +Back \[esc\]$/,
    );
    expect(row.spans.find((sp) => sp.text === "docs/agents.md")).toMatchObject({ role: "accent" });
    const dropped = run(s, [{ do: "set", choice: "dismiss" }], o);
    expect(textOf(drawScreen(dropped, o).lines[2]!)).toContain("– docs/agents.md");
  });

  test("Apply and Dismiss set its row and stay on it", () => {
    const s = run(startState(QUEUE), [{ do: "reader" }], o);
    const set = run(s, [{ do: "set", choice: "apply" }], o);
    expect(set.focus).toBe(s.focus);
    expect(set.reader).toBe(0);
    expect(set.set).toEqual({ [s.focus!]: "apply" });
  });

  test("the evidence line counts the pieces and dates them; Next stops at the last, dim", () => {
    const s = run(startState(QUEUE), [{ do: "press", hit: "row:b1" }, { do: "reader" }], o);
    expect(texts(s, o).some((l) => /Evidence 1 of 2 · yesterday .*Next \[n\]/.test(l))).toBe(true);
    const last = run(s, [{ do: "next" }], o);
    const lines = drawScreen(last, o).lines;
    expect(textOf(find(lines, "Evidence 2 of 2")!)).toMatch(/migrated from pi .*Next \[n\]/);
    expect(spansOf(lines).find((sp) => sp.text === "Next")).toMatchObject({ role: "dim" });
    expect(run(last, [{ do: "next" }], o).reader).toBe(1);
    const one = run(startState(QUEUE), [{ do: "reader" }], o);
    expect(texts(one, o).some((l) => /Evidence · \d+ days? ago|Evidence · yesterday/.test(l))).toBe(
      true,
    );
  });

  test("the reason comes first and what it points at is keyed rows", () => {
    const s = run(
      startState(QUEUE),
      [{ do: "press", hit: "row:b1" }, { do: "reader" }, { do: "next" }],
      o,
    );
    const lines = texts(s, o);
    const why = lines.findIndex((l) => l.includes("Why the repo didn't say it"));
    const details = lines.findIndex((l) => l.includes("Details"));
    expect(why).toBeLessThan(details);
    expect(lines.some((l) => /path +modules\/pi\/default\.nix/.test(l))).toBe(true);
  });
});

describe("keys and clicks", () => {
  const o = at(64, 45);
  const key = (s: ScreenState, k: string) => reduce(s, keyIntent(k, s, o)!, o);

  test("a and d set the focused row and move on to the next row left alone; again, they leave it", () => {
    const s = startState(QUEUE);
    const one = key(s, "a").state;
    expect(one.set).toEqual({ a1: "apply" });
    expect(one.focus).toBe("a2");
    const two = key({ ...one, focus: "a1" }, "a").state;
    expect(two.set).toEqual({});
    expect(two.focus).toBe("a1");
  });

  test("A and D set the whole doc in pi; Claude Code's keys have none", () => {
    const s = key(startState(QUEUE), "D").state;
    expect(s.set).toEqual({ a1: "dismiss", a2: "dismiss" });
    expect(s.focus).toBe("b1");
    expect(keyIntent("A", s, { ...o, wholeDoc: false })).toBeUndefined();
  });

  test("Enter carries out what is set, or closes; Escape asks before throwing choices away", () => {
    expect(key(startState(QUEUE), "enter").effect).toBe("close");
    const set = key(startState(QUEUE), "a").state;
    expect(key(set, "enter").effect).toBe("submit");
    const asking = key(set, "escape").state;
    expect(asking.confirming).toBe(true);
    expect(key(asking, "escape").state.confirming).toBe(false);
    expect(key(asking, "x").state.confirming).toBe(false);
    expect(key(asking, "enter").effect).toBe("close");
    expect(key(startState(QUEUE), "escape").effect).toBe("close");
  });

  test("the reader: e opens it, Escape leaves it, j scrolls it", () => {
    const s = key(startState(QUEUE), "e").state;
    expect(s.reader).toBe(0);
    expect(key(s, "escape").state.reader).toBeUndefined();
    expect(key(s, "escape").effect).toBeUndefined();
    expect(key(s, "j").state.focus).toBe(s.focus);
  });

  test("clicks: the focused suggestion and its Read open the reader; Close asks", () => {
    const s = startState(QUEUE);
    expect(reduce(s, { do: "press", hit: "detail" }, o).state.reader).toBe(0);
    expect(reduce(s, { do: "press", hit: "evidence" }, o).state.reader).toBe(0);
    expect(reduce(s, { do: "press", hit: "frame:close" }, o).effect).toBe("close");
    const set = reduce(s, { do: "set", choice: "apply" }, o).state;
    const asking = reduce(set, { do: "press", hit: "frame:close" }, o).state;
    expect(reduce(asking, { do: "press", hit: "frame:keep" }, o).state.confirming).toBe(false);
    expect(reduce(asking, { do: "press", hit: "frame:discard" }, o).effect).toBe("close");
    expect(reduce(asking, { do: "press", hit: "row:b2" }, o).state.focus).toBe(set.focus);
  });

  test("the wheel's zone is the row it is over", () => {
    const { zones } = drawScreen(startState(QUEUE), o);
    expect(zoneAt(zones, zones.list![0])).toBe("list");
    expect(zoneAt(zones, 0)).toBeUndefined();
  });

  test("nothing open: the frame and one dim line", () => {
    const lines = texts(startState([], 4), o);
    expect(lines.some((l) => l.trim() === "No open suggestions · 4 dismissed")).toBe(true);
  });
});
