/**
 * Drafting a Linear issue and filing it: what both clients do behind the draft they show.
 * A client gives it a `Host` (how to call Linear, ask a model, and keep the draft) and draws
 * the `Form` it fills. No imports, no Node or DOM APIs.
 */

/** One choice of a field: what Linear is sent, and what the person reads. */
export type Option = { value: string; label: string };

/** An open issue that already covers the seed, and the comment proposed for it. */
export type Duplicate = {
  issue: string;
  title: string;
  comment: string;
  /** How that issue's own description starts, to tell whether it is the same thing. */
  about?: string;
  /** Its team's key and how far along it is, in Linear's words for a status's kind. */
  team?: string;
  status?: string;
};

/** What a draft is written from: something flagged for the person, or their own note. */
export type Seed = { kind: "insight" | "note"; text: string };

export type Form = {
  /** Tells a late duplicate check whether its draft is still the one open. */
  draftId: string;
  phase: "drafting" | "ready" | "filing" | "failed";
  /** While drafting, what is being waited for: Linear's teams, then the model's draft. */
  stage: "linear" | "writing";
  error: string | null;
  seed: Seed;
  /** Appended to the description when filed: repository, branch and session. */
  source: string;
  teams: Option[];
  statuses: Option[];
  labels: Option[];
  projects: Option[];
  team: string;
  title: string;
  /** Bumped when a title field is submitted, for a client that has to remount it. */
  titleRevision: number;
  description: string;
  priority: number;
  state: string;
  labelIds: string[];
  project: string;
  duplicate: Duplicate | null;
  isCheckingDuplicates: boolean;
  /**
   * When what Enter does last changed under the person: the draft arrived, or a duplicate was
   * found. A client ignores an Enter that comes right after, as one meant for what was there.
   */
  settledAt: number;
};

/** What the last filed issue used, the fallback for the next draft. */
export type Last = { team: string; priority: number; open?: boolean };

/** An issue filed, or a comment left on one. */
export type Filed = { key: string; title: string; url: string };

/** Where a draft was started: named in the brief, and in the line filed under the description. */
export type Origin = {
  cwd: string;
  /** `owner/repo` from the remote, when there is one. */
  repo?: string;
  branch: string;
  sessionId: string;
  /** The conversation so far, oldest first. */
  messages: { role: string; text: string }[];
};

export type Host = {
  now(): number | Promise<number>;
  /**
   * Calls a Linear tool and gives its answer, parsed when it is JSON. Throws with the server's
   * words on an error, and with `NO_LINEAR` when no server that can file is connected.
   */
  linear(tool: string, args: Record<string, unknown>): Promise<unknown>;
  /** One model call beside the conversation: no tools, no turn. */
  complete(ask: {
    system: string;
    prompt: string;
    maxTokens: number;
  }): Promise<{ text: string } | { error: string }>;
  origin(): Promise<Origin>;
  last(): Promise<Last | undefined>;
  remember(last: Last): Promise<void>;
  read(): Form | null | Promise<Form | null>;
  /** Replaces the draft with what `change` makes of the one open now. */
  update(change: (current: Form | null) => Form | null): void | Promise<void>;
  /** For what went wrong where nobody waits for it, such as the duplicate check. */
  log(message: string): void;
};

export const NO_LINEAR = "Linear MCP unavailable or signed out, re-authenticate with /mcp";

export const PRIORITIES: Option[] = [
  { value: "1", label: "Urgent" },
  { value: "2", label: "High" },
  { value: "3", label: "Medium" },
  { value: "4", label: "Low" },
  { value: "0", label: "No priority" },
];

const FALLBACK_TEAM = "MSC";
const RECENT_MESSAGES = 8;
const MESSAGE_CHARS = 2000;
// Issues each search term finds, and candidates the duplicate check weighs at most.
const SEARCH_HITS = 10;
const CANDIDATES = 20;
const CANDIDATE_CHARS = 300;
const CLOSED = ["completed", "canceled", "duplicate"];

