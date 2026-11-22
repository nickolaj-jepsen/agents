export const TOOL_NAME = "docfix";
export const KINDS = ["wrong", "missing", "stale"] as const;
export type Kind = (typeof KINDS)[number];
export type Status = "open" | "dismissed";

/** The store folder suggestions live in, under the checkout's `.agents/store`. */
export const STORE_DIR = "docfix";

export type Evidence = { at: string; session: string; text: string };

export type Suggestion = {
  id: string;
  /** Repo-relative path of the doc. */
  target: string;
  kind: Kind;
  claim: string;
  status: Status;
  created: string;
  updated: string;
  /** When it was dismissed, "" while open. */
  dismissed: string;
  /** Every session that filed it, oldest first; its length is the seen count. */
  sessions: string[];
  evidence: Evidence[];
};

export const TOOL_DESCRIPTION = [
  "File a suggestion that a doc in this repo is wrong, instead of editing it.",
  "Call it whenever this session has shown you that a git-tracked doc (AGENTS.md, CLAUDE.md, docs/**, a README) doesn't match reality, for example:",
  "you followed a doc's command or steps and they failed or needed changing;",
  "code or output you read contradicts a line in a doc;",
  "you hit a trap or needed a fact that the doc covering that area should have told you;",
  "a doc describes something removed or renamed, or a plan that is done or abandoned.",
  "It needs proof you saw in this session: a file and line you read, or a command and its output. A hunch, a guess or a style preference is not proof: don't file those, and don't go looking for problems.",
  "File it and carry on with your task. If the doc covers code you're changing in this task, update it in the same change instead.",
  "action \"suggest\": file is the doc's repo path; kind is wrong, missing or stale; claim is one line saying what the doc should say or why it is wrong; evidence quotes the doc's line and what you saw that contradicts it (a code location, or a command and its output).",
  'When the file already has suggestions the call lists them and files nothing: call again with same_as set to the one that says the same thing, or same_as "none" for a different one.',
  'action "resolve" with id is only for the person\'s /docfix apply prompt, after the edit is made.',
].join(" ");

/** The input schema as JSON Schema, for harnesses that take one. */
export const INPUT_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["suggest", "resolve"] },
    file: { type: "string", description: "Repo-relative path of the doc (suggest)." },
    kind: { type: "string", enum: [...KINDS], description: "suggest" },
    claim: {
      type: "string",
      description: "One line: what the doc should say, or why it is wrong (suggest).",
    },
    evidence: {
      type: "string",
      description:
        "The doc's line and what you saw that contradicts it: a code location, or a command and its output (suggest).",
    },
    same_as: {
      type: "string",
      description: 'Id of the listed suggestion this repeats, or "none" for a new one (suggest).',
    },
    id: { type: "string", description: "The suggestion to resolve (resolve)." },
  },
  required: ["action"],
} as const;

export type Input = {
  action?: string;
  file?: string;
  kind?: string;
  claim?: string;
  evidence?: string;
  same_as?: string;
  id?: string;
};

const CLAIM_MAX = 300;
const EVIDENCE_MAX = 4000;
const SLUG_MAX = 48;

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** Lowercase words joined by `-`, cut at a word boundary within `max`. */
export function slugify(text: string, max = SLUG_MAX): string {
  const full = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (full.length <= max) return full || "doc";
  const cut = full.slice(0, max + 1);
  const boundary = cut.lastIndexOf("-");
  return (boundary > 0 ? cut.slice(0, boundary) : full.slice(0, max)) || "doc";
}

