/**
 * The menus as data: every git row is a link or a copy, so nothing here pushes,
 * rebases or creates anything; a row that cannot run keeps its place and says
 * why in a few words.
 */
import type { Choice } from "@agents/launch/apps.ts";

export type MenuKind = "git" | "folder";

/** What a row does when pressed; plain data, so the menu survives a reload. */
export type Action =
  | { kind: "url"; url: string }
  | { kind: "copy"; text: string; what: string }
  | { kind: "launch"; argv: string[]; cwd?: string };

export type Row = {
  id: string;
  label: string;
  /** A short note beside the label: a host, a state, a destination. */
  description?: string;
  /** Why the row cannot run; it keeps its place and says this when pressed. */
  unavailable?: string;
  action?: Action;
};

export type Menu = {
  kind: MenuKind;
  title: string;
  /** Beside the title, e.g. the repository the rows act on. */
  context?: string;
  /** Null while git and gh are still answering. */
  rows: Row[] | null;
  /** The row the focus starts on. */
  preferred?: string;
  /** Why the menu has no rows, e.g. not a repository. */
  error?: string;
};

export type Forge = "github" | "gitlab" | "codeberg";

export type Remote = {
  name: string;
  forge: Forge;
  host: string;
  /** Group path, which GitLab may nest. */
  owner: string;
  repo: string;
  /** The repository's page, without a trailing slash. */
  web: string;
};

export type Status = {
  branch: string | null;
  oid: string;
  upstream: boolean;
  /** The upstream as git names it, `<remote>/<branch>`; none without one. */
  upstreamRef?: string;
};

export type PrKind = "open" | "draft" | "merged" | "closed";

export type Pr = { url: string; number: number; state: PrKind };

/** The branch's pull request: `null` for none, `unknown` when gh could not say. */
export type PrAnswer = Pr | null | "unknown" | "no-gh";

const SHORT_SHA = 7;

/** A host and the forge it runs. */
export type Forges = Readonly<Record<string, Forge>>;

// A self-hosted forge may share these layouts, but a guessed link that 404s is worse than none:
// one is linked only when `open.json` names its host.
const FORGES: Forges = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "codeberg.org": "codeberg",
};

const isForge = (name: string): name is Forge =>
  name === "github" || name === "gitlab" || name === "codeberg";

/**
 * The public forges and the hosts `open.json` adds to them.
 * @param named The file's `forges`: a host and the name of the forge it runs.
 * @returns The hosts, and what the file named that is no forge.
 */
export function forgesOf(named: Readonly<Record<string, string>>): {
  forges: Forges;
  problems: string[];
} {
  const forges: Record<string, Forge> = { ...FORGES };
  const problems: string[] = [];
  for (const [host, forge] of Object.entries(named)) {
    if (isForge(forge)) forges[host] = forge;
    else problems.push(`forges.${host}: "${forge}" is not github, gitlab or codeberg; left out`);
  }
  return { forges, problems };
}

export const parseStatus = (output: string): Status => {
  let branch: string | null = null;
  let oid = "";
  let upstream = false;
  let upstreamRef: string | undefined;
  for (const line of output.split("\n")) {
    if (line.startsWith("# branch.head ")) {
      const head = line.slice("# branch.head ".length);
      branch = head === "(detached)" ? null : head;
    } else if (line.startsWith("# branch.oid ")) {
      oid = line.slice("# branch.oid ".length);
    } else if (line.startsWith("# branch.upstream ")) {
      upstream = true;
      upstreamRef = line.slice("# branch.upstream ".length).trim() || undefined;
    }
  }
  return { branch, oid, upstream, ...(upstreamRef ? { upstreamRef } : {}) };
};

/** A `gh pr view --json` answer as a Pr; undefined when it does not parse. */
export const parsePr = (stdout: string): Pr | undefined => {
  try {
    const data = JSON.parse(stdout) as {
      url: string;
      number: number;
      state: string;
      isDraft?: boolean;
    };
    const state: PrKind = data.isDraft
      ? "draft"
      : data.state === "MERGED"
        ? "merged"
        : data.state === "CLOSED"
          ? "closed"
          : "open";
    return { url: data.url, number: data.number, state };
  } catch {
    return undefined;
  }
};

