import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { type Held, view } from "./lib/forms.ts";
import answer from "./pi.ts";
import type { Round } from "./pi/transcript.ts";

/** The turns the scenarios replay: two questions with lettered answers. */
const fixture = (name: string) =>
  readFileSync(new URL(`./e2e/fixtures/${name}.md`, import.meta.url), "utf8").trimEnd();
const TWO_Q = fixture("two-q");
const ONE_Q = fixture("single");

/** The kit's painter reads these; a plain theme keeps every assertion on the words. */
const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
  underline: (text: string) => text,
  inverse: (text: string) => text,
} as unknown as Theme;

const ENTRY = "answer-form";
const CARD = "answer-round";

type Entry = { type: "custom"; customType: string; data: unknown };
type Screen = {
  render(width: number): string[];
  handleInput?(data: string): void;
  typed?: { form: string; kind: string; step: number; text: string };
};
type HostHandler = (event: never, ctx: ExtensionContext) => unknown;
type CommandHandler = (args: string, ctx: ExtensionContext) => unknown;
type Renderer = (entry: unknown, options: unknown, theme: Theme) => unknown;
type SavedState = {
  held: Round | null;
  aside?: Round | null;
  archived?: Round;
  typing?: unknown;
};

/** A pi session in a box: the entries it has written, and the one widget it draws. */
function host(branch: Entry[] = []) {
  const entries = branch;
  const handlers = new Map<string, HostHandler>();
  const commands = new Map<string, CommandHandler>();
  const renderers = new Map<string, Renderer>();
  const cards = new Map<string, Screen>();
  const sent: string[] = [];
  let notice = "";
  let editor = "";
  let widget: Screen | undefined;
  let focus: unknown;

  const screen = () => {
    const made = {
      children: [{}],
      terminal: { rows: 40, columns: 100 },
      requestRender() {},
      renderNow() {},
      setFocus(next: { focused?: boolean } | null) {
        if (focus && typeof focus === "object" && "focused" in focus)
          (focus as { focused?: boolean }).focused = false;
        focus = next;
        if (next && typeof next === "object" && "focused" in next) next.focused = true;
      },
      getFocusedComponent: () => focus ?? null,
    };
    return made as unknown as TUI & { children: unknown[] };
  };
  let tui = screen();

  const ctx = {
    mode: "tui",
    hasUI: true,
    model: { provider: "test", id: "test" },
    isIdle: () => true,
    ui: {
      setWidget: (_key: string, content: unknown) => {
        // pi mounts the widget's factory on the TUI of its renderer, every time it redraws.
        tui = screen();
        widget =
          typeof content === "function"
            ? ((content as (surface: TUI, theme: Theme) => Screen)(tui, theme) as Screen)
            : undefined;
      },
      notify: (text: string) => {
        notice = text;
      },
      getEditorText: () => editor,
      setEditorText: (text: string) => {
        editor = text;
      },
    },
    sessionManager: {
      getBranch: () => entries,
      buildContextEntries: () => entries,
    },
  } as unknown as ExtensionContext;

  const api = {
    on: (name: string, handler: HostHandler) => handlers.set(name, handler),
    appendEntry: (customType: string, data: unknown) =>
      entries.push({ type: "custom", customType, data }),
    registerEntryRenderer: (customType: string, renderer: Renderer) =>
      renderers.set(customType, renderer),
    registerShortcut: (_key: string, { handler }: { handler: CommandHandler }) =>
      commands.set("alt+a", handler),
    registerCommand: (name: string, { handler }: { handler: CommandHandler }) =>
      commands.set(name, handler),
    sendUserMessage: (text: string) => sent.push(text),
  } as unknown as ExtensionAPI;

  answer(api);

  const emit = async (name: string, event: unknown = {}) =>
    await handlers.get(name)?.(event as never, ctx);

  /** pi makes a card's component when the entry is drawn; the guide needs it to scroll there. */
  const drawCards = () => {
    for (const entry of entries) {
      if (entry.customType !== CARD || typeof entry.data !== "string") continue;
      if (cards.has(entry.data)) continue;
      const made = renderers.get(CARD)?.(entry, {}, theme) as Screen | undefined;
      if (made) cards.set(entry.data, made);
    }
  };

  /** The state the session last wrote, or nothing before it wrote any. */
  const lastSaved = () => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry?.customType !== ENTRY) continue;
      return entry.data as SavedState;
    }
    return undefined;
  };

  return {
    entries,
    ctx,
    commands,
    lastSaved,
    sent,
    drawCards,
    /** What the widget holds open, if it is the guide with a field. */
    get typed() {
      return widget?.typed;
    },
    get widget() {
      return widget;
    },
    get notice() {
      return notice;
    },
    get editor() {
      return editor;
    },
    setEditor: (text: string) => {
      editor = text;
    },
    keys: (data: string) => widget?.handleInput?.(data),
    open: async () => {
      await commands.get("answer")?.("", ctx);
      await Promise.resolve();
    },
    start: async () => {
      await emit("session_start", { type: "session_start", reason: "startup" });
      drawCards();
    },
    /** The end of a turn whose last word is `text`. */
    turn: async (text: string) => {
      await emit("agent_end", {
        messages: [{ role: "assistant", content: [{ type: "text", text }] }],
      });
      await emit("agent_settled", { aborted: false });
      drawCards();
    },
    /** A prompt the host took as input, then accepted as a user message. */
    submit: async (text: string, source = "interactive") => {
      await emit("input", { text, source });
      await emit("message_start", { message: { role: "user", content: text } });
    },
    /** A prompt the host took as input, then refused: its model or auth check threw instead. */
    refuse: async (text: string, source = "interactive") => {
      await emit("input", { text, source });
    },
    /** A renderer switch, which remounts the widgets on a new TUI without calling their factories. */
    remount: () => {
      tui.children.length = 0;
    },
    shutdown: async (reason = "reload") => await emit("session_shutdown", { reason }),
  };
}

