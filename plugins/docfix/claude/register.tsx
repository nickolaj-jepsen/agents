/**
 * The Claude Code half of docfix: the `docfix` tool, the /docfix pane, and the
 * open count on the status line. What a call does to the queue is the core's
 * (`../core/docfix.ts`), the one pi's half runs.
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
  emptyState,
  entries,
  kitOf,
  list as listOf,
  notice,
  paneOptions,
  paneTitle,
  section,
  tokens,
  widthCap,
  type Cell,
  type ListGroup,
} from "./ui";

const PANE = "docfix";

// Change the tag when a suggestion's fields change: it declines what an earlier version stored.
const queue = atom({ plugin: "docfix", key: "queue" } as const, [] as Suggestion[], {
  shape: "queue-1",
});
const marked = atom({ plugin: "docfix", key: "marked" } as const, [] as string[]);
const focused = atom({ plugin: "docfix", key: "focused" } as const, null as string | null);
const said = atom(
  { plugin: "docfix", key: "notice" } as const,
  { text: "", status: "warning" } as Said,
  {
    shape: "notice-2",
  },
);

const say = ($: EngineInterface, text: string, status: Said["status"] = "warning") =>
  update($, said, () => ({ text, status }));

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

async function openPane($: EngineInterface) {
  await say($, "");
  await refresh($);
  const opened = await $.ui.open(
    paneOptions({
      id: PANE,
      title: "Doc suggestions",
      focus: true,
      closeOnEscape: true,
    }),
  );
  if (!opened.isPlaced) $.ui.toast(`The doc suggestions pane can't show yet: ${opened.reason}`);
}

/** The marked suggestions, or the focused one when none is marked. */
async function picked($: EngineInterface): Promise<Suggestion[]> {
  const list = await read($, queue);
  const ids = new Set(await read($, marked));
  const chosen = list.filter((s) => ids.has(s.id));
  if (chosen.length > 0) return chosen;
  const focus = await read($, focused);
  const one = list.find((s) => `row:${s.id}` === focus);
  return one ? [one] : [];
}

async function applyPicked($: EngineInterface) {
  const chosen = await picked($);
  if (chosen.length === 0) return say($, "Mark a suggestion, or focus one, first");
  await update($, marked, () => []);
  await $.ui.close({ id: PANE });
  for (const [target, list] of byTarget(chosen))
    void $.prompt.submit({ text: applyPrompt(target, list) });
}

async function dismissPicked($: EngineInterface) {
  const chosen = await picked($);
  if (chosen.length === 0) return say($, "Mark a suggestion, or focus one, first");
  const where = await place($);
  if (typeof where === "string") return say($, where, "error");
  const now = new Date(await $.clock.now()).toISOString();
  for (const s of chosen) await save($, where.dir, dismiss(s, now));
  await update($, marked, (ids) => ids.filter((id) => !chosen.some((s) => s.id === id)));
  await refresh($, where);
  await say($, `Dismissed ${chosen.length}`, "success");
}

/** Rows a title may take; `TITLE_TARGET` characters of it, so a wider pane shows fewer lines. */
const TITLE_LINES = 3;
const TITLE_TARGET = 120;
/** The newest evidence shown for the focused suggestion, and the lines each may take. */
const EVIDENCE = 3;
const EVIDENCE_LINES = 4;
/** From this width an inline pane puts metadata in columns. */
const WIDE = 72;

const DAY = 86_400_000;
/** `5m`, `3h`, `40d`: how long ago, in at most four cells. */
const age = (iso: string, now: number) => {
  const ms = Math.max(0, now - Date.parse(iso));
  if (Number.isNaN(ms)) return "";
  if (ms >= DAY) return `${Math.floor(ms / DAY)}d`;
  if (ms >= 3_600_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 60_000)}m`;
};

/** `icon word`, `N×` and the age: dim, but `!` is error and a count from 3× is warning. */
const metaOf = (s: Suggestion, now: number): Cell[] => {
  const count = seen(s);
  return [
    {
      text: `${tokens.glyph.kind[s.kind]} ${s.kind}`,
      width: 9,
      role: s.kind === "wrong" ? "error" : "dim",
    },
    {
      text: `${count}${tokens.glyph.times}`,
      width: 4,
      align: "right",
      role: count >= 3 ? "warning" : "dim",
    },
    { text: age(s.updated, now), width: 4, align: "right" },
  ];
};

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
    const { text: noted, status } = await read($, said);
    const now = await $.clock.now();
    const isInline = e.props.placement === "inline";
    // One cell of padding, which the inline box's own border already gives; and never wider
    // than a reading column.
    const padding = isInline ? 0 : tokens.padding;
    const width = widthCap("reading", e.props.bodyColumns - 2 * padding);
    const toggle = (id: string) =>
      update($, marked, (current) =>
        current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
      );
    const close = () => $.ui.close({ id: PANE });
    const frame = (...blocks: (JSX.Element | null)[]) => (
      <Box flexDirection="column" rowGap={1} paddingX={padding}>
        {blocks}
      </Box>
    );
    const head = paneTitle(kit, width, "Doc suggestions", queued.length || undefined);

    if (queued.length === 0)
      return frame(
        head,
        emptyState(kit, width, "Nothing to review: no open doc suggestions in this repo."),
        buttonRow(kit, [{ hotkey: "q", label: "close", press: close, isLit: true }]),
      );

    const groups: ListGroup[] = [];
    for (const s of queued) {
      const last = groups.at(-1);
      const row = {
        key: `row:${s.id}`,
        title: s.claim,
        isMarked: ids.has(s.id),
        meta: metaOf(s, now),
        onPress: () => toggle(s.id),
      };
      if (last?.title === s.target) last.rows.push(row);
      else groups.push({ title: s.target, rows: [row] });
    }
    const current = queued.find((s) => `row:${s.id}` === focus);
    const wide = isInline && width >= WIDE;
    return frame(
      head,
      listOf(kit, groups, {
        width,
        isColumns: wide,
        title: { target: TITLE_TARGET, max: TITLE_LINES },
      }),
      current ? (
        <Box flexDirection="column">
          {section(kit, width, "Evidence")}
          {entries(
            kit,
            width,
            current.evidence
              .slice(-EVIDENCE)
              .map((ev) => ({ date: ev.at.slice(0, 10), text: ev.text })),
            { lines: { max: EVIDENCE_LINES } },
          )}
        </Box>
      ) : (
        emptyState(
          kit,
          width,
          "Enter marks a row; apply or dismiss the marked rows, or the focused one.",
        )
      ),
      noted ? notice(kit, width, noted, status) : null,
      buttonRow(kit, [
        { hotkey: "a", label: "apply", press: () => applyPicked($), isLit: ids.size > 0 },
        { hotkey: "d", label: "dismiss", press: () => dismissPicked($) },
        { hotkey: "q", label: "later", press: close },
      ]),
    );
  });
};
