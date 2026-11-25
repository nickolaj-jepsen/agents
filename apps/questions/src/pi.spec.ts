import { describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
// Exercise the pinned terminal host's real mounting and status cleanup, not a duplicate of it.
import { InteractiveMode } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js";
import { ProgramStatusReporter } from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/program-status-reporter.js";
import questionsPlugin, { askQuestions } from "./pi.ts";
import { QuestionsDialog } from "./pi/dialog.ts";
import type { QuestionsResult } from "./pi/types.ts";

const questions = [
  {
    header: "Storage",
    question: "Where should sessions live?",
    options: [{ label: "SQLite" }, { label: "Postgres" }],
    multiSelect: true,
  },
];
const tui = { requestRender: vi.fn(), terminal: { rows: 32 } } as unknown as TUI;
const theme = {} as Theme;

function host() {
  let status: { state: string; message?: string } | undefined;
  const reporter = new ProgramStatusReporter(
    () =>
      ({
        setProgramStatus: (value: typeof status) => {
          status = value;
        },
      }) as never,
    () => "test session",
  );
  reporter.handleEvent({ type: "agent_start" } as never);
  const terminalHost = Object.assign(Object.create(InteractiveMode.prototype), {
    editor: { getText: () => "Existing prompt draft", setText: vi.fn() },
    editorContainer: { clear: vi.fn(), addChild: vi.fn() },
    ui: { ...tui, setFocus: vi.fn() },
    programStatus: reporter,
    keybindings: {},
    extensionDialogs: [],
    disposeActiveSelector: vi.fn(),
  }) as {
    showExtensionCustom: ExtensionContext["ui"]["custom"];
    extensionDialogs: { component: QuestionsDialog & { dispose(): void } }[];
    editor: { setText: ReturnType<typeof vi.fn> };
    removeExtensionDialog(component: QuestionsDialog): void;
  };
  const ctx = {
    mode: "tui",
    hasUI: true,
    ui: { custom: terminalHost.showExtensionCustom.bind(terminalHost), notify: vi.fn() },
  } as unknown as ExtensionContext;
  return {
    ctx,
    get dialog() {
      return terminalHost.extensionDialogs.at(-1)!.component;
    },
    get blocked() {
      return status?.state === "blocked" ? status : undefined;
    },
    terminalHost,
  };
}

function plugin(failPersistence = false) {
  const entries: { type: "custom"; customType: string; data: unknown }[] = [];
  const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
  let tool: {
    execute: (
      id: string,
      params: { questions: typeof questions },
      signal: AbortSignal,
      update: undefined,
      ctx: ExtensionContext,
    ) => Promise<unknown>;
  };
  const api = {
    on: (name: string, handler: (event: unknown, ctx: ExtensionContext) => void) =>
      handlers.set(name, handler),
    registerTool: (value: typeof tool) => {
      tool = value;
    },
    appendEntry: (customType: string, data: unknown) => {
      if (failPersistence) throw new Error("session is not writable");
      entries.push({ type: "custom", customType, data });
    },
  } as unknown as ExtensionAPI;
  const start = (ctx: ExtensionContext) => {
    Object.assign(ctx, { sessionManager: { getBranch: () => entries } });
    questionsPlugin(api);
    handlers.get("session_start")?.({}, ctx);
  };
  return {
    start,
    handlers,
    entries,
    execute: (ctx: ExtensionContext, signal = new AbortController().signal, asked = questions) =>
      tool.execute("call", { questions: asked }, signal, undefined, ctx),
  };
}

function typeDraft(dialog: QuestionsDialog) {
  dialog.handleInput("a"); // keep a selected option as well as a write-in
  dialog.handleInput("c"); // the write-in is the third choice
  dialog.handleInput("  Keep this draft  ");
}

describe("question attention lifecycle", () => {
  it("publishes the question and clears attention on answer", async () => {
    const h = host();
    const result = askQuestions(h.ctx, questions, undefined);
    await Promise.resolve();
    expect(h.blocked).toMatchObject({ kind: "question", message: questions[0]!.question });
    h.dialog.handleInput("a");
    h.dialog.handleInput("s");
    expect((await result).cancelled).toBe(false);
    expect(h.blocked).toBeUndefined();
  });

  it("clears attention on explicit cancellation, without keeping discarded work", async () => {
    const p = plugin();
    const h = host();
    p.start(h.ctx);
    const result = p.execute(h.ctx);
    await Promise.resolve();
    typeDraft(h.dialog);
    h.dialog.handleInput("\x1b"); // leave the write-in without losing it
    h.dialog.handleInput("\x1b"); // ask to discard the form
    h.dialog.handleInput("\r");
    await result;
    expect(h.blocked).toBeUndefined();
    expect(p.entries.at(-1)?.data).toBeNull();
  });

  it("does not mount or block an already interrupted call", async () => {
    const h = host();
    const controller = new AbortController();
    controller.abort();
    expect(await askQuestions(h.ctx, questions, controller.signal)).toEqual({
      answers: [],
      cancelled: true,
      interrupted: true,
    });
    expect(h.blocked).toBeUndefined();
  });

  it("handles interruption before the host mounts and cleans up only once", async () => {
    const p = plugin();
    const h = host();
    p.start(h.ctx);
    const controller = new AbortController();
    const result = p.execute(h.ctx, controller.signal);
    controller.abort();
    p.handlers.get("session_shutdown")?.({}, h.ctx);
    await result;
    expect(h.blocked).toBeUndefined();
    expect(h.terminalHost.extensionDialogs).toHaveLength(0);
    expect(p.entries).toHaveLength(1);
  });

  it.each(["abort", "reload"])(
    "clears attention and restores unconfirmed work after %s",
    async (reason) => {
      const p = plugin();
      const h = host();
      p.start(h.ctx);
      const controller = new AbortController();
      const result = p.execute(h.ctx, controller.signal);
      await Promise.resolve();
      typeDraft(h.dialog);
      const before = h.dialog.snapshot();
      if (reason === "abort") controller.abort();
      else {
        // The real host disposes and unmounts before emitting shutdown on reload.
        const dialog = h.dialog;
        dialog.dispose();
        h.terminalHost.removeExtensionDialog(dialog);
        p.handlers.get("session_shutdown")?.({ reason: "reload" }, h.ctx);
      }
      // resetExtensionUI intentionally leaves the old inline-dialog promise pending.
      if (reason === "abort") {
        await result;
        expect(h.terminalHost.editor.setText).toHaveBeenLastCalledWith("Existing prompt draft");
      }
      expect(h.blocked).toBeUndefined();
      const next = host();
      p.start(next.ctx);
      const reordered = questions.map(({ header, question, options, multiSelect }) => ({
        multiSelect,
        options,
        question,
        header,
      }));
      const retried = p.execute(next.ctx, undefined, reordered);
      await Promise.resolve();
      expect(next.dialog.snapshot()).toEqual(before);
      expect(next.blocked).toBeDefined();
      p.handlers.get("session_shutdown")?.({}, next.ctx);
      await retried;
      expect(next.blocked).toBeUndefined();
    },
  );
});

describe("question draft state", () => {
  it("keeps an interrupted draft when a different questionnaire completes", async () => {
    const p = plugin();
    const first = host();
    p.start(first.ctx);
    const controller = new AbortController();
    const interrupted = p.execute(first.ctx, controller.signal);
    await Promise.resolve();
    typeDraft(first.dialog);
    const saved = first.dialog.snapshot();
    controller.abort();
    await interrupted;
    const other = host();
    const done = p.execute(other.ctx, undefined, [
      { ...questions[0]!, question: "A different question?" },
    ]);
    await Promise.resolve();
    other.dialog.handleInput("a");
    other.dialog.handleInput("s");
    await done;
    const restored = host();
    p.start(restored.ctx);
    const retried = p.execute(restored.ctx);
    await Promise.resolve();
    expect(restored.dialog.snapshot()).toEqual(saved);
    p.handlers.get("session_shutdown")?.({}, restored.ctx);
    await retried;
  });

  it.each(["answer", "abort"])("still clears attention on %s when saving fails", async (action) => {
    const p = plugin(true);
    const h = host();
    p.start(h.ctx);
    const controller = new AbortController();
    const result = p.execute(h.ctx, controller.signal);
    await Promise.resolve();
    if (action === "abort") controller.abort();
    else {
      h.dialog.handleInput("a");
      h.dialog.handleInput("s");
    }
    await result;
    expect(h.blocked).toBeUndefined();
    expect(h.ctx.ui.notify).toHaveBeenCalledWith(
      "Could not save the question draft to this session.",
      "warning",
    );
  });

  it("ignores incompatible snapshots and bounds restored row and option indices", () => {
    expect(
      () => new QuestionsDialog(tui, theme, questions, vi.fn(), [], { drafts: [] } as never),
    ).not.toThrow();
    const saved = { drafts: [{ picked: [99], text: "" }], notes: [""], tab: 99, row: 99 };
    const dialog = new QuestionsDialog(tui, theme, questions, vi.fn(), [], saved);
    expect(dialog.snapshot()).toMatchObject({ drafts: [{ picked: [] }], tab: 0, row: 3 });
  });
  it("retains selections and unconfirmed notes across focus changes and resize", () => {
    const dialog = new QuestionsDialog(tui, theme, questions, vi.fn());
    dialog.handleInput("a");
    dialog.handleInput("n");
    dialog.handleInput("  still editing  ");
    const before = dialog.snapshot();
    dialog.focused = false;
    dialog.invalidate();
    dialog.focused = true;
    expect(dialog.snapshot()).toEqual(before);
    const restored = new QuestionsDialog(tui, theme, questions, vi.fn(), [], before);
    expect(restored.snapshot()).toEqual(before);
    restored.handleInput("continued");
    expect(restored.snapshot().notes).toEqual(["  still editing  continued"]);
    expect(before.notes).toEqual(["  still editing  "]);
    expect(before.drafts[0]?.picked).toEqual([0]);
  });

  it("saves the raw write-in rather than turning a typed option label into a selection", () => {
    const done = vi.fn<(result: QuestionsResult) => void>();
    const dialog = new QuestionsDialog(tui, theme, questions, done);
    dialog.handleInput("c");
    dialog.handleInput("SQLite");
    const saved = dialog.snapshot();
    expect(saved.drafts[0]).toEqual({ picked: [], text: "SQLite" });
    expect(new QuestionsDialog(tui, theme, questions, done, [], saved).snapshot()).toEqual(saved);
  });
});
