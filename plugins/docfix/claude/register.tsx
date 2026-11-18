/**
 * The Claude Code half of docfix: the tool, the /docfix pane, the status-line count and the read
 * reminder. What a call does to the queue is the core's (`../core/docfix.ts`), the one pi's half
 * runs.
 *
 * While any are open, a band above the prompt counts them; a click on it opens the pane.
 *
 * In the pane each suggestion is set to apply, dismiss or neither (skip), and closing the pane
 * carries that out: the dismissed ones are kept as dismissed, and the applied ones are drafted as
 * one prompt in the person's prompt box, never sent. A row starts folded, its claim cut at a few
 * lines; opening it shows the claim whole and its evidence.
 */
import { atom, read, update } from "claude-code";
import type { EngineInterface, Register, ToolCallResult } from "claude-code";
import {
  applyPrompt,
  byTarget,
  choiceSummary,
  dismiss,
  docTargets,
  fileName,
  INPUT_SCHEMA,
  normalizeTarget,
  openQueue,
  parse,
  plan,
  readReminder,
  readsInCommand,
  repeats,
  seen,
  serialize,
  STORE_DIR,
  toggleChoice,
  TOOL_DESCRIPTION,
  TOOL_NAME,
  type Choice,
  type Input,
  type Suggestion,
} from "../core/docfix";
import type { Said } from "./types.d.ts";
import { evidence } from "./evidence";
import {
  actionBar,
  capped,
  card,
  emptyState,
  kitOf,
  notice,
  pane,
  paneOptions,
  paneTitle,
  rowsOf,
  section,
  stack,
  statusBand,
  tokens,
  type ChoiceOption,
  type Kit,
} from "./ui";

const PANE = "docfix";

// Change the tag when a suggestion's fields change: it declines what an earlier version stored.
const queue = atom({ plugin: "docfix", key: "queue" } as const, [] as Suggestion[], {
  shape: "queue-1",
});
const choices = atom({ plugin: "docfix", key: "choices" } as const, {} as Record<string, Choice>, {
  shape: "choices-1",
});
const focused = atom({ plugin: "docfix", key: "focused" } as const, null as string | null);
const expanded = atom({ plugin: "docfix", key: "expanded" } as const, [] as string[], {
  shape: "expanded-3",
});
/** Whether the rest of a long queue is shown: a graphical surface lists the first few. */
const showAll = atom({ plugin: "docfix", key: "showAll" } as const, false);
/** Whether the pane is up: the band above the prompt steps aside while it is. */
const paneShown = atom({ plugin: "docfix", key: "paneShown" } as const, false);
const said = atom(
  { plugin: "docfix", key: "notice" } as const,
  { text: "", status: "warning" } as Said,
  { shape: "notice-4" },
);

const say = ($: EngineInterface, text: string, status: Said["status"] = "warning") =>
  update($, said, () => ({ text, status }));

type Place = { root: string; dir: string };

async function rootOf($: EngineInterface, cwd: string) {
  const top = await $.process
    .run(["git", "rev-parse", "--show-toplevel"], { cwd })
    .catch(() => null);
  return top?.exitCode === 0 ? top.stdout.trim() : "";
}

async function place($: EngineInterface): Promise<Place | string> {
  const root = await rootOf($, await $.session.cwd());
  if (!root) return "not inside a git repository, so there are no repo docs to file against";
  const store = `${root}/.agents/store`;
  if (!(await $.fs.exists(store))) {
    await $.process.run(["agent-notes", "root", "--ensure", "--path", root]).catch(() => null);
    if (!(await $.fs.exists(store)))
      return "this checkout has no note store (.agents/store); run `agent-notes root --ensure`";
  }
  return { root, dir: `${store}/${STORE_DIR}` };
}

/** `<session>\0<doc>` for each doc a session was reminded of, so each gets one reminder. */
const reminded = new Set<string>();

