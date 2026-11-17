/**
 * docfix's harness-free half: the suggestion file, what a `docfix` call does to
 * the queue, and the text both harnesses show the model and the person.
 *
 * A suggestion says a doc no longer matches reality. The agent files it and
 * carries on; the person reviews the queue with /docfix, and an apply hands the
 * edit back to the session's agent, drafted against the file as it stands then.
 * Repeats bump one suggestion's session list instead of adding another, so the
 * count says how often agents tripped on the same gap.
 */

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
  "File a suggestion that a doc in this repo no longer matches reality, instead of editing it.",
  "Use this when you notice, while doing something else, that a doc doesn't match reality: it contradicts the code or how things behave, it's missing a trap you just hit, or it describes something gone or finished (a removed feature, a completed or abandoned plan).",
  "File it and carry on. If the doc covers code you're changing in this task, update it in the same change instead; this tool is for docs outside your change.",
  "Don't go looking for problems, and don't file preferences or task status.",
  'action "suggest": file is a git-tracked Markdown file (AGENTS.md, CLAUDE.md, docs/**, a README); kind is wrong, missing or stale; claim is one line saying what the doc should say or why it is wrong; evidence cites the doc\'s line and what contradicts it (a code location, or a command and its output).',
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
        "The doc's line and what contradicts it: a code location, or a command and its output (suggest).",
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
 * The repo-relative spelling of `file`, or why it can't be a target. Whether git
 * tracks it is the harness's check; this only rules on the spelling.
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

/** One piece of evidence as a person reads it: when, who, and the text in parts. */
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

/** The citations a `Citations: [...]` line holds, or undefined when it isn't that. */
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
 * Evidence text in parts: paragraphs, the labelled ones named, and a `Citations:` JSON line as a
 * list. The migration's own first line is dropped for a flag. Text this doesn't recognise stays
 * as it is, a paragraph.
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

/** A dismissed suggestion open again: what an undo does. */
export const reopen = (s: Suggestion, now: string): Suggestion => ({
  ...s,
  status: "open",
  dismissed: "",
  updated: now,
});

/** The picked suggestions, one group per doc, in queue order. */
export function byTarget(picked: readonly Suggestion[]): [string, Suggestion[]][] {
  const groups = new Map<string, Suggestion[]>();
  for (const s of picked) groups.set(s.target, [...(groups.get(s.target) ?? []), s]);
  return [...groups];
}

/** Where a checkout's suggestions are, as the agent reaches them from the repo root. */
export const STORE_REF = `.agents/store/${STORE_DIR}`;

/**
 * The prompt an apply drafts for the agent: every picked suggestion by id, grouped by doc.
 * Evidence stays in the suggestion's own file, which the agent reads; only the one-line
 * claim is repeated, so the person can see what they are about to send.
 */
export function applyPrompt(picked: readonly Suggestion[]): string {
  const docs = byTarget(picked).flatMap(([target, list]) => [
    "",
    target,
    ...list.map((s) => `- ${s.id} (${s.kind}, seen ${seen(s)}×): ${s.claim}`),
  ]);
  return [
    `Apply these docfix suggestions. Each id is a file, ${STORE_REF}/<id>.md, holding its claim and evidence: read it first.`,
    ...docs,
    "",
    "Check each claim against this repo's code first; one that no longer holds needs no edit.",
    "Draft each edit against the file as it stands now, in its existing structure and voice. For a stale plan, delete or trim what is finished or gone.",
    "Don't commit.",
    `Then call ${TOOL_NAME} with action "resolve" for each id, applied or found no longer true.`,
  ].join("\n");
}