/** `<target>--<claim>`, the target's folders folded so the id is one file name. */
export function suggestionId(target: string, claim: string, taken: ReadonlySet<string>): string {
  const base = `${slugify(target.replace(/\.md$/i, ""), 40)}--${slugify(claim)}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export const fileName = (id: string) => `${id}.md`;

/**
 * `file`'s repo-relative spelling, or why it can't be a target: git tracking is the
 * harness's check.
 */
export type Target = { ok: true; target: string } | { ok: false; error: string };

export function normalizeTarget(file: string, root: string): Target {
  let path = file.trim().replace(/\\/g, "/");
  const top = root.replace(/\/+$/, "");
  if (path.startsWith(`${top}/`)) path = path.slice(top.length + 1);
  path = path.replace(/^\.\//, "");
  if (!path) return { ok: false, error: "file is empty" };
  if (path.startsWith("/")) return { ok: false, error: `${file} is outside this repo` };
  if (path.split("/").includes("..")) return { ok: false, error: `${file} leaves the repo` };
  if (!/\.md$/i.test(path)) return { ok: false, error: `${path} is not a Markdown file` };
  return { ok: true, target: path };
}

// --- Reading a doc ---------------------------------------------------------------

/** Commands whose file arguments a shell call reads whole or in part. */
const READERS = new Set(["cat", "head", "tail", "sed", "less", "more", "bat", "nl", "glow"]);

/**
 * The Markdown files a shell command reads with a plain reader, as written in it:
 * `cd docs && sed -n 1,80p layout.md` gives `layout.md`.
 */
export function readsInCommand(command: string): string[] {
  const paths: string[] = [];
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const words = segment
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/^["']|["']$/g, ""));
    if (!READERS.has(words[0] ?? "")) continue;
    paths.push(...words.slice(1).filter((word) => !word.startsWith("-") && /\.md$/i.test(word)));
  }
  return [...new Set(paths)];
}

/**
 * The repo-relative docs `paths` name, a relative one read against `cwd`; a path outside the
 * repo or not Markdown is left out.
 */
export function docTargets(paths: readonly string[], cwd: string, root: string): string[] {
  const targets = paths.flatMap((path) => {
    const full = path.startsWith("/") ? path : `${cwd.replace(/\/+$/, "")}/${path}`;
    const target = normalizeTarget(full, root);
    return target.ok ? [target.target] : [];
  });
  return [...new Set(targets)];
}

/**
 * What the model reads the first time a session reads a doc: the tool, while the doc is in
 * front of it. It files nothing by itself; the bar for proof stays the tool's.
 */
export const readReminder = (targets: readonly string[]) =>
  `You read ${targets.join(", ")}. If this session shows ${targets.length > 1 ? "one of them" : "it"} is wrong, misses a trap you hit, or describes something gone, and that isn't part of your change, file it with the ${TOOL_NAME} tool, citing what you saw. Otherwise ignore this.`;

// --- The file ------------------------------------------------------------------

const EVIDENCE_HEADING = "## Evidence";

export function serialize(s: Suggestion): string {
  const front = [
    "---",
    `id: ${s.id}`,
    `target: ${s.target}`,
    `kind: ${s.kind}`,
    `status: ${s.status}`,
    `created: ${s.created}`,
    `updated: ${s.updated}`,
    ...(s.dismissed ? [`dismissed: ${s.dismissed}`] : []),
    `sessions: ${s.sessions.join(", ")}`,
    "---",
  ];
  const evidence = s.evidence.flatMap((e) => ["", `### ${e.at} · ${e.session}`, "", e.text.trim()]);
  return [...front, "", s.claim, "", EVIDENCE_HEADING, ...evidence, ""].join("\n");
}

const isKind = (value: string): value is Kind => (KINDS as readonly string[]).includes(value);

/** The suggestion `text` holds, or null for anything this version didn't write. */
export function parse(text: string): Suggestion | null {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!match) return null;
  const fields = new Map<string, string>();
  for (const line of (match[1] ?? "").split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) fields.set(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  const body = match[2] ?? "";
  const cut = body.indexOf(`\n${EVIDENCE_HEADING}`);
  const claim = oneLine(cut < 0 ? body : body.slice(0, cut));
  const id = fields.get("id") ?? "";
  const target = fields.get("target") ?? "";
  const kind = fields.get("kind") ?? "";
  const status = fields.get("status");
  if (!id || !target || !claim || !isKind(kind)) return null;
  if (status !== "open" && status !== "dismissed") return null;
  const evidence: Evidence[] = [];
  if (cut >= 0) {
    const blocks = body.slice(cut + EVIDENCE_HEADING.length + 1).split(/\n### /);
    for (const block of blocks.slice(1)) {
      const newline = block.indexOf("\n");
      const head = newline < 0 ? block : block.slice(0, newline);
      const [at = "", session = ""] = head.split(" · ");
      evidence.push({
        at: at.trim(),
        session: session.trim(),
        text: block.slice(newline + 1).trim(),
      });
    }
  }
  return {
    id,
    target,
    kind,
    claim,
    status,
    created: fields.get("created") ?? "",
    updated: fields.get("updated") ?? "",
    dismissed: fields.get("dismissed") ?? "",
    sessions: (fields.get("sessions") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    evidence,
  };
}

// --- Reading evidence ----------------------------------------------------------

/** What a suggestion points at: `{"kind":"path","value":"modules/a.nix"}`. */
export type Citation = { kind: string; value: string };

export type EvidencePart =
  | { kind: "text"; text: string }
  /** A paragraph that opens with a label an agent writes, such as `Why the repo didn't say it:`. */
  | { kind: "labelled"; label: string; text: string }
  | { kind: "citations"; items: Citation[] };

export type EvidenceView = {
  when: string;
  /** The harness that filed it, `pi` or `claude`: the session id is not for reading. */
  by: string;
  /** Filed by a migration of an older memory, not by an agent that hit the gap. */
  isMigrated: boolean;
  parts: EvidencePart[];
};

/** Labels an agent opens a paragraph with; the text after the colon is the paragraph. */
const LABELS = ["Why the repo didn't say it"];
const MIGRATED = /^Migrated from [\w-]+ memory `[^`]*`\.?$/;

function citationsOf(line: string): Citation[] | undefined {
  const match = /^Citations:\s*(\[.*\])\s*$/.exec(line.trim());
  if (!match) return undefined;
  try {
    const raw: unknown = JSON.parse(match[1] ?? "");
    if (!Array.isArray(raw)) return undefined;
    const items = raw.flatMap((item): Citation[] => {
      if (typeof item === "string") return [{ kind: "ref", value: item }];
      if (typeof item !== "object" || item === null) return [];
      const { kind, value } = item as Record<string, unknown>;
      if (value === undefined) return [];
      const text = typeof value === "string" ? value : JSON.stringify(value);
      return [{ kind: typeof kind === "string" && kind ? kind : "ref", value: text }];
    });
    return items.length > 0 ? items : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Evidence text in parts: paragraphs, the labelled ones named, a `Citations:` JSON line as a
 * list, and a `Migrated from` line dropped for the flag.
 */
export function readEvidence(e: Evidence): EvidenceView {
  const parts: EvidencePart[] = [];
  let isMigrated = false;
  for (const paragraph of e.text.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = paragraph.split("\n");
    const at = lines.findIndex((line) => citationsOf(line) !== undefined);
    const before = (at < 0 ? lines : lines.slice(0, at)).join("\n").trim();
    if (MIGRATED.test(before)) isMigrated = true;
    else if (before) {
      const label = LABELS.find((l) => before.startsWith(`${l}:`));
      parts.push(
        label
          ? { kind: "labelled", label, text: before.slice(label.length + 1).trim() }
          : { kind: "text", text: before },
      );
    }
    const items = at < 0 ? undefined : citationsOf(lines[at] ?? "");
    if (items) parts.push({ kind: "citations", items });
    const after =
      at < 0
        ? ""
        : lines
            .slice(at + 1)
            .join("\n")
            .trim();
    if (after) parts.push({ kind: "text", text: after });
  }
  const by = e.session.includes(":") ? e.session.slice(0, e.session.indexOf(":")) : "";
  return { when: e.at.slice(0, 10), by, isMigrated, parts };
}

/** A heading and what is under it: lines of text, or what a suggestion points at. */
export type EvidenceBlock = { heading: string; lines: string[]; items?: Citation[] };

/** Text longer than this is set one sentence to a line, so it is not a wall. */
const WALL = 140;

/**
 * `text` in its own lines, a long one cut after each sentence. A full stop only ends a sentence
 * before a capital letter, so `PYTHONPATH=. uv run` and `a.md` stay whole.
 */
export function sentences(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line) => (line.length > WALL ? line.split(/(?<=[.!?])\s+(?=[A-Z"`“])/) : [line]));
}

