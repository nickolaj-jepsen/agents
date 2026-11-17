import { describe, expect, test } from "vitest";

import {
  applyPrompt,
  byTarget,
  dismiss,
  evidenceBlocks,
  evidenceLabel,
  normalizeTarget,
  openQueue,
  parse,
  plan,
  readEvidence,
  reopen,
  repeats,
  sentences,
  serialize,
  type Call,
  type Suggestion,
} from "./docfix.ts";

const NOW = "2026-11-15T10:00:00.000Z";
const ok = (target: string) => ({ ok: true as const, target });

const suggest = (over: Partial<Call["input"]> = {}, existing: Suggestion[] = []): Call => ({
  input: {
    action: "suggest",
    file: "AGENTS.md",
    kind: "missing",
    claim: "After `nix flake update sjusk`, run `pnpm install --force`",
    evidence: "AGENTS.md:12 says `pnpm install`; it left node_modules/.bin/sjusk stale",
    ...over,
  },
  existing,
  target: ok("AGENTS.md"),
  now: NOW,
  session: "claude:one",
});

const filed = (call: Call) => {
  const outcome = plan(call);
  if (outcome.kind !== "write") throw new Error(`expected a write, got ${outcome.kind}`);
  return outcome;
};

describe("plan", () => {
  test("files a new suggestion", () => {
    const outcome = filed(suggest());
    expect(outcome.isNew).toBe(true);
    expect(outcome.suggestion.id).toBe("agents--after-nix-flake-update-sjusk-run-pnpm-install");
    expect(outcome.suggestion.sessions).toEqual(["claude:one"]);
    expect(outcome.text).toContain("seen 1×");
  });

  test("lists the doc's suggestions instead of filing a second", () => {
    const first = filed(suggest()).suggestion;
    const outcome = plan(suggest({ claim: "pnpm install needs --force here" }, [first]));
    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain(first.id);
    expect(outcome.text).toContain('same_as: "none"');
  });

  test("same_as bumps the seen count once per session", () => {
    const first = filed(suggest()).suggestion;
    const again = { ...suggest({ same_as: first.id }, [first]), session: "pi:two" };
    const bumped = filed(again).suggestion;
    expect(bumped.sessions).toEqual(["claude:one", "pi:two"]);
    expect(bumped.evidence).toHaveLength(1);
    const twice = filed({ ...again, existing: [bumped] }).suggestion;
    expect(twice.sessions).toHaveLength(2);
  });

  test('same_as "none" files a different suggestion for the same doc', () => {
    const first = filed(suggest()).suggestion;
    const outcome = filed(suggest({ claim: "Other fact", same_as: "none" }, [first]));
    expect(outcome.isNew).toBe(true);
    expect(outcome.suggestion.id).not.toBe(first.id);
  });

  test("a dismissed suggestion is not filed again", () => {
    const gone = dismiss(filed(suggest()).suggestion, NOW);
    const outcome = plan(suggest({ same_as: gone.id }, [gone]));
    expect(outcome.kind).toBe("answer");
    expect(outcome.text).toContain("dismissed on 2026-11-15");
  });

  test("refuses empty evidence, a bad kind and a bad target", () => {
    expect(plan(suggest({ evidence: " " })).kind).toBe("error");
    expect(plan(suggest({ kind: "typo" })).kind).toBe("error");
    expect(plan({ ...suggest(), target: { ok: false, error: "untracked" } }).text).toBe(
      "untracked",
    );
  });

  test("resolve removes a known id", () => {
    const first = filed(suggest()).suggestion;
    expect(
      plan({ ...suggest(), input: { action: "resolve", id: first.id }, existing: [first] }).kind,
    ).toBe("remove");
    expect(plan({ ...suggest(), input: { action: "resolve", id: "nope" } }).kind).toBe("error");
  });
});

describe("the file", () => {
  test("round-trips", () => {
    const first = filed(suggest()).suggestion;
    const two = {
      ...first,
      sessions: ["claude:one", "pi:two"],
      evidence: [...first.evidence, { at: NOW, session: "pi:two", text: "multi\nline" }],
    };
    expect(parse(serialize(two))).toEqual(two);
    const gone = dismiss(two, NOW);
    expect(parse(serialize(gone))).toEqual(gone);
  });

  test("refuses what it didn't write", () => {
    expect(parse("# a note")).toBeNull();
    expect(parse("---\nid: x\n---\nclaim")).toBeNull();
  });
});

describe("targets", () => {
  test("normalizes to repo-relative Markdown", () => {
    expect(normalizeTarget("/repo/docs/a.md", "/repo")).toEqual(ok("docs/a.md"));
    expect(normalizeTarget("./AGENTS.md", "/repo")).toEqual(ok("AGENTS.md"));
    expect(normalizeTarget("src/a.ts", "/repo").ok).toBe(false);
    expect(normalizeTarget("../x.md", "/repo").ok).toBe(false);
    expect(normalizeTarget("/elsewhere/x.md", "/repo").ok).toBe(false);
  });
});