const answered = (round: Held | null | undefined) => (round ? view(round.form, round.draft) : null);
/** What one step of a round says, whichever step the draft was left on. */
const stepOf = (round: Round | null | undefined, step: number) =>
  round ? view(round.form, { ...round.draft, step }).item : null;

async function twoQuestions(h = host()) {
  await h.start();
  await h.turn(TWO_Q);
  return h;
}

describe("a draft left in a card's field", () => {
  it("comes back when the widget is remounted, and saves what was typed", async () => {
    const h = await twoQuestions();
    h.keys("c"); // the write-in under Q1
    for (const key of "DuckDB") h.keys(key);
    expect(h.typed).toMatchObject({ kind: "write", step: 0, text: "DuckDB" });

    h.remount();
    await h.open();
    expect(h.typed).toMatchObject({ kind: "write", step: 0, text: "DuckDB" });
    expect(h.widget?.render(100).join("\n")).toContain("Save");

    h.keys("\r");
    expect(h.typed).toBeUndefined();
    expect(stepOf(h.lastSaved()?.held, 0)?.written).toBe("DuckDB");
    expect(h.lastSaved()?.typing).toBeNull();
  });

  it("keeps a note's draft through a remount", async () => {
    const h = await twoQuestions();
    h.keys("n"); // the note under Q1
    for (const key of "keep") h.keys(key);
    expect(h.typed).toMatchObject({ kind: "note", step: 0, text: "keep" });

    h.remount();
    await h.open();
    expect(h.typed).toMatchObject({ kind: "note", step: 0, text: "keep" });
  });

  it("is written to the session on reload, and comes back with it", async () => {
    const h = await twoQuestions();
    h.keys("c");
    for (const key of "DuckDB") h.keys(key);
    await h.shutdown();

    // A reload loads the extension anew: only what the session kept is there to restore.
    const reloaded = host(h.entries);
    await reloaded.start();
    expect(reloaded.typed).toMatchObject({ kind: "write", step: 0, text: "DuckDB" });
    // The field is not the prompt's: the guide offers its keys rather than promising them.
    expect(reloaded.widget?.render(100).join("\n")).toContain("Resume editing");
  });

  it("keeps a deliberately emptied field empty after reload", async () => {
    const h = await twoQuestions();
    h.keys("n");
    for (const key of "old note") h.keys(key);
    h.keys("\r");
    h.keys("n");
    h.keys("\x01");
    h.keys("\x0b");
    expect(h.typed?.text).toBe("");
    await h.shutdown();
    const reloaded = host(h.entries);
    await reloaded.start();
    expect(reloaded.typed?.text).toBe("");
  });

  it("never hands a replaced round's field to the round that replaced it", async () => {
    const h = await twoQuestions();
    h.keys("c");
    for (const key of "Duck") h.keys(key);
    const first = h.lastSaved()?.held?.anchor;

    // A background turn ends on another round while the field is open.
    await h.turn(ONE_Q);
    expect(h.typed).toBeUndefined();
    const saved = h.lastSaved();
    expect(saved?.held?.anchor).not.toBe(first);
    expect(stepOf(saved?.held, 0)?.written).toBe("");
    // The text went to the round it was typed into, which the new round archived.
    expect(stepOf(saved?.archived, 0)?.written).toBe("Duck");
  });
});