/**
 * One piece of evidence as blocks a person scans: the reason, the details, then what it points
 * at, each under a heading. A one-paragraph piece has no heading to give.
 */
export function evidenceBlocks(view: EvidenceView): EvidenceBlock[] {
  const isStructured = view.parts.length > 1 || view.parts.some((p) => p.kind !== "text");
  const heading = (label: string) => (isStructured ? label : "");
  const why = view.parts.flatMap((p) =>
    p.kind === "labelled" ? [{ heading: p.label, lines: sentences(p.text) }] : [],
  );
  const details = view.parts.flatMap((p) =>
    p.kind === "text" ? [{ heading: heading("Details"), lines: sentences(p.text) }] : [],
  );
  const points = view.parts.flatMap((p) =>
    p.kind === "citations" ? [{ heading: "Points at", lines: [], items: p.items }] : [],
  );
  return [...why, ...details, ...points];
}

// --- A call ----------------------------------------------------------------------

export type Call = {
  input: Input;
  /** Every suggestion in the store. */
  existing: readonly Suggestion[];
  /** `normalizeTarget`'s answer with the harness's git check folded in; suggest only. */
  target?: Target;
  now: string;
  /** `<harness>:<session id>`. */
  session: string;
};

export type Outcome =
  | { kind: "error"; text: string }
  /** Nothing written; the model is to call again. */
  | { kind: "answer"; text: string }
  | { kind: "write"; suggestion: Suggestion; text: string; isNew: boolean }
  | { kind: "remove"; suggestion: Suggestion; text: string };