describe("review", () => {
  test("queues open suggestions by doc, most seen first, and groups picks", () => {
    const a = filed(suggest()).suggestion;
    const b = {
      ...filed(suggest({ claim: "b", same_as: "none" }, [a])).suggestion,
      sessions: ["x", "y"],
    };
    const c = {
      ...filed({ ...suggest({ file: "docs/z.md", claim: "c" }), target: ok("docs/z.md") })
        .suggestion,
    };
    const queue = openQueue([c, a, b, dismiss({ ...a, id: "gone" }, NOW)]);
    expect(queue.map((s) => s.id)).toEqual([b.id, a.id, c.id]);
    expect(byTarget(queue).map(([t, list]) => [t, list.length])).toEqual([
      ["AGENTS.md", 2],
      ["docs/z.md", 1],
    ]);
    expect(applyPrompt([a])).toContain(`action "resolve"`);
  });

  test("an apply prompt names the suggestions by id and leaves the evidence in their files", () => {
    const a = filed(suggest()).suggestion;
    const z = {
      ...filed({ ...suggest({ file: "docs/z.md", claim: "c" }), target: ok("docs/z.md") })
        .suggestion,
      evidence: [{ at: NOW, session: "claude:one", text: "SECRET EVIDENCE TEXT" }],
    };
    const prompt = applyPrompt([a, z]);
    expect(prompt).toContain(`- missing: ${a.claim}\n  .agents/store/docfix/${a.id}.md`);
    expect(prompt).not.toContain("seen 1×");
    expect(prompt).not.toContain("SECRET EVIDENCE TEXT");
    // One prompt for every doc, each doc's suggestions under its path.
    expect(prompt.indexOf("\nAGENTS.md\n")).toBeLessThan(prompt.indexOf("\ndocs/z.md\n"));
    expect(prompt.match(/Don't commit/g)).toHaveLength(1);
  });

  test("an undo opens a dismissed suggestion again", () => {
    const a = filed(suggest()).suggestion;
    const gone = dismiss(a, NOW);
    const back = reopen(gone, "2026-11-16T10:00:00.000Z");
    expect(back).toMatchObject({ status: "open", dismissed: "", id: a.id });
    expect(openQueue([back])).toHaveLength(1);
  });
});

describe("readEvidence", () => {
  const evidence = (text: string, session = "pi:01a1") => ({ at: NOW, session, text });

  test("turns a Citations line into a list instead of raw JSON", () => {
    const view = readEvidence(
      evidence(
        'Migrated from pi memory `grammars`.\n\nMeasured it.\n\nWhy the repo didn\'t say it: No comment says why.\n\nCitations: [{"kind":"path","value":"modules/neovim.nix"},{"kind":"symbol","value":"grammarPlugins"}]',
      ),
    );
    expect(view).toMatchObject({ when: "2026-11-15", by: "pi", isMigrated: true });
    expect(view.parts).toEqual([
      { kind: "text", text: "Measured it." },
      { kind: "labelled", label: "Why the repo didn't say it", text: "No comment says why." },
      {
        kind: "citations",
        items: [
          { kind: "path", value: "modules/neovim.nix" },
          { kind: "symbol", value: "grammarPlugins" },
        ],
      },
    ]);
    expect(JSON.stringify(view.parts)).not.toContain("Citations:");
  });

  test("keeps text it does not recognise, and malformed citations, as they were", () => {
    const view = readEvidence(evidence("AGENTS.md:12 says x\nand y\n\nCitations: [not json"));
    expect(view.isMigrated).toBe(false);
    expect(view.parts).toEqual([
      { kind: "text", text: "AGENTS.md:12 says x\nand y" },
      { kind: "text", text: "Citations: [not json" },
    ]);
  });

  test("a Citations line in the middle of a paragraph splits it", () => {
    const view = readEvidence(
      evidence('before\nCitations: ["a.md", {"value": 3}]\nafter', "claude:s1"),
    );
    expect(view.by).toBe("claude");
    expect(view.parts).toEqual([
      { kind: "text", text: "before" },
      {
        kind: "citations",
        items: [
          { kind: "ref", value: "a.md" },
          { kind: "ref", value: "3" },
        ],
      },
      { kind: "text", text: "after" },
    ]);
  });
});

describe("what a row says of its count and evidence", () => {
  const base = filed(suggest()).suggestion;
  test("a first sighting has no count: every row has one", () => {
    expect(repeats(base)).toBe("");
    expect(repeats({ ...base, sessions: ["a", "b", "c"] })).toBe("3×");
  });

  test("an evidence label is its date, harness and how it was filed", () => {
    const view = readEvidence({
      at: "2026-11-05T22:54:41.616Z",
      session: "pi:01a1",
      text: "Migrated from pi memory `x`.\n\nSomething.",
    });
    expect(evidenceLabel(view)).toBe("2026-11-05  pi  migrated");
  });
});

describe("evidence a person scans", () => {
  const view = (text: string) => readEvidence({ at: NOW, session: "pi:1", text });

  test("the reason comes first, then the details, then what it points at", () => {
    const blocks = evidenceBlocks(
      view(
        'Measured it.\n\nWhy the repo didn\'t say it: No comment says why.\n\nCitations: [{"kind":"path","value":"a.nix"}]',
      ),
    );
    expect(blocks.map((b) => b.heading)).toEqual([
      "Why the repo didn't say it",
      "Details",
      "Points at",
    ]);
    expect(blocks[2]?.items).toEqual([{ kind: "path", value: "a.nix" }]);
  });

  test("one plain paragraph has no heading", () => {
    expect(evidenceBlocks(view("The line is stale."))).toEqual([
      { heading: "", lines: ["The line is stale."] },
    ]);
  });

  test("a long text is cut after each sentence, not inside a command", () => {
    const text = `From pkgs/x: PYTHONPATH=. uv run python -m unittest. ${"Filler words go here. ".repeat(6)}Last one.`;
    const lines = sentences(text);
    expect(lines[0]).toBe("From pkgs/x: PYTHONPATH=. uv run python -m unittest.");
    expect(lines.at(-1)).toBe("Last one.");
    expect(lines.length).toBeGreaterThan(5);
    expect(sentences("Short. Text.")).toEqual(["Short. Text."]);
  });
});
