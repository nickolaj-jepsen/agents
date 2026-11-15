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

const PANE = "docfix";

// Change the tag when a suggestion's fields change: it declines what an earlier version stored.
const queue = atom({ plugin: "docfix", key: "queue" } as const, [] as Suggestion[], {
  shape: "queue-1",
});
const marked = atom({ plugin: "docfix", key: "marked" } as const, [] as string[]);
const focused = atom({ plugin: "docfix", key: "focused" } as const, null as string | null);
const notice = atom({ plugin: "docfix", key: "notice" } as const, "");

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
  await update($, notice, () => "");
  await refresh($);
  const opened = await $.ui.open({
    id: PANE,
    title: "Doc suggestions",
    focus: true,
    closeOnEscape: true,
  });
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
  if (chosen.length === 0) return update($, notice, () => "Mark a suggestion, or focus one, first");
  await update($, marked, () => []);
  await $.ui.close({ id: PANE });
  for (const [target, list] of byTarget(chosen))
    void $.prompt.submit({ text: applyPrompt(target, list) });
}

async function dismissPicked($: EngineInterface) {
  const chosen = await picked($);
  if (chosen.length === 0) return update($, notice, () => "Mark a suggestion, or focus one, first");
  const where = await place($);
  if (typeof where === "string") return update($, notice, () => where);
  const now = new Date(await $.clock.now()).toISOString();
  for (const s of chosen) await save($, where.dir, dismiss(s, now));
  await update($, marked, (ids) => ids.filter((id) => !chosen.some((s) => s.id === id)));
  await refresh($, where);
  await update($, notice, () => `Dismissed ${chosen.length}`);
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
    const { Box, Text, Button } = $.ui.resolve(e);
    const list = await read($, queue);
    const ids = new Set(await read($, marked));
    const focus = await read($, focused);
    const said = await read($, notice);
    const width = e.props.bodyColumns;
    const toggle = (id: string) =>
      update($, marked, (current) =>
        current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
      );

    if (list.length === 0)
      return (
        <Box flexDirection="column">
          <Text dimColor>Nothing to review: no open doc suggestions in this repo.</Text>
          <Button
            key="close"
            role="dismiss"
            hotkey="q"
            label="Close"
            onPress={() => $.ui.close({ id: PANE })}
          />
        </Box>
      );

    const rows: RenderNode[] = [];
    let last = "";
    for (const s of list) {
      if (s.target !== last) {
        rows.push(
          <Text key={`t:${s.target}`} color="claude">
            {s.target}
          </Text>,
        );
        last = s.target;
      }
      const claim =
        s.claim.length > width - 24 ? `${s.claim.slice(0, Math.max(10, width - 25))}…` : s.claim;
      rows.push(
        <Button key={`row:${s.id}`} plain onPress={() => toggle(s.id)}>
          {ids.has(s.id) ? "■ " : "□ "}
          {claim}{" "}
          <Text dimColor>
            · {s.kind} · seen {seen(s)}×
          </Text>
        </Button>,
      );
    }
    const current = list.find((s) => `row:${s.id}` === focus);
    const evidence = current?.evidence.at(-1);

    return (
      <Box flexDirection="column">
        {rows}
        <Box marginTop={1} flexDirection="column">
          {evidence ? (
            <Text dimColor>
              {evidence.at.slice(0, 10)} {evidence.session}: {evidence.text}
            </Text>
          ) : (
            <Text dimColor>
              Enter marks a row; apply or dismiss the marked rows, or the focused one.
            </Text>
          )}
          {said ? <Text color="warning">{said}</Text> : null}
        </Box>
        <Box marginTop={1} gap={2}>
          <Button
            key="apply"
            hotkey="a"
            variant="primary"
            label="Apply"
            onPress={() => applyPicked($)}
          />
          <Button key="dismiss" hotkey="d" label="Dismiss" onPress={() => dismissPicked($)} />
          <Button
            key="close"
            role="dismiss"
            hotkey="q"
            label="Later"
            onPress={() => $.ui.close({ id: PANE })}
          />
        </Box>
      </Box>
    );
  });
};