/**
 * The reminder for docs this session hasn't read yet, or undefined; only in a checkout with a
 * store, since without one there is nowhere to file.
 */
async function reminderFor($: EngineInterface, paths: readonly string[]) {
  if (paths.length === 0) return undefined;
  const cwd = await $.session.cwd();
  const root = await rootOf($, cwd);
  if (!root || !(await $.fs.exists(`${root}/.agents/store`))) return undefined;
  const session = await $.session.id();
  const fresh = docTargets(paths, cwd, root).filter((t) => !reminded.has(`${session}\0${t}`));
  const tracked: string[] = [];
  for (const target of fresh) {
    const ls = await $.process.run(["git", "ls-files", "--error-unmatch", "--", target], {
      cwd: root,
    });
    if (ls.exitCode === 0) tracked.push(target);
  }
  for (const target of tracked) reminded.add(`${session}\0${target}`);
  return tracked.length > 0 ? readReminder(tracked) : undefined;
}

/** `done` with the reminder after it, when the call read a doc for the first time. */
async function withReminder<T extends ToolCallResult>(
  $: EngineInterface,
  done: T,
  paths: readonly string[],
): Promise<T> {
  if (done.deny !== undefined || done.isError) return done;
  const text = await reminderFor($, paths).catch(() => undefined);
  return text ? { ...done, context: [...(done.context ?? []), text] } : done;
}

async function loadAll($: EngineInterface, dir: string): Promise<Suggestion[]> {
  const entries = await $.fs.list(dir).catch(() => []);
  const loaded = await Promise.all(
    entries
      .filter((entry) => entry.kind === "file" && entry.name.endsWith(".md"))
      .map(async (entry) => parse(await $.fs.read(`${dir}/${entry.name}`).catch(() => ""))),
  );
  return loaded.filter((s): s is Suggestion => s !== null);
}

const save = ($: EngineInterface, dir: string, s: Suggestion) =>
  $.fs.write(`${dir}/${fileName(s.id)}`, serialize(s));

const removeFile = ($: EngineInterface, dir: string, s: Suggestion) =>
  $.process.run(["rm", "-f", "--", `${dir}/${fileName(s.id)}`]);

async function refresh($: EngineInterface, where?: Place | string) {
  const at = where ?? (await place($));
  const all = typeof at === "string" ? [] : await loadAll($, at.dir);
  const open = openQueue(all);
  await update($, queue, () => open);
  return open;
}

/** The width a pane is asked to open at, docked or inline; the surface caps it. */
const WANTED_COLUMNS = 80;

/**
 * Rows the pane takes with every row folded, a guess at `WANTED_COLUMNS`: what it asks an inline
 * pane to open at, so a short queue is not a box of a few rows to scroll.
 */
function wantedRows(list: readonly Suggestion[]) {
  const text = WANTED_COLUMNS;
  const body = byTarget(list).reduce(
    (n, [, rows]) =>
      n + 3 + rows.reduce((m, s) => m + Math.min(tokens.foldedLines, rowsOf(s.claim, text)) + 2, 0),
    0,
  );
  // The title, the line under it, the submit key, and the blank rows between them.
  return 6 + body;
}

async function openPane($: EngineInterface) {
  await say($, "");
  const list = await refresh($);
  await update($, choices, () => ({}));
  await update($, expanded, () => []);
  await update($, showAll, () => false);
  // The band steps aside first, so the pane is placed against the layout it will keep.
  await update($, paneShown, () => true);
  const opened = await $.ui.open(
    paneOptions({
      id: PANE,
      title: "Doc suggestions",
      focus: true,
      closeOnEscape: true,
      rows: wantedRows(list),
      columns: WANTED_COLUMNS,
    }),
  );
  if (opened.isPlaced) return;
  await update($, paneShown, () => false);
  $.ui.toast(`The doc suggestions pane can't show yet: ${opened.reason}`);
}

