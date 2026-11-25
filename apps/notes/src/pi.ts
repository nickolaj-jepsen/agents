/**
 * The pi half of notes: the link from the session's checkout to its repository's store, the
 * section that tells the agent where its files go, /notes, and the widget above the prompt for
 * notes a run wrote. What the link, the walk and a hand-off do is the lib's (`lib/gather.ts`), the
 * steps Claude Code's mod runs too, over node's processes and files.
 *
 * pi pins a session's folder, and `apps/worktree` moves a session by starting a new one in the
 * other checkout: `session_start` is where each checkout is linked.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { clean } from "./lib/clean.ts";
import {
  createLinks,
  ensureAt,
  handNote,
  linkNotice,
  loadGroups,
  noticeText,
  placeOf,
  readBody,
} from "./lib/gather.ts";
import { BAND, bandOf, readingState, startState, type Band } from "./lib/screen.ts";
import { notesOf } from "./lib/shelf.ts";
import { CONTEXT, hasStore, isShared, storeRoot, type Ensured } from "./lib/store.ts";
import { beginTurn, duringTurns, endTurn, startTurns, type Turns } from "./lib/turns.ts";
import { NotesBand } from "./pi/band.ts";
import { nodeHost } from "./pi/host.ts";
import { NotesPanel, sidebarOptions } from "./pi/panel.ts";

/** The system prompt's section that tells the agent where its files go. */
const SECTION = "agents_store";
const WIDGET = "notes";

export default function notes(pi: ExtensionAPI) {
  const host = nodeHost();
  /** The session's start, then when the person last looked: notes written after it are news. */
  let since = Date.now();
  /** The session's turns: the store is shared by every worktree, so only notes written in these are news. */
  let turns: Turns = startTurns(since);
  /** The links of the folders the session ran in; one that failed or was busy is left alone for a while. */
  const links = createLinks();
  /** What the widget says, while there is news. */
  let band: Band | undefined;
  let widget: TUI | undefined;
  /** The sidebar, while it is open. */
  let isOpen = false;
  /** `<state>` of each notice told this session. */
  const told = new Set<string>();

  /** Links the session's checkout to its store and says once what a link not simply there means. */
  async function link(ctx: ExtensionContext, fresh = false): Promise<Ensured> {
    const ensured = await links.get(ctx.cwd, {
      fresh,
      clock: Date.now,
      ensure: (cwd) => ensureAt(host, cwd, storeRoot(process.env)),
    });
    const text = noticeText(ensured);
    if (text && ctx.hasUI && !told.has(ensured.state)) {
      told.add(ensured.state);
      ctx.ui.notify(`notes: ${text}`, "warning");
    }
    return ensured;
  }

  const redraw = () => widget?.requestRender();

  /** The person has looked: notes written so far are no news. */
  const looked = () => {
    since = Date.now();
    band = undefined;
    redraw();
  };

  /** Opens the sidebar on the list, or with `id` on the reader for that note. */
  async function show(ctx: ExtensionContext, id?: string) {
    looked();
    // The person asks: a link that was left alone after a failure is asked about now.
    const ensured = await link(ctx, true);
    const groups = await loadGroups(host, ensured);
    const notice = linkNotice(ensured);
    if (!ctx.hasUI || ctx.mode !== "tui") {
      const list = notesOf(groups).map((n) => clean(n.file));
      ctx.ui.notify(
        [notice, list.length ? list.join("\n") : "No notes in this repository's store."]
          .filter(Boolean)
          .join("\n"),
        "info",
      );
      return;
    }
    if (isOpen) return;
    const listed = startState(groups, placeOf(ensured), notice);
    const note = id ? notesOf(groups).find((n) => n.id === id) : undefined;
    // An HTML note is read in the browser, as Enter on its row does.
    if (note?.kind === "html") {
      const handed = await handNote(host, note, "browser");
      if ("problem" in handed) ctx.ui.notify(handed.problem, "warning");
      else ctx.ui.notify(`Opened ${note.name} in ${handed.app}`, "info");
      return;
    }
    let columns = () => process.stdout.columns || 80;
    isOpen = true;
    try {
      await ctx.ui.custom<void>(
        (tui, theme, _keybindings, done) => {
          columns = () => tui.terminal.columns;
          const panel = new NotesPanel(
            tui,
            theme,
            {
              read: (n) => readBody(host, n),
              hand: (n, way) => handNote(host, n, way),
              opened: (n, app) => ctx.ui.notify(`Opened ${n.name} in ${app}`, "info"),
            },
            note ? readingState(listed, note.id) : listed,
            () => done(undefined),
          );
          if (note)
            void readBody(host, note).then((body) =>
              panel.act({ do: "loaded", id: note.id, body }),
            );
          return panel;
        },
        // A sidebar on the right, down to the editor, which stays in view.
        { overlay: true, overlayOptions: sidebarOptions(() => columns()) },
      );
    } finally {
      isOpen = false;
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    since = Date.now();
    turns = startTurns(since);
    band = undefined;
    told.clear();
    await link(ctx).catch(() => undefined);
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget(WIDGET, (tui, theme) => {
      widget = tui;
      return new NotesBand(
        theme,
        () => (isOpen ? undefined : band),
        (hit) => {
          if (hit === BAND.dismiss) return looked();
          if (hit !== BAND.read || !band) return;
          const newest = band.newest;
          void show(ctx, newest);
        },
      );
    });
  });

  // Where the agent's files go, as a section of the system prompt: pi sends a section again only
  // when it changes, so the agent reads it once.
  pi.on("before_agent_start", async (event, ctx) => {
    // A run starts here: its notes are the session's.
    turns = beginTurn(turns, Date.now());
    // A link another session held, or that failed, is asked about again after a while.
    const ensured = await link(ctx).catch(() => undefined);
    const sections = event.systemPromptOptions.sections;
    // Only the shared store: a tracked folder is the repository's own, and git keeps it.
    if (ensured && isShared(ensured)) sections[SECTION] = CONTEXT;
    else delete sections[SECTION];
  });

  // After a run the store is walked again: notes written since the person last looked show above
  // the prompt.
  pi.on("agent_settled", async (_event, ctx) => {
    turns = endTurn(turns, Date.now(), since);
    const ensured = await link(ctx).catch(() => undefined);
    if (ctx.mode !== "tui" || !ensured || !hasStore(ensured)) return;
    const groups = await loadGroups(host, ensured).catch(() => undefined);
    if (!groups) return;
    band = bandOf(groups, since, (at) => duringTurns(turns, at));
    redraw();
  });

  pi.registerCommand("notes", {
    description: "List and read the notes in this repository's store",
    handler: async (_args, ctx) => show(ctx),
  });
}