export const parseRemote = (
  name: string,
  raw: string,
  forges: Forges = FORGES,
): Remote | undefined => {
  const trimmed = raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  let host: string;
  let path: string;
  /** The names `open.json` may know the forge by, most exact first. */
  let keys: string[];
  let web: string;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return undefined;
    }
    const isWeb = url.protocol === "http:" || url.protocol === "https:";
    // A web remote is the page's own address, its port and scheme included; ssh and the like name
    // a server, whose web page is `https://<hostname>`.
    host = isWeb ? url.host : url.hostname;
    keys = isWeb && url.port ? [url.host, url.hostname] : [url.hostname];
    web = isWeb ? `${url.protocol}//${url.host}` : `https://${url.hostname}`;
    path = url.pathname;
  } else {
    // The scp-like form git writes for SSH: [user@]host:path.
    const match = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(trimmed);
    if (!match?.[1] || !match[2]) return undefined;
    host = match[1];
    keys = [host.toLowerCase()];
    web = `https://${host.toLowerCase()}`;
    path = match[2];
  }
  host = host.toLowerCase();
  const forge = keys.map((key) => forges[key]).find(Boolean);
  if (!forge) return undefined;
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2) return undefined;
  const repo = segments[segments.length - 1] ?? "";
  const owner = segments.slice(0, -1).join("/");
  return { name, forge, host, owner, repo, web: `${web}/${owner}/${repo}` };
};

/** `config` holds `remote.<name>.url <url>` lines, as `git config --get-regexp` prints them. */
export const chooseRemote = (
  config: string,
  branchRemote: string,
  forges: Forges = FORGES,
): Remote | undefined => {
  const remotes = new Map<string, Remote>();
  for (const line of config.split("\n")) {
    const match = /^remote\.(.+)\.url\s+(.+)$/.exec(line.trim());
    // A remote with separate fetch and push URLs lists both; the fetch URL is the page people read.
    if (!match?.[1] || !match[2] || remotes.has(match[1])) continue;
    const remote = parseRemote(match[1], match[2], forges);
    if (remote) remotes.set(remote.name, remote);
  }
  const supported = [...remotes.values()];
  return (
    (branchRemote && branchRemote !== "." ? remotes.get(branchRemote) : undefined) ??
    remotes.get("origin") ??
    (supported.length === 1 ? supported[0] : undefined)
  );
};

/** The names of every remote in `remote.<name>.url` lines, supported or not. */
export const remoteNames = (config: string): string[] => {
  const names = new Set<string>();
  for (const line of config.split("\n")) {
    const match = /^remote\.(.+)\.url\s+(.+)$/.exec(line.trim());
    if (match?.[1]) names.add(match[1]);
  }
  return [...names];
};

/**
 * The branch's name on the remote the links go to, when it tracks one there under another name
 * (`wip` on `origin/feature/real-name`); undefined for any other upstream. A remote's name may hold
 * a `/`, so the longest configured name the upstream starts with is the remote.
 */
export function upstreamBranch(
  status: Status,
  remote: Remote,
  names: readonly string[] = [],
): string | undefined {
  const ref = status.upstreamRef;
  if (!ref) return undefined;
  const owner = [...names, remote.name]
    .filter((name) => ref.startsWith(`${name}/`))
    .sort((a, b) => b.length - a.length)[0];
  return owner === remote.name && ref.length > owner.length + 1
    ? ref.slice(owner.length + 1)
    : undefined;
}

/** A branch name as URL path segments, so a `#` or a space still links. */
const segment = (text: string) => text.split("/").map(encodeURIComponent).join("/");

const branchUrl = (remote: Remote, branch: string) => {
  const leaf = segment(branch);
  switch (remote.forge) {
    case "github":
      return `${remote.web}/tree/${leaf}`;
    case "gitlab":
      return `${remote.web}/-/tree/${leaf}`;
    case "codeberg":
      return `${remote.web}/src/branch/${leaf}`;
  }
};

const commitUrl = (remote: Remote, sha: string) =>
  remote.forge === "gitlab" ? `${remote.web}/-/commit/${sha}` : `${remote.web}/commit/${sha}`;