/**
 * Carries out what the rows are set to, as the pane closes: dismisses the dismissed ones and
 * drafts one prompt for the applied ones in the person's prompt box, after what they typed.
 * False when the draft could not be placed: the pane then stays open, its apply rows still set.
 */
async function settle($: EngineInterface): Promise<boolean> {
  const list = await read($, queue);
  const set = await read($, choices);
  const applied = list.filter((s) => set[s.id] === "apply");
  const dismissed = list.filter((s) => set[s.id] === "dismiss");
  if (dismissed.length > 0) {
    const where = await place($);
    if (typeof where === "string") {
      await say($, where, "error");
      return false;
    }
    const now = new Date(await $.clock.now()).toISOString();
    for (const s of dismissed) await save($, where.dir, dismiss(s, now));
    await update($, choices, (cur) =>
      toggleChoice(
        cur,
        dismissed.map((s) => s.id),
        undefined,
      ),
    );
    await refresh($, where);
  }
  if (applied.length > 0) {
    const text = applyPrompt(applied);
    const draft = await $.prompt.read();
    const filled = await $.prompt.fill(
      draft.text.trim() ? { text: `\n\n${text}`, mode: "append" } : { text },
    );
    if (!filled.isFilled) {
      await say(
        $,
        `${dismissed.length > 0 ? `Dismissed ${dismissed.length}. ` : ""}The prompt box can't take the apply draft right now: close again to retry, or set those rows back to skip.`,
        "error",
      );
      return false;
    }
  }
  await update($, choices, () => ({}));
  const done = [
    dismissed.length > 0 ? `Dismissed ${dismissed.length}.` : "",
    applied.length > 0 ? "The apply prompt is in the prompt box: read it, then Enter to send." : "",
  ].filter(Boolean);
  if (done.length > 0) $.ui.toast(done.join(" "));
  return true;
}

// ---- what the focus ring stops on

/**
 * The element keys the pane draws. The ring stops only on a row's claim, a doc's header and the
 * submit key; the rest (a row's evidence key, its apply and dismiss, the header's keys) are for
 * the mouse, and the keyboard reaches them by their hotkeys.
 */
const rowKey = (id: string) => `row:${id}`;
const groupKey = (target: string) => `grp:${target}`;
const evidenceKey = (id: string) => `ev:${id}`;
const chipKey = (choice: Choice | "skip", owner: string) => `${choice}:${owner}`;
const SUBMIT = "submit";

/** The stops in the order the pane draws them. */
const stopsOf = (list: readonly Suggestion[]) => [
  ...byTarget(list).flatMap(([target, rows]) => [
    groupKey(target),
    ...rows.map((s) => rowKey(s.id)),
  ]),
  SUBMIT,
];

/** The stop an element belongs to: a chip to its row or header, an evidence line to its row. */
function ownerOf(element: string): string | undefined {
  const [kind, ...rest] = element.split(":");
  const id = rest.join(":");
  if (kind === "row" || kind === "grp" || element === SUBMIT) return element;
  if (kind === "ev") return rowKey(id);
  if (kind === "apply" || kind === "dismiss" || kind === "skip") return id;
  return undefined;
}

/**
 * Where a move of the ring onto `element` should land instead, or undefined to let it be: past
 * a row's or header's extras, on to the next stop going down and back to their owner going up.
 */
function landing(stops: readonly string[], from: string | null, element: string) {
  const owner = ownerOf(element);
  if (owner === element) return undefined;
  if (owner === undefined) return undefined;
  const at = stops.indexOf(owner);
  if (at < 0) return undefined;
  const was = from === null ? -1 : stops.indexOf(ownerOf(from) ?? "");
  return was <= at && was >= 0 ? (stops[at + 1] ?? owner) : owner;
}

// ---- the pane

