/**
 * The Claude Code half of docfix: the `docfix` tool, the /docfix pane, and the
 * open count on the status line. What a call does to the queue is the core's
 * (`../core/docfix.ts`), the one pi's half runs.
 *
 * The pane shows every suggestion whole: its claim never cut, its evidence one press away
 * (open by default while the queue is short). An apply drafts the prompt in the person's
 * prompt box instead of sending it.
 */
import { atom, read, update } from "claude-code";
import type { EngineInterface, Register, RenderNode } from "claude-code";
import {
  applyPrompt,
  byTarget,
  dismiss,
  fileName,
  INPUT_SCHEMA,
  normalizeTarget,
  openQueue,
  parse,
  plan,
  reopen,
  seen,
  serialize,
  statusText,
  STORE_DIR,
  TOOL_DESCRIPTION,
  TOOL_NAME,
  type Input,
  type Suggestion,
} from "../core/docfix";
import type { Said } from "./types.d.ts";
import {
  buttonRow,
  cellWidth,
  clamp,
  emptyState,
  entries,
  kitOf,
  paneOptions,
  paneTitle,
  rowsOf,
  roleProps,
  tokens,
  widthCap,
  type Kit,
  type KeyChip,
} from "./ui";

const PANE = "docfix";

// Change the tag when a suggestion's fields change: it declines what an earlier version stored.
const queue = atom({ plugin: "docfix", key: "queue" } as const, [] as Suggestion[], {
  shape: "queue-1",
});
const marked = atom({ plugin: "docfix", key: "marked" } as const, [] as string[]);
const focused = atom({ plugin: "docfix", key: "focused" } as const, null as string | null);
const expanded = atom({ plugin: "docfix", key: "expanded" } as const, [] as string[]);
const said = atom(
  { plugin: "docfix", key: "notice" } as const,
  { text: "", status: "warning" } as Said,
  { shape: "notice-3" },
);

const say = (
  $: EngineInterface,
  text: string,
  status: Said["status"] = "warning",
  undo?: string[],
) => update($, said, () => (undo?.length ? { text, status, undo } : { text, status }));

type Place = { root: string; dir: string };

async function place($: EngineInterface): Promise<Place | string> {
  const cwd = await $.session.cwd();
  const top = await $.process
    .run(["git", "rev-parse", "--show-toplevel"], { cwd })
    .catch(() => null);
  const root = top?.exitCode === 0 ? top.stdout.trim() : "";
  if (!root) return "not inside a git repository, so there are no repo docs to file against";
  const store = `${root}/.agents/store`;
  if (!(await $.fs.exists(store))) {
    await $.process.run(["agent-notes", "root", "--ensure", "--path", root]).catch(() => null);
    if (!(await $.fs.exists(store)))
      return "this checkout has no note store (.agents/store); run `agent-notes root --ensure`";
  }
  return { root, dir: `${store}/${STORE_DIR}` };
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
  $.ui.status(statusText(open.length));
  return open;
}

/** A queue this short opens with every suggestion's evidence showing. */
const OPEN_BELOW = 6;

/** A pane with fewer body rows than this drops the blank rows between its blocks. */
const TIGHT_ROWS = 16;
/** Below this many cells the keys say less, so they stay on one row. */
const NARROW = 76;

/** The width a pane is asked to open at, docked or inline; the surface caps it. */
const WANTED_COLUMNS = 80;

/**
 * Rows the pane would take with its evidence showing as given, a guess at `WANTED_COLUMNS`:
 * what it asks an inline pane to open at, so a short queue is not a box of a few rows to scroll.
 */
function wantedRows(list: readonly Suggestion[], open: ReadonlySet<string>) {
  const text = WANTED_COLUMNS - HANG;
  const body = byTarget(list).reduce(
    (n, [, rows]) =>
      n +
      1 +
      rows.reduce(
        (m, s) =>
          m +
          rowsOf(s.claim, text) +
          1 +
          (open.has(s.id)
            ? s.evidence.reduce(
                (k, ev) => k + rowsOf(ev.text, text - tokens.dateWidth - tokens.gutter) + 1,
                0,
              )
            : 0) +
          1,
        0,
      ),
    0,
  );
  // The title, the keys, a notice, and the blank rows between them.
  return 7 + body;
}

