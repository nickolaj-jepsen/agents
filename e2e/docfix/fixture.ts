/**
 * A checkout with a note store of its own, so no scenario reads or writes the real
 * `.agents/store`. A real store is a link into `~/.local/share/agents/store`; here it is
 * a plain folder, which docfix uses as it is.
 */
import {
  fileName,
  serialize,
  STORE_DIR,
  type Suggestion,
} from "../../plugins/docfix/core/docfix.ts";
import type { SetupContext } from "../lib/session.ts";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const suggestion = (
  s: Partial<Suggestion> & Pick<Suggestion, "id" | "target" | "kind" | "claim">,
  days: number,
  seenBy: number,
): Suggestion => ({
  status: "open",
  created: ago(days + 3),
  updated: ago(days),
  dismissed: "",
  sessions: Array.from({ length: seenBy }, (_, i) => `session-${i + 1}`),
  evidence: [
    {
      at: ago(days),
      session: "session-1",
      text: `${s.target}: the line contradicts what the code does now.`,
    },
  ],
  ...s,
});

export const SUGGESTIONS: Suggestion[] = [
  suggestion(
    {
      id: "agents-md-says-just-build-verifies",
      target: "AGENTS.md",
      kind: "wrong",
      claim: "`just build` is not enough to verify a pi change; the docs say it is.",
    },
    2,
    3,
  ),
  suggestion(
    {
      id: "modules-md-missing-gate-trap",
      target: "docs/modules.md",
      kind: "missing",
      claim:
        "A leaf that imports a third-party module imports it on every host; the page should say that module must be inert when the feature is off.",
    },
    9,
    1,
  ),
  suggestion(
    {
      id: "hosts-md-describes-removed-card",
      target: "docs/hosts.md",
      kind: "stale",
      claim: "The `legacy` card was removed; the section still describes it.",
    },
    40,
    2,
  ),
  suggestion(
    {
      id: "readme-dismissed-already",
      target: "README.md",
      kind: "stale",
      claim: "Already dismissed, so it never shows in the queue.",
      status: "dismissed",
      dismissed: ago(1),
    },
    5,
    1,
  ),
];

/** One suggestion, for the one-item state. */
export const ONE: Suggestion[] = [SUGGESTIONS[0]!];

const KINDS = ["wrong", "missing", "stale"] as const;
const DOCS = [
  "AGENTS.md",
  "docs/agents.md",
  "docs/homelab.md",
  "docs/hosts.md",
  "docs/modules.md",
  "docs/notes.md",
  "docs/secrets.md",
  "docs/updates.md",
];

/** More suggestions than any screen holds: three or four to a doc, mixed kinds. */
export const MANY: Suggestion[] = Array.from({ length: 28 }, (_, i) =>
  suggestion(
    {
      id: `many-${String(i).padStart(2, "0")}`,
      target: DOCS[Math.floor(i / 3.6)]!,
      kind: KINDS[i % 3]!,
      claim: `Claim number ${i + 1} about ${DOCS[Math.floor(i / 3.6)]}: the page no longer matches what the code does.`,
    },
    1 + ((i * 7) % 45),
    1 + (i % 4),
  ),
);

const LONG_PATH =
  "docs/a-very-long-directory-name/with/several/nested/levels/and-an-equally-long-file-name-for-the-guide.md";
const PROSE =
  "The section says the build verifies a pi change, but the build only type-checks the cores and the pi halves and never starts an agent, so a panel that renders wrong still passes it";

/** Text far longer than expected in every field, and wide characters. */
export const EXTREME: Suggestion[] = [
  suggestion(
    {
      id: "extreme-long-claim",
      target: "AGENTS.md",
      kind: "wrong",
      claim: `${PROSE}. ${PROSE}. ${PROSE}. ${PROSE}.`,
      evidence: [
        {
          at: ago(30),
          session: "pi:0198f2a4-7c1e-7b3a-9d4e-5a6b7c8d9e0f",
          text: `${PROSE}; ${PROSE}; ${PROSE}.`,
        },
        {
          at: ago(2),
          session: "pi:0198f2a4-7c1e-7b3a-9d4e-5a6b7c8d9e0f",
          text: `\`just build\` printed ${"error: derivation failed while evaluating the attribute and its dependencies, ".repeat(6)}`,
        },
      ],
    },
    2,
    12,
  ),
  suggestion(
    {
      id: "extreme-long-path",
      target: LONG_PATH,
      kind: "stale",
      claim: "A claim under a very long target path, so the group header must be cut.",
    },
    400,
    1,
  ),
  suggestion(
    {
      id: "extreme-cjk",
      target: "docs/日本語のドキュメント.md",
      kind: "missing",
      claim:
        "この節は古くなっています。ビルドが検証するのは型だけで、エージェントを起動しないことを書き足す必要があります。全角文字と半角文字が混ざった長い説明文。",
      evidence: [
        {
          at: ago(5),
          session: "claude:セッション一",
          text: "全角文字の証拠: コードは文書と矛盾している。🙂 and a wide ＡＢＣ run.",
        },
      ],
    },
    5,
    100,
  ),
  suggestion(
    {
      id: "extreme-one-word",
      target: "AGENTS.md",
      kind: "missing",
      claim: "Unbroken".repeat(30),
    },
    0,
    3,
  ),
  suggestion(
    { id: "extreme-short", target: "docs/hosts.md", kind: "stale", claim: "Short." },
    1,
    1,
  ),
];

/** A git checkout with the docs the suggestions name and an empty store. */
export function checkout(ctx: SetupContext) {
  ctx.write("AGENTS.md", "# Agent notes\n\nVerify with `just build`.\n");
  ctx.write("docs/modules.md", "# Modules\n");
  ctx.write("docs/hosts.md", "# Hosts\n");
  ctx.write("README.md", "# Project\n");
  ctx.write(`.agents/store/${STORE_DIR}/.keep`, "");
  ctx.initRepo();
  ctx.git("add", "-A");
  ctx.git(
    "-c",
    "user.name=e2e",
    "-c",
    "user.email=e2e@example.invalid",
    "commit",
    "-q",
    "-m",
    "docs",
  );
}

/** Files the suggestions into the checkout's store. */
export function fileSuggestions(ctx: SetupContext, list: Suggestion[] = SUGGESTIONS) {
  for (const s of list) ctx.write(`.agents/store/${STORE_DIR}/${fileName(s.id)}`, serialize(s));
}