const DAY = 86_400_000;
/** `5m`, `3h`, `40d`: how long ago, in at most four cells. */
const age = (iso: string, now: number) => {
  const ms = Math.max(0, now - Date.parse(iso));
  if (Number.isNaN(ms)) return "";
  if (ms >= DAY) return `${Math.floor(ms / DAY)}d`;
  if (ms >= 3_600_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 60_000)}m`;
};

type Rows = {
  now: number;
  set: Readonly<Record<string, Choice>>;
  open: ReadonlySet<string>;
  /** The stop whose keys carry the hotkeys: the ring's, or the first row before it lands. */
  keyed: string | undefined;
  /** The row that takes the ring when the pane gets the keyboard. */
  first: string | undefined;
  choose(ids: string[], choice: Choice | undefined): unknown;
  /** As `choose`, for the row or doc the ring is on as the press lands. */
  chooseFocused(choice: Choice | undefined): unknown;
  /** Opens or folds rows; `isAlone` opens them and folds every other. */
  toggleOpen(ids: string[], isAlone?: boolean): unknown;
};

/** The rows a stop stands for: a row itself, or every row of a doc. */
function idsOf(list: readonly Suggestion[], stop: string): string[] {
  if (stop.startsWith("grp:")) {
    const target = stop.slice("grp:".length);
    return list.filter((s) => s.target === target).map((s) => s.id);
  }
  if (!stop.startsWith("row:")) return [];
  const id = stop.slice("row:".length);
  return list.some((s) => s.id === id) ? [id] : [];
}

/** What a row is set to, or a doc when all its rows agree: `skip` when none is set. */
type State = Choice | "skip" | "mixed";

const CHOICES = ["apply", "dismiss", "skip"] as const;
const HOTKEY = { apply: "a", dismiss: "d", skip: "s" } as const;

/**
 * The apply, dismiss and skip options of a row or a doc, the one it is set to on. Every row and
 * header offers all three whatever the ring is on: the engine keeps the ring at its place among
 * the Buttons across a redraw, so a Button that came and went with the ring would move it. Only
 * the hotkeys follow the ring.
 */
function optionsOf(r: Rows, owner: string, ids: string[], state: State): ChoiceOption[] {
  const isKeyed = r.keyed === owner;
  return CHOICES.map((choice) => ({
    key: chipKey(choice, owner),
    label: choice,
    isOn: state === choice,
    isQuiet: choice === "skip",
    hotkey: isKeyed ? HOTKEY[choice] : undefined,
    // A key pressed just after the ring moved can reach these before the redraw that moves the
    // hotkeys: it acts on where the ring is now.
    onPress: () =>
      isKeyed
        ? r.chooseFocused(choice === "skip" ? undefined : choice)
        : r.choose(ids, choice === "skip" ? undefined : choice),
  }));
}

/** One suggestion: its claim, kind, age, keys and evidence; what it is set to colours the claim. */
function row(k: Kit, r: Rows, s: Suggestion): JSX.Element {
  const state = r.set[s.id];
  return card(k, {
    key: `s:${s.id}`,
    claim: s.claim,
    claimKey: rowKey(s.id),
    kind: s.kind,
    seen: seen(s),
    age: age(s.updated, r.now),
    tone: state,
    isOpen: r.open.has(s.id),
    onToggle: (how) => r.toggleOpen([s.id], how?.isAlone),
    autoFocus: s.id === r.first,
    details: {
      key: evidenceKey(s.id),
      count: s.evidence.length,
      render: (inner) => evidence(inner, s.evidence),
    },
    choice: {
      options: optionsOf(r, rowKey(s.id), [s.id], state ?? "skip"),
      gui: { layout: "row" },
    },
  });
}

/** A doc's header: its path, which opens or folds its rows, and keys that set every row of the doc. */
function header(k: Kit, r: Rows, target: string, rows: Suggestion[]): JSX.Element {
  const owner = groupKey(target);
  const ids = rows.map((s) => s.id);
  const states = new Set(ids.map((id) => r.set[id] ?? "skip"));
  const state: State = states.size === 1 ? ([...states][0] ?? "skip") : "mixed";
  return section(k, target, {
    key: owner,
    onPress: () => r.toggleOpen(ids),
    count: rows.length,
    isCode: true,
    choice: {
      options: optionsOf(r, owner, ids, state),
      suffix: "all",
      gui: { layout: "row" },
    },
  });
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    const started = await next(e);
    await $.tool.register({
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      inputSchema: structuredClone(INPUT_SCHEMA) as unknown as Record<string, unknown>,
      isDeferred: false,
    });
    await $.command
      .register({
        name: "docfix",
        description: "Review the doc suggestions agents filed for this repo",
      })
      .catch((error) =>
        $.ui.log(`docfix: /docfix not registered: ${String(error)}`, { to: "debug" }),
      );
    await refresh($).catch(() => undefined);
    return started;
  });

  on("turn.complete", async ($, e, next) => {
    const done = await next(e);
    if (e.agentId === undefined) await refresh($).catch(() => undefined);
    return done;
  });

  on("tool.call", { tool: "mcp__docfix__docfix" }, async ($, e) => {
    const input = e as unknown as Input;
    const where = await place($);
    if (typeof where === "string") return { deny: where };
    let target = input.file ? normalizeTarget(input.file, where.root) : undefined;
    if (target?.ok) {
      const tracked = await $.process.run(
        ["git", "ls-files", "--error-unmatch", "--", target.target],
        {
          cwd: where.root,
        },
      );
      if (tracked.exitCode !== 0)
        target = { ok: false, error: `${target.target} is not a file git tracks in this repo` };
    }
    const outcome = plan({
      input,
      existing: await loadAll($, where.dir),
      target,
      now: new Date(await $.clock.now()).toISOString(),
      session: `claude:${await $.session.id()}`,
    });
    if (outcome.kind === "error") return { deny: outcome.text };
    if (outcome.kind === "write") await save($, where.dir, outcome.suggestion);
    if (outcome.kind === "remove") await removeFile($, where.dir, outcome.suggestion);
    await refresh($, where);
    return { result: outcome.text };
  }).catch((_$, _e, next) => ({ deny: `docfix failed: ${String(next.error)}` }));

  // The first time a session reads a doc, the tool is named beside it: an agent that later
  // finds the doc wrong has it in mind. The hooks only add text; the call itself is untouched.
  on("tool.call", { tool: "Read" }, async ($, e, next) =>
    withReminder($, await next(e), [e.file_path]),
  );
  on("tool.call", { tool: "Bash" }, async ($, e, next) =>
    withReminder($, await next(e), readsInCommand(e.command)),
  );

  on("command.run", { command: "docfix" }, async ($) => {
    await openPane($);
    return { text: "Opened the doc suggestions pane." };
  }).catch((_$, _e, next) => ({ text: `docfix: ${String(next.error)}` }));

  // Closing is what carries the choices out. An unload closes without asking; a draft the prompt
  // box refuses keeps the pane open, with the notice saying why.
  on("ui.close", { id: PANE }, async ($, e, next) => {
    if (e.origin.kind !== "unload" && !(await settle($))) return { value: undefined };
    await update($, paneShown, () => false);
    return next(e);
  });

  on("ui.focus", { requestId: PANE }, async ($, e, next) => {
    const element = e.element ?? null;
    const to =
      element && e.origin.kind === "person"
        ? landing(stopsOf(await read($, queue)), await read($, focused), element)
        : undefined;
    await update($, focused, () => to ?? element);
    return next(to ? { ...e, element: to } : e);
  }).catch((_$, e, next) => next(e));

  // The open count, above the prompt; a click opens the pane. A survey has the band to itself.
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e);
    const below = await next(e);
    const n = (await read($, queue)).length;
    if (n === 0 || (await read($, paneShown))) return below;
    const { Box } = $.ui.resolve(e);
    const kit = kitOf($.ui.resolve(e), e);
    return (
      <Box flexDirection="column">
        {below}
        {statusBand(kit, {
          key: "docfix:open",
          text: `docfix: docs ${n}`,
          hint: "review",
          gui: { text: n === 1 ? "1 doc suggestion to review" : `${n} doc suggestions to review` },
          status: "warning",
          onPress: () => openPane($),
        })}
      </Box>
    );
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const kit = kitOf($.ui.resolve(e), e);
    const queued = await read($, queue);
    const set = await read($, choices);
    const focus = await read($, focused);
    const open = new Set(await read($, expanded));
    const isAll = await read($, showAll);
    const { text: noted, status } = await read($, said);
    const now = await $.clock.now();
    const stops = stopsOf(queued);
    const first = queued[0]?.id;
    const rows: Rows = {
      now,
      set,
      open,
      // On submit no row's keys are lit: a, d and s there would set a row out of sight.
      keyed:
        focus === SUBMIT
          ? undefined
          : focus && stops.includes(focus)
            ? focus
            : first
              ? rowKey(first)
              : undefined,
      first,
      choose: async (ids, choice) => {
        await update($, choices, (cur) => toggleChoice(cur, ids, choice));
        await say($, "");
      },
      chooseFocused: async (choice) => {
        const at = await read($, focused);
        if (at === SUBMIT) return;
        const stop = at && stops.includes(at) ? at : first ? rowKey(first) : "";
        const ids = idsOf(await read($, queue), stop);
        if (ids.length === 0) return;
        await update($, choices, (cur) => toggleChoice(cur, ids, choice));
        await say($, "");
      },
      toggleOpen: (ids, isAlone) =>
        update($, expanded, (cur) =>
          ids.every((id) => cur.includes(id))
            ? cur.filter((id) => !ids.includes(id))
            : isAlone
              ? ids
              : [...new Set([...cur, ...ids])],
        ),
    };
    const summary = choiceSummary(queued.map((s) => set[s.id]));

    // Submit carries the choices out and closes, as Esc or the close mark does. It settles
    // first: a close the mod raises itself skips the mod's own ui.close hook.
    const actions = [
      {
        key: SUBMIT,
        label: "submit",
        isPrimary: true,
        gui: { isPrimary: Boolean(summary) },
        onPress: async () => {
          if (!(await settle($))) return;
          await update($, paneShown, () => false);
          await $.ui.close({ id: PANE });
        },
      },
    ];

    return pane(kit, (k) => {
      // A graphical surface sets Submit at the top, beside what closing will do.
      const head = paneTitle(k, "Doc suggestions", queued.length || undefined, {
        gui: {
          count: queued.length ? `${queued.length} open` : undefined,
          summary: summary ? `On close: ${summary}` : undefined,
          actions: queued.length ? actions : undefined,
        },
      });
      const said_ = noted ? notice(k, noted, status, { isWrapped: true }) : null;
      if (queued.length === 0)
        return [
          head,
          said_,
          emptyState(
            k,
            "Nothing to review: no open doc suggestions in this repo. An agent files one when a doc it reads no longer matches the code.",
          ),
        ];

      const bar = summary
        ? notice(k, `On close: ${summary}`, "text", { isWrapped: true, gui: { isHidden: true } })
        : notice(k, "Submit or close to carry out apply and dismiss", "dim", {
            isWrapped: true,
            gui: { isHidden: true },
          });
      // A long queue shows its first suggestions; the rest is one press away.
      const { shown, more } = capped(k, queued, {
        isAll,
        onMore: () => update($, showAll, () => true),
      });
      const submit = actionBar(k, actions, { gui: { isHidden: true } });
      return [
        head,
        bar,
        said_,
        stack(
          k,
          byTarget(shown).map(([target, list]) =>
            stack(
              k,
              [
                header(k, rows, target, list),
                stack(
                  k,
                  list.map((s) => row(k, rows, s)),
                  { gui: { gap: "none" } },
                ),
              ],
              { isTight: true, gui: { gap: "xs" } },
            ),
          ),
        ),
        more,
        submit,
      ];
    });
  });
};