async function openPane($: EngineInterface) {
  await say($, "");
  const list = await refresh($);
  const open = new Set(list.length <= OPEN_BELOW ? list.map((s) => s.id) : []);
  await update($, marked, () => []);
  await update($, expanded, () => [...open]);
  const opened = await $.ui.open(
    paneOptions({
      id: PANE,
      title: "Doc suggestions",
      focus: true,
      closeOnEscape: true,
      rows: wantedRows(list, open),
      columns: WANTED_COLUMNS,
    }),
  );
  if (!opened.isPlaced) $.ui.toast(`The doc suggestions pane can't show yet: ${opened.reason}`);
}

// ---- what a key acts on

/** The element keys the pane draws: one per row's title, its evidence line and its doc header. */
const rowKey = (id: string) => `row:${id}`;
const evidenceKey = (id: string) => `ev:${id}`;
const groupKey = (target: string) => `grp:${target}`;

/** The suggestions the ring is on: the row, its evidence line, or a whole doc under its header. */
function underFocus(list: readonly Suggestion[], focus: string | null): Suggestion[] {
  if (!focus) return [];
  if (focus.startsWith("grp:")) return list.filter((s) => s.target === focus.slice(4));
  const id = focus.replace(/^(?:row|ev):/, "");
  return list.filter((s) => s.id === id);
}

/** What apply and dismiss act on: the marked suggestions, else the one or doc under the ring. */
function choose(list: readonly Suggestion[], ids: ReadonlySet<string>, focus: string | null) {
  const chosen = list.filter((s) => ids.has(s.id));
  return chosen.length > 0 ? chosen : underFocus(list, focus);
}

async function picked($: EngineInterface): Promise<Suggestion[]> {
  return choose(await read($, queue), new Set(await read($, marked)), await read($, focused));
}

/**
 * Moves the ring onto a row. The plugin's own focus call does not come back through its
 * `ui.focus` hook, so what the hook tracks is set here too.
 */
async function focusRow($: EngineInterface, id: string) {
  const moved = await $.ui.focus({ requestId: PANE, key: rowKey(id) }).catch(() => undefined);
  if (moved && !("deny" in moved)) await update($, focused, () => rowKey(id));
}

const NOTHING = "Mark a suggestion, or move onto one, first";

/** Drafts the apply prompt in the person's prompt box, after what they already typed. */
async function applyPicked($: EngineInterface) {
  const chosen = await picked($);
  if (chosen.length === 0) return say($, NOTHING);
  const text = applyPrompt(chosen);
  const draft = await $.prompt.read();
  const filled = await $.prompt.fill(
    draft.text.trim() ? { text: `\n\n${text}`, mode: "append" } : { text },
  );
  if (!filled.isFilled)
    return say(
      $,
      "The prompt box can't take the draft right now; try again from the prompt",
      "error",
    );
  await update($, marked, () => []);
  await $.ui.close({ id: PANE });
  $.ui.toast("The apply prompt is in the prompt box: read it, then Enter to send");
}

async function dismissPicked($: EngineInterface) {
  const chosen = await picked($);
  if (chosen.length === 0) return say($, NOTHING);
  const where = await place($);
  if (typeof where === "string") return say($, where, "error");
  const before = await read($, queue);
  const at = Math.min(...chosen.map((s) => before.findIndex((q) => q.id === s.id)));
  const now = new Date(await $.clock.now()).toISOString();
  for (const s of chosen) await save($, where.dir, dismiss(s, now));
  await update($, marked, (ids) => ids.filter((id) => !chosen.some((s) => s.id === id)));
  const after = await refresh($, where);
  await say(
    $,
    `Dismissed ${chosen.length}: it is not filed again`,
    "success",
    chosen.map((s) => s.id),
  );
  // Keep the keyboard going: the ring moves to the row that took the dismissed one's place.
  const next = after[Math.min(Math.max(0, at), after.length - 1)];
  if (next) await focusRow($, next.id);
}