// The compare form rather than `gh pr create --web`, which may offer to push.
const compareUrl = (remote: Remote, base: string, branch: string) =>
  `${remote.web}/compare/${segment(base)}...${segment(branch)}?expand=1`;

export type GitFacts = {
  status: Status;
  remote: Remote | undefined;
  /** The branch a new pull request targets, as `gh pr create` picks it. */
  base: string;
  pr: PrAnswer;
  /** Every configured remote's name, to tell where an upstream's remote ends. */
  remoteNames?: readonly string[];
};

export const gitMenu = ({ status, remote, base, pr, remoteNames: names }: GitFacts): Menu => {
  const { branch } = status;
  const found = typeof pr === "object" ? pr : null;
  // The branch as the forge knows it, which is not always its local name.
  const onRemote = branch && remote ? (upstreamBranch(status, remote, names) ?? branch) : branch;
  const noRemote = "no supported remote";
  const rows: Row[] = [
    remote
      ? {
          id: "repo",
          label: "Open repository",
          description: remote.host,
          action: { kind: "url", url: remote.web },
        }
      : { id: "repo", label: "Open repository", unavailable: noRemote },
  ];

  if (branch) {
    rows.push({
      id: "branch",
      label: "Open branch",
      unavailable: remote ? undefined : noRemote,
      action: remote ? { kind: "url", url: branchUrl(remote, onRemote ?? branch) } : undefined,
    });
  } else {
    const sha = status.oid || "HEAD";
    rows.push({
      id: "commit",
      label: `Open commit ${sha.slice(0, SHORT_SHA)}`,
      unavailable: remote ? undefined : noRemote,
      action: remote ? { kind: "url", url: commitUrl(remote, sha) } : undefined,
    });
  }

  if (found) {
    rows.push({
      id: "pr",
      label: `Open pull request #${found.number}`,
      description: found.state,
      action: { kind: "url", url: found.url },
    });
  }

  const create =
    found && (found.state === "merged" || found.state === "closed")
      ? "Create new pull request"
      : "Create pull request";
  const blocked = !remote
    ? noRemote
    : remote.forge !== "github"
      ? "GitHub only"
      : !branch
        ? "detached HEAD"
        : found && (found.state === "open" || found.state === "draft")
          ? `PR #${found.number} is open`
          : !status.upstream
            ? "push the branch first"
            : pr === "no-gh"
              ? "gh not installed"
              : pr === "unknown"
                ? "gh could not say"
                : undefined;
  rows.push(
    blocked || !remote || !branch
      ? { id: "create", label: create, unavailable: blocked }
      : {
          id: "create",
          label: create,
          description: `into ${base}`,
          action: { kind: "url", url: compareUrl(remote, base, onRemote ?? branch) },
        },
  );

  rows.push(
    branch
      ? {
          id: "copy",
          label: "Copy branch name",
          action: { kind: "copy", text: branch, what: "branch name" },
        }
      : {
          id: "copy",
          label: "Copy commit SHA",
          action: { kind: "copy", text: status.oid, what: "commit SHA" },
        },
  );
  if (found) {
    rows.push({
      id: "copy-pr",
      label: "Copy PR URL",
      action: { kind: "copy", text: found.url, what: "pull request URL" },
    });
  }

  // The pull request is what the menu is usually opened for, then the branch, then the repository.
  const preferred = found ? "pr" : !remote ? "repo" : branch ? "branch" : "commit";
  return {
    kind: "git",
    title: "Git",
    context: remote ? `${remote.owner}/${remote.repo}` : undefined,
    rows,
    preferred,
  };
};

/** The checkout in the apps that take a folder; one that cannot run keeps its row, so the order never moves. */
export const folderMenu = (cwd: string, offered: readonly Choice[]): Menu => ({
  kind: "folder",
  title: "Open folder",
  rows: [
    ...offered.map(({ app, argv, cwd: from, unavailable }): Row =>
      argv
        ? { id: app.id, label: app.label, action: { kind: "launch", argv, cwd: from } }
        : { id: app.id, label: app.label, unavailable: unavailable ?? "not installed" },
    ),
    { id: "copy", label: "Copy path", action: { kind: "copy", text: cwd, what: "path" } },
  ],
  preferred: offered.find((choice) => choice.argv)?.app.id,
});