export const seen = (s: Suggestion) => Math.max(1, s.sessions.length);

/** `3×` once a second session has hit the gap; nothing for the first, which every row has. */
export const repeats = (s: Suggestion) => (seen(s) > 1 ? `${seen(s)}×` : "");

/** One piece of evidence's line, `2026-11-05  pi  migrated`: when, by which harness, how filed. */
export const evidenceLabel = (view: EvidenceView) =>
  [view.when, view.by, view.isMigrated ? "migrated" : ""].filter(Boolean).join("  ");

const describe = (s: Suggestion) =>
  s.status === "dismissed"
    ? `- ${s.id} (dismissed ${s.dismissed.slice(0, 10)}): ${s.claim}`
    : `- ${s.id} (open, seen ${seen(s)}×): ${s.claim}`;

export function plan(call: Call): Outcome {
  const { input, existing } = call;
  if (input.action === "resolve") {
    const id = (input.id ?? "").trim();
    const found = existing.find((s) => s.id === id);
    if (!id) return { kind: "error", text: "resolve needs the id of the suggestion" };
    if (!found) return { kind: "error", text: `no suggestion with id ${id}` };
    return { kind: "remove", suggestion: found, text: `Resolved ${id}.` };
  }
  if (input.action !== "suggest")
    return { kind: "error", text: 'action is "suggest" or "resolve"' };

  const target: Target = call.target ?? { ok: false, error: "file is empty" };
  if (!target.ok) return { kind: "error", text: target.error };
  const kind = (input.kind ?? "").trim();
  if (!isKind(kind)) return { kind: "error", text: `kind is one of ${KINDS.join(", ")}` };
  const claim = oneLine(input.claim ?? "");
  if (!claim) return { kind: "error", text: "claim is empty" };
  if (claim.length > CLAIM_MAX)
    return {
      kind: "error",
      text: `claim is ${claim.length} chars; keep it under ${CLAIM_MAX} and put the rest in evidence`,
    };
  const evidenceText = (input.evidence ?? "").trim().slice(0, EVIDENCE_MAX);
  if (!evidenceText)
    return {
      kind: "error",
      text: "evidence is empty: cite the doc's line and what contradicts it",
    };
  const evidence: Evidence = { at: call.now, session: call.session, text: evidenceText };

  const sameAs = (input.same_as ?? "").trim();
  const siblings = existing.filter((s) => s.target === target.target);
  if (sameAs && sameAs !== "none") {
    const repeat = existing.find((s) => s.id === sameAs);
    if (!repeat) return { kind: "error", text: `no suggestion with id ${sameAs}` };
    if (repeat.status === "dismissed")
      return {
        kind: "answer",
        text: `${repeat.id} was dismissed on ${repeat.dismissed.slice(0, 10)}; not filed again. Carry on with your task.`,
      };
    const isNewSession = !repeat.sessions.includes(call.session);
    const isNewEvidence = !repeat.evidence.some((e) => e.text === evidenceText);
    const bumped: Suggestion = {
      ...repeat,
      updated: call.now,
      sessions: isNewSession ? [...repeat.sessions, call.session] : repeat.sessions,
      evidence: isNewEvidence ? [...repeat.evidence, evidence] : repeat.evidence,
    };
    return {
      kind: "write",
      suggestion: bumped,
      isNew: false,
      text: `Added to ${repeat.id}: seen ${seen(bumped)}×, /docfix to review. Carry on with your task.`,
    };
  }
  if (!sameAs && siblings.length > 0)
    return {
      kind: "answer",
      text: [
        `Not filed yet: ${target.target} already has these suggestions:`,
        ...siblings.map(describe),
        `Call again with same_as: "<id>" if one says the same thing, or same_as: "none" if yours is different.`,
      ].join("\n"),
    };

  const suggestion: Suggestion = {
    id: suggestionId(target.target, claim, new Set(existing.map((s) => s.id))),
    target: target.target,
    kind,
    claim,
    status: "open",
    created: call.now,
    updated: call.now,
    dismissed: "",
    sessions: [call.session],
    evidence: [evidence],
  };
  return {
    kind: "write",
    suggestion,
    isNew: true,
    text: `Filed ${suggestion.id}: seen 1×, /docfix to review. Carry on with your task.`,
  };
}