async function undoDismiss($: EngineInterface) {
  const { undo = [] } = await read($, said);
  const where = await place($);
  if (typeof where === "string") return say($, where, "error");
  const now = new Date(await $.clock.now()).toISOString();
  const back = (await loadAll($, where.dir)).filter((s) => undo.includes(s.id));
  for (const s of back) await save($, where.dir, reopen(s, now));
  await refresh($, where);
  await say($, `Restored ${back.length}`, "success");
  const first = back[0];
  if (first) await focusRow($, first.id);
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

/** The fold marks of an evidence line, one cell each like the note's `╰▸`. */
const FOLD = { closed: "▸", open: "▾" } as const;
/** Cells a row's text hangs in: its mark and the space after it. */
const HANG = 2;

type Rows = {
  kit: Kit;
  width: number;
  now: number;
  marks: ReadonlySet<string>;
  open: ReadonlySet<string>;
  /** The id of the row that takes the ring when the pane gets the keyboard. */
  first: string | undefined;
  toggleMark(id: string): unknown;
  toggleOpen(id: string): unknown;
};

/** One suggestion: its claim whole beside its mark, its meta line, and its evidence when open. */
function row(r: Rows, s: Suggestion): JSX.Element {
  const { Box, Button, Text } = r.kit;
  const isMarked = r.marks.has(s.id);
  const isOpen = r.open.has(s.id);
  const lines = clamp(s.claim, Math.max(1, r.width - HANG));
  const count = seen(s);
  const title: RenderNode[] = [];
  title.push(
    isMarked ? (
      <Text key="mark" {...roleProps("accent")}>{`${tokens.glyph.multi.on} `}</Text>
    ) : (
      `${tokens.glyph.multi.off} `
    ),
  );
  lines.forEach((line, i) => title.push(i === 0 ? line : `\n${" ".repeat(HANG)}${line}`));
  return (
    <Box key={`s:${s.id}`} flexDirection="column">
      <Button
        key={rowKey(s.id)}
        plain
        autoFocus={s.id === r.first ? true : undefined}
        onPress={() => r.toggleMark(s.id)}
      >
        {title}
      </Button>
      <Button key={evidenceKey(s.id)} plain dimColor onPress={() => r.toggleOpen(s.id)}>
        {" ".repeat(HANG)}
        <Text {...roleProps(s.kind === "wrong" ? "error" : "dim")}>
          {`${tokens.glyph.kind[s.kind]} ${s.kind}`}
        </Text>
        {"  "}
        <Text
          {...roleProps(count >= 3 ? "warning" : "dim")}
        >{`${count}${tokens.glyph.times}`}</Text>
        {`  ${age(s.updated, r.now)}  ${isOpen ? FOLD.open : FOLD.closed} evidence ${s.evidence.length}`}
      </Button>
      {isOpen ? (
        <Box key={`e:${s.id}`} flexDirection="column" paddingLeft={HANG}>
          {entries(
            r.kit,
            Math.max(1, r.width - HANG),
            [...s.evidence].reverse().map((ev) => ({ date: ev.at.slice(0, 10), text: ev.text })),
          )}
        </Box>
      ) : null}
    </Box>
  );
}

/** A doc's header: its path whole, a dim rule after it, and how many of its rows are marked. */
function header(r: Rows, target: string, rows: Suggestion[], toggle: () => unknown): JSX.Element {
  const { Box, Button, Text } = r.kit;
  const on = rows.filter((s) => r.marks.has(s.id)).length;
  const tail = on > 0 ? ` ${on}/${rows.length} marked` : "";
  const lines = clamp(target, r.width);
  const last = lines.at(-1) ?? "";
  const room = r.width - cellWidth(last) - cellWidth(tail) - 1;
  const button = (
    <Button key={groupKey(target)} plain onPress={toggle}>
      <Text weight="semibold">{lines.join("\n")}</Text>
    </Button>
  );
  return (
    <Box key={`g:${target}`} flexDirection="row" columnGap={1}>
      {button}
      <Text dimColor>{room > 0 ? tokens.glyph.rule.repeat(room) : ""}</Text>
      {tail ? <Text {...roleProps("accent")}>{tail.trim()}</Text> : null}
    </Box>
  );
}

/** The line under the keys, wrapped whole. */
function said_(k: Kit, width: number, text: string, status: Said["status"]): JSX.Element {
  const { Text } = k;
  return <Text {...roleProps(status)}>{clamp(text, width).join("\n")}</Text>;
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

  on("command.run", { command: "docfix" }, async ($) => {
    await openPane($);
    return { text: "Opened the doc suggestions pane." };
  }).catch((_$, _e, next) => ({ text: `docfix: ${String(next.error)}` }));

  on("ui.focus", { requestId: PANE }, async ($, e, next) => {
    await update($, focused, () => e.element ?? null);
    return next(e);
  }).catch((_$, e, next) => next(e));

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e);
    const { Box } = els;
    const kit = kitOf(els, e.surface);
    const queued = await read($, queue);
    const ids = new Set(await read($, marked));
    const focus = await read($, focused);
    const open = new Set(await read($, expanded));
    const { text: noted, status, undo } = await read($, said);
    const now = await $.clock.now();
    const isInline = e.props.placement === "inline";
    // One cell of padding, which the inline box's own border already gives; and never wider
    // than a reading column.
    const padding = isInline ? 0 : tokens.padding;
    const width = widthCap("reading", e.props.bodyColumns - 2 * padding);
    const close = () => $.ui.close({ id: PANE });
    const clearNotice = () => say($, "");
    const toggleMark = async (id: string) => {
      await update($, marked, (cur) =>
        cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
      );
      await clearNotice();
    };
    const toggleOpen = (id: string) =>
      update($, expanded, (cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
    // A pane only a few rows tall has no room for blank rows between its blocks, nor for keys
    // that wrap: it spends them on the suggestions.
    const isTight = e.props.scroll.bodyRows < TIGHT_ROWS;
    const isNarrow = width < NARROW;
    const frame = (...blocks: (JSX.Element | null)[]) => (
      <Box flexDirection="column" rowGap={isTight ? 0 : 1} paddingX={padding}>
        {blocks}
      </Box>
    );
    const head = paneTitle(kit, width, "Doc suggestions", queued.length || undefined);

    if (queued.length === 0)
      return frame(
        head,
        buttonRow(kit, [
          ...(undo?.length ? [{ hotkey: "u", label: "undo", press: () => undoDismiss($) }] : []),
          { hotkey: "q", label: "close", press: close, isLit: true },
        ]),
        noted ? said_(kit, width, noted, status) : null,
        emptyState(
          kit,
          width,
          "Nothing to review: no open doc suggestions in this repo. An agent files one when a doc it reads no longer matches the code.",
        ),
      );

    const chosen = choose(queued, ids, focus);
    const n = chosen.length;
    const named = (verb: string) =>
      n === 0 || (isNarrow && ids.size === 0)
        ? verb
        : n === 1 && ids.size === 0
          ? `${verb} this`
          : `${verb} ${n}`;
    const allMarked = queued.every((s) => ids.has(s.id));
    const allOpen = queued.every((s) => open.has(s.id));
    const keys: KeyChip[] = [
      {
        id: "apply",
        hotkey: "a",
        label: named("apply"),
        press: () => applyPicked($),
        isLit: n > 0,
      },
      { id: "dismiss", hotkey: "d", label: named("dismiss"), press: () => dismissPicked($) },
      {
        id: "mark",
        hotkey: "m",
        label: isNarrow ? (allMarked ? "unmark" : "mark") : allMarked ? "unmark all" : "mark all",
        press: () =>
          update($, marked, () => (allMarked ? [] : queued.map((s) => s.id))).then(clearNotice),
      },
      {
        id: "evidence",
        hotkey: "e",
        label: isNarrow ? "evidence" : allOpen ? "hide evidence" : "show evidence",
        press: () => update($, expanded, () => (allOpen ? [] : queued.map((s) => s.id))),
      },
      ...(undo?.length
        ? [{ id: "undo", hotkey: "u", label: "undo", press: () => undoDismiss($) }]
        : []),
      { id: "close", hotkey: "q", label: "later", press: close },
    ];

    const rows: Rows = {
      kit,
      width,
      now,
      marks: ids,
      open,
      first: queued[0]?.id,
      toggleMark,
      toggleOpen,
    };
    const groups = byTarget(queued);
    return frame(
      head,
      buttonRow(kit, keys),
      noted ? said_(kit, width, noted, status) : null,
      <Box flexDirection="column" rowGap={1}>
        {groups.map(([target, list]) => (
          <Box key={`group:${target}`} flexDirection="column">
            {header(rows, target, list, () => {
              const every = list.every((s) => ids.has(s.id));
              return update($, marked, (cur) =>
                every
                  ? cur.filter((id) => !list.some((s) => s.id === id))
                  : [...new Set([...cur, ...list.map((s) => s.id)])],
              ).then(clearNotice);
            })}
            <Box flexDirection="column" rowGap={1}>
              {list.map((s) => row(rows, s))}
            </Box>
          </Box>
        ))}
      </Box>,
    );
  });
};