describe("a submit the host refuses", () => {
  it("does not let a later background input dismiss a refused round", async () => {
    const h = await twoQuestions();
    h.keys("b");
    await h.refuse("a prompt with no authentication");
    await h.submit("background news", "extension");
    expect(answered(h.lastSaved()?.held)?.answered).toBe(1);
    expect(h.lastSaved()?.aside).toBeNull();
  });

  it("handles a new user prompt after a direct send was refused", async () => {
    const h = await twoQuestions();
    h.keys("b");
    h.keys("r");
    h.keys("s"); // fake host sends nothing: preflight refused it
    await h.submit("a different prompt");
    expect(h.lastSaved()?.held).toBeNull();
    expect(answered(h.lastSaved()?.aside)?.answered).toBe(1);
  });

  it("sets aside an unconfirmed write-in even without any committed answers", async () => {
    const h = await twoQuestions();
    h.keys("c");
    for (const key of "DuckDB") h.keys(key);
    await h.submit("first, do something else");
    expect(stepOf(h.lastSaved()?.aside, 0)?.written).toBe("DuckDB");
    await h.open();
    expect(stepOf(h.lastSaved()?.held, 0)?.written).toBe("DuckDB");
  });
  it("keeps the answers and the round open until a user message exists", async () => {
    const h = await twoQuestions();
    h.keys("b"); // Q1: B
    expect(answered(h.lastSaved()?.held)?.answered).toBe(1);

    // pi runs its model and auth checks after `input`; failing them leaves no user message.
    await h.refuse("what now?");
    expect(h.lastSaved()?.held).not.toBeNull();
    expect(h.lastSaved()?.aside).toBeNull();
    expect(answered(h.lastSaved()?.held)?.answered).toBe(1);
    expect(typeof h.widget?.handleInput).toBe("function");

    // The same text as a real user message sets the round aside with its answers.
    await h.submit("what now?");
    expect(h.lastSaved()?.held).toBeNull();
    expect(answered(h.lastSaved()?.aside)?.answered).toBe(1);
    expect(h.notice).toContain("1 answer set aside");

    // /answer brings them back.
    await h.open();
    expect(answered(h.lastSaved()?.held)?.answered).toBe(1);
  });

  it("recognises the reply an earlier fill left in the prompt", async () => {
    const h = await twoQuestions();
    h.keys("b"); // Q1: B
    h.keys("r"); // the review, where Fill lives
    h.setEditor("");
    h.keys("f");
    expect(h.editor).toBe("Q1: B");

    // Q2 is answered after the fill, so the round's reply is no longer the text in the prompt.
    h.keys("k");
    h.keys("a"); // Q2: A
    expect(answered(h.lastSaved()?.held)?.reply).toBe("Q1: B\nQ2: A");

    await h.submit("Q1: B");
    const saved = h.lastSaved();
    expect(saved?.held).toBeNull();
    expect(saved?.aside).toBeNull();
    expect(saved?.archived?.sent).toBe(true);
    // The round as it was answered when the reply was written, not as it is now.
    expect(answered(saved?.archived)?.answered).toBe(1);
  });
});

describe("filling the prompt again", () => {
  it("keeps the draft exactly, whitespace and all", async () => {
    const h = await twoQuestions();
    h.keys("b"); // Q1: B
    h.keys("r");
    h.setEditor("  keep my spaces  \n");

    h.keys("f");
    const once = h.editor;
    expect(once).toBe("Q1: B\n\n  keep my spaces  \n");

    h.keys("f");
    expect(h.editor).toBe(once);
  });

  it("writes the reply into the prompt above a draft that is only whitespace", async () => {
    const h = await twoQuestions();
    h.keys("b");
    h.keys("r");
    h.setEditor("  ");

    h.keys("f");
    expect(h.editor).toBe("Q1: B\n\n  ");
    h.keys("f");
    expect(h.editor).toBe("Q1: B\n\n  ");
  });

  it("sends nothing without a model, and keeps the answers", async () => {
    const h = await twoQuestions();
    h.keys("b");
    (h.ctx as unknown as { model: undefined }).model = undefined;

    h.keys("r");
    h.keys("s");
    expect(h.sent).toEqual([]);
    expect(answered(h.lastSaved()?.held)?.answered).toBe(1);
    expect(h.notice).toContain("still here");
  });
});

describe("the round's own reply", () => {
  it("is sent when the answer sheet says so", async () => {
    const h = await twoQuestions();
    h.keys("b"); // Q1: B
    h.keys("j");
    h.keys("a"); // Q2: A
    h.keys("r");
    h.keys("s");
    expect(h.sent).toEqual(["Q1: B\nQ2: A"]);
    expect(answered(h.lastSaved()?.held)?.answered).toBe(2);
  });
});