// --- Review ----------------------------------------------------------------------

/** The open suggestions as /docfix lists them: by doc, the most seen first. */
export const openQueue = (all: readonly Suggestion[]) =>
  all
    .filter((s) => s.status === "open")
    .sort(
      (a, b) =>
        a.target.localeCompare(b.target) || seen(b) - seen(a) || b.updated.localeCompare(a.updated),
    );

export const statusText = (open: number) => (open > 0 ? `docs ${open}` : undefined);

export const dismiss = (s: Suggestion, now: string): Suggestion => ({
  ...s,
  status: "dismissed",
  dismissed: now,
  updated: now,
});

export const reopen = (s: Suggestion, now: string): Suggestion => ({
  ...s,
  status: "open",
  dismissed: "",
  updated: now,
});

/** What the person set a row to in /docfix; a row with none is skipped. */
export type Choice = "apply" | "dismiss";

/** Sets each of `ids` to `choice`, or skips them all when every one already has it. */
export function toggleChoice(
  choices: Readonly<Record<string, Choice>>,
  ids: readonly string[],
  choice: Choice | undefined,
): Record<string, Choice> {
  const next = { ...choices };
  const isSet = choice !== undefined && ids.every((id) => next[id] === choice);
  for (const id of ids)
    if (choice === undefined || isSet) delete next[id];
    else next[id] = choice;
  return next;
}

/** `apply 2, dismiss 1`, or empty when every row is skipped. */
export function choiceSummary(choices: Iterable<Choice | undefined>): string {
  const counts = { apply: 0, dismiss: 0 };
  for (const c of choices) if (c) counts[c] += 1;
  return (["apply", "dismiss"] as const)
    .filter((c) => counts[c] > 0)
    .map((c) => `${c} ${counts[c]}`)
    .join(", ");
}

/** The picked suggestions, one group per doc, in queue order. */
export function byTarget(picked: readonly Suggestion[]): [string, Suggestion[]][] {
  const groups = new Map<string, Suggestion[]>();
  for (const s of picked) groups.set(s.target, [...(groups.get(s.target) ?? []), s]);
  return [...groups];
}

/** Where a checkout's suggestions are, as the agent reaches them from the repo root. */
export const STORE_REF = `.agents/store/${STORE_DIR}`;

/**
 * The prompt an apply drafts for the agent, which the person reads before sending: each doc
 * under its path, each suggestion's claim then the file holding its evidence. The evidence stays
 * in that file, which the agent reads; the id is not repeated because it is the file's name.
 */
export function applyPrompt(picked: readonly Suggestion[]): string {
  const docs = byTarget(picked).flatMap(([target, list]) => [
    "",
    target,
    ...list.flatMap((s) => [
      `- ${s.kind}: ${s.claim}${seen(s) > 1 ? ` (seen ${seen(s)}×)` : ""}`,
      `  ${STORE_REF}/${fileName(s.id)}`,
    ]),
  ]);
  return [
    `Apply these docfix suggestions. The file under each claim holds its evidence: read it first.`,
    ...docs,
    "",
    "For each one:",
    "1. Check the claim against this repo's code. One that no longer holds needs no edit.",
    "2. Edit the doc as it stands now, in its existing structure and voice. For a stale plan, delete or trim what is finished or gone.",
    "3. Search once for the outdated wording in the docs beside it (its folder, or the skill or plugin it belongs to). Where another doc states the same fact, fix it there too instead of filing a suggestion. Change only that fact, and leave records of the past, such as a changelog, as they are.",
    `4. Call ${TOOL_NAME} with action "resolve" and the id (the file's name without .md), whether you applied it or found it no longer true.`,
    "",
    "Name every doc you changed beyond the ones above. Anything else you notice gets filed with docfix as usual. Don't commit.",
  ].join("\n");
}