export type TeamOptions = {
  statuses: Option[];
  labels: Option[];
  projects: Option[];
  todo: string;
};

/** What the drafting model answers, before names are resolved to Linear ids. */
type Draft = {
  team: string;
  title: string;
  description: string;
  priority: number;
  labels?: string[];
  search?: string[];
};

/** What the duplicate check answers. */
type Verdict = { duplicate: { issue: string; comment: string } | null };

type Issue = { id: string; title: string; statusType: string; team: string; description?: string };

// No tools and no subagent: a subagent's report would land in the session and start a turn.
const SYSTEM = `You draft a Linear issue for the user to deal with later, from one of two seeds: an <insight> that a side agent flagged while it watched their session, or a <note> the user typed with /linear. The seed is what to file; the recent conversation is context for it. An empty <note> means: file what the recent conversation is about. The user reviews and edits your draft before it is created.

- team: the key of the team from <teams> that the repository and topic belong to; when unsure, the <defaults> team.
- title: short and specific, imperative, under 80 characters.
- description: Linear markdown that reads at a glance. Prefer structure to prose: one sentence saying what to do and why, then the details as bullets, never as a paragraph. Use the richer forms only when the content has that shape:
  - a table when comparing options, listing items that share attributes, or mapping before to after
  - a checklist (- [ ]) when the work splits into separate steps
  No diagrams: the draft cannot draw them.
  Then, leaving out a line you have nothing concrete for:
  **Where:** the file paths, symbols or commands named in the seed or conversation, in backticks
  **Done when:** one line saying how to tell it is finished
  No headings, no story of the session, no restating the title; about 120 words at most, a table not counted. Do not add a source or session line; it is appended for you.
- priority: 1 urgent, 2 high, 3 medium, 4 low. Reserve 1 for things that are breaking now; when unsure, the <defaults> priority.
- labels: names from <labels> that clearly fit, usually none.
- search: two or three short phrases, one to three words each, that an existing issue about the same problem would contain in its title or description; used to look for duplicates.
- Never copy secrets, tokens, credentials or .env contents into the draft.

Answer with one JSON object and nothing else:
{"team": "...", "title": "...", "description": "...", "priority": 4, "labels": [], "search": []}`;

const DUPLICATE_SYSTEM = `You check whether an open Linear issue already covers a <draft> the user is about to file. The <candidates> came from a keyword search, so most are unrelated. Only call one a duplicate when it is about the same problem or change, not merely the same area.

When one is, answer its key and a one-or-two-sentence comment for it adding what the draft knows that the issue does not. Never copy secrets, tokens, credentials or .env contents.

Answer with one JSON object and nothing else:
{"duplicate": null} or {"duplicate": {"issue": "KEY-1", "comment": "..."}}`;

export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const oneLine = (text: string) => text.replace(/\s*\n\s*/g, " ");

/** `owner/repo` from a git remote URL, or undefined when it names none. */
export const repoName = (remote: string) => /[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/.exec(remote)?.[1];

/** The JSON object in a model reply, which may wrap it in prose or a fence. */
function replyJson<T>(text: string): T {
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as T;
}

/** The label a field's value has among its options. */
export const labelOf = (options: readonly Option[], value: string) =>
  options.find((o) => o.value === value)?.label;

/** The description as it is filed: with the line saying where it came from. */
export const filedDescription = (f: Pick<Form, "description" | "source">) =>
  f.source ? `${f.description.trimEnd()}\n\n---\n${f.source}` : f.description;

/** The drafter's brief: the seed with where it came from, and the trailing source line. */
function brief(seed: Seed, o: Origin): { text: string; source: string } {
  const recent = o.messages
    .filter((m) => m.text.trim() !== "")
    .slice(-RECENT_MESSAGES)
    .map((m) => {
      const text = m.text.length > MESSAGE_CHARS ? `${m.text.slice(0, MESSAGE_CHARS)}…` : m.text;
      return `<${m.role}>\n${text}\n</${m.role}>`;
    })
    .join("\n");
  const name = o.repo ?? o.cwd.split("/").pop() ?? o.cwd;
  const text = [
    `<${seed.kind}>\n${seed.text}\n</${seed.kind}>`,
    `<source>\ndirectory: ${o.cwd}\nrepository: ${name}\nbranch: ${o.branch}\n</source>`,
    `<recent_conversation>\n${recent}\n</recent_conversation>`,
  ].join("\n\n");
  return { text, source: `Source: \`${name}\` · ${o.branch} · session ${o.sessionId}` };
}

const blankForm = (draftId: string, seed: Seed): Form => ({
  draftId,
  phase: "drafting",
  stage: "linear",
  error: null,
  seed,
  source: "",
  teams: [],
  statuses: [],
  labels: [],
  projects: [],
  team: "",
  title: "",
  titleRevision: 0,
  description: "",
  priority: 0,
  state: "",
  labelIds: [],
  project: "",
  duplicate: null,
  isCheckingDuplicates: false,
  settledAt: 0,
});

/** A team's statuses, labels and projects by its key: fetched once, kept by the client. */
export type TeamCache = Map<string, Promise<TeamOptions>>;

/** The draft's own verbs, bound to one client's `Host`. */
export function drafter(host: Host, teamOptions: TeamCache = new Map()) {
  const patch = (change: Partial<Form>) => host.update((cur) => cur && { ...cur, ...change });
  const call = <T>(tool: string, args: Record<string, unknown>) =>
    host.linear(tool, args) as Promise<T>;

  function loadTeam(team: string): Promise<TeamOptions> {
    let options = teamOptions.get(team);
    if (!options) {
      options = (async () => {
        type Named = {
          id: string;
          name: string;
          type?: string;
          parent?: string | null;
          archivedAt?: string | null;
        };
        const [statuses, labels, projects] = await Promise.all([
          call<Named[]>("list_issue_statuses", { team }),
          call<{ labels: Named[] }>("list_issue_labels", { team, limit: 250 }),
          call<{ projects: Named[] }>("list_projects", { team, limit: 50 }),
        ]);
        const todo =
          statuses.find((s) => s.name === "Todo") ?? statuses.find((s) => s.type === "unstarted");
        return {
          statuses: statuses.map((s) => ({ value: s.id, label: s.name })),
          labels: labels.labels
            .filter((l) => !l.archivedAt)
            .map((l) => ({ value: l.id, label: l.parent ? `${l.parent}/${l.name}` : l.name })),
          projects: [
            { value: "", label: "No project" },
            ...projects.projects.map((p) => ({ value: p.id, label: p.name })),
          ],
          todo: todo?.id ?? statuses[0]?.id ?? "",
        };
      })();
      teamOptions.set(team, options);
      options.catch(() => teamOptions.delete(team));
    }
    return options;
  }

  /** Open issues anywhere in the workspace that any of `terms` finds, most hits first. */
  async function searchOpen(terms: string[]): Promise<Issue[]> {
    const found = await Promise.all(
      terms.map((query) =>
        call<{ issues: Issue[] }>("list_issues", {
          query,
          limit: SEARCH_HITS,
          fields: ["title", "statusType", "team", "description"],
        }).then(
          (r) => r.issues,
          () => [] as Issue[],
        ),
      ),
    );
    const hits = new Map<string, { issue: Issue; count: number }>();
    for (const issue of found.flat()) {
      if (CLOSED.includes(issue.statusType)) continue;
      const seen = hits.get(issue.id);
      hits.set(issue.id, { issue, count: (seen?.count ?? 0) + 1 });
    }
    return [...hits.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, CANDIDATES)
      .map((h) => h.issue);
  }

  /**
   * Looks for an open issue covering the draft `draftId` and offers commenting on it. Runs
   * after the form is ready, so a slow search never holds up Create; a result for a draft that
   * has since been filed or discarded is dropped.
   */
  async function checkDuplicates(
    draftId: string,
    draft: Pick<Draft, "title" | "description" | "search">,
  ) {
    const settle = async (duplicate: Duplicate | null) => {
      const now = await host.now();
      await host.update((cur) =>
        cur?.draftId === draftId
          ? {
              ...cur,
              duplicate,
              isCheckingDuplicates: false,
              settledAt: duplicate ? now : cur.settledAt,
            }
          : cur,
      );
    };
    try {
      const terms = (draft.search ?? []).filter((t) => t.trim() !== "").slice(0, 3);
      const candidates = await searchOpen(terms.length > 0 ? terms : [draft.title]);
      if (candidates.length === 0) return await settle(null);
      const reply = await host.complete({
        system: DUPLICATE_SYSTEM,
        maxTokens: 1000,
        prompt: [
          `<draft>\n${draft.title}\n\n${draft.description}\n</draft>`,
          `<candidates>\n${candidates
            .map((i) => {
              const about = oneLine(i.description ?? "").slice(0, CANDIDATE_CHARS);
              return `${i.id} [${i.team}] ${i.title}${about && `\n  ${about}`}`;
            })
            .join("\n")}\n</candidates>`,
        ].join("\n\n"),
      });
      if ("error" in reply) return await settle(null);
      const v = replyJson<Verdict>(reply.text).duplicate;
      const dup = v && candidates.find((i) => i.id === v.issue);
      const about = oneLine(dup?.description ?? "").slice(0, CANDIDATE_CHARS);
      await settle(
        dup && v
          ? {
              issue: dup.id,
              title: dup.title,
              comment: v.comment,
              team: dup.team,
              status: dup.statusType,
              ...(about && { about }),
            }
          : null,
      );
    } catch (error) {
      host.log(`linear-issue: duplicate check failed: ${errorText(error)}`);
      await settle(null);
    }
  }

  /** Drafts from the open form's seed and fills it. */
  async function fill(draftId: string, seed: Seed) {
    const mine = async () => (await host.read())?.draftId === draftId;
    const fail = async (error: string) => {
      if (await mine()) await patch({ phase: "failed", error });
    };
    try {
      const b = brief(seed, await host.origin());
      await patch({ source: b.source });
      type User = { teams: { name: string; key: string }[] };
      const user = await call<User>("get_user", { query: "me" });
      const teams = user.teams.map((t) => ({ value: t.key, label: `${t.name} (${t.key})` }));
      const last = await host.last().catch(() => undefined);
      const fallback =
        [last?.team, FALLBACK_TEAM].find((k) => teams.some((t) => t.value === k)) ??
        teams[0]?.value ??
        "";
      const usual = labelOf(PRIORITIES, String(last?.priority ?? 4)) ?? "Low";
      const guess = await loadTeam(fallback);
      if (!(await mine())) return;
      await patch({ stage: "writing" });

      const reply = await host.complete({
        system: SYSTEM,
        maxTokens: 4000,
        prompt: [
          b.text,
          `<defaults>\nteam: ${fallback}\npriority: ${usual}\n</defaults>`,
          `<teams>\n${teams.map((t) => t.label).join("\n")}\n</teams>`,
          `<labels>\n${guess.labels.map((l) => l.label).join("\n")}\n</labels>`,
        ].join("\n\n"),
      });
      if ("error" in reply) return await fail(`drafting failed: ${reply.error}`);
      const d = replyJson<Draft>(reply.text);

      const team = teams.some((t) => t.value === d.team) ? d.team : fallback;
      const options = await loadTeam(team);
      const labelIds = (d.labels ?? []).flatMap((name) => {
        const l = options.labels.find((o) => o.label === name || o.label.endsWith(`/${name}`));
        return l ? [l.value] : [];
      });
      if (!(await mine())) return;
      await patch({
        settledAt: await host.now(),
        phase: "ready",
        error: null,
        teams,
        statuses: options.statuses,
        labels: options.labels,
        projects: options.projects,
        team,
        title: oneLine(d.title),
        description: d.description,
        priority: PRIORITIES.some((p) => p.value === String(d.priority)) ? d.priority : 0,
        state: options.todo,
        labelIds,
        project: "",
        isCheckingDuplicates: true,
      });
      void checkDuplicates(draftId, d);
    } catch (error) {
      await fail(errorText(error));
    }
  }

  return {
    /**
     * A new draft for `seed`, which drafting then fills; undefined while another is open, which
     * the client shows again instead. A failed draft gives way to a new one.
     */
    async start(seed: Seed): Promise<Form | undefined> {
      const open = await host.read();
      if (open && open.phase !== "failed") return undefined;
      const now = await host.now();
      const f = blankForm(`${now}-${Math.random().toString(36).slice(2)}`, seed);
      await host.update(() => f);
      // Drafting outlives the call, so it isn't awaited.
      void fill(f.draftId, seed);
      return f;
    },

    /** Drafts a failed draft again, from the same seed. */
    async retry() {
      const f = await host.read();
      if (!f || f.phase !== "failed") return;
      await patch({ phase: "drafting", stage: "linear", error: null });
      void fill(f.draftId, f.seed);
    },

    /** Moves the draft to `team`: its statuses and projects, and the labels it has by name. */
    async switchTeam(team: string) {
      const options = await loadTeam(team).catch(() => undefined);
      if (!options) return;
      await host.update((cur) => {
        if (!cur) return cur;
        const keep = (ids: string[]) =>
          ids.flatMap((id) => {
            const name = labelOf(cur.labels, id);
            const same = options.labels.find((l) => l.label === name);
            return same ? [same.value] : [];
          });
        return {
          ...cur,
          team,
          statuses: options.statuses,
          labels: options.labels,
          projects: options.projects,
          state: options.todo,
          labelIds: keep(cur.labelIds),
          project: "",
        };
      });
    },

    /**
     * Writes the draft to Linear: the issue, or with `asComment` the duplicate's comment. Gives
     * what was filed, and leaves the draft open for the client to close; on an error the draft
     * says why and nothing is given.
     */
    async submit({ asComment = false, open = false } = {}): Promise<Filed | undefined> {
      const f = await host.read();
      if (!f || f.phase !== "ready") return undefined;
      await patch({ phase: "filing", error: null });
      try {
        if (asComment && f.duplicate) {
          const r = await call<unknown>("save_comment", {
            issueId: f.duplicate.issue,
            body: f.duplicate.comment,
          });
          const url = /https:\/\/linear\.app\/[^"'\s)]+/.exec(JSON.stringify(r))?.[0] ?? "";
          const last = await host.last().catch(() => undefined);
          if (last) await host.remember({ ...last, open }).catch(() => undefined);
          return { key: f.duplicate.issue, title: `commented: ${f.duplicate.title}`, url };
        }
        const r = await call<{ id?: string; identifier?: string; url?: string }>("save_issue", {
          team: f.team,
          title: f.title,
          description: filedDescription(f),
          assignee: "me",
          state: f.state,
          priority: f.priority,
          ...(f.labelIds.length > 0 && { labels: f.labelIds }),
          ...(f.project && { project: f.project }),
        });
        const text = JSON.stringify(r);
        const key = r.identifier ?? r.id ?? /\b[A-Z][A-Z0-9]+-\d+\b/.exec(text)?.[0] ?? "";
        const url = r.url ?? /https:\/\/linear\.app\/[^"'\s)]+/.exec(text)?.[0] ?? "";
        await host.remember({ team: f.team, priority: f.priority, open }).catch(() => undefined);
        return { key, title: f.title, url };
      } catch (error) {
        await patch({ phase: "ready", error: errorText(error) });
        return undefined;
      }
    },
  };
}

export type Drafter = ReturnType<typeof drafter>;
