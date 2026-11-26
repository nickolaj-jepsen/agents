/** The names a publication may use, and the two files that decide what a harness loads. */
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { NAME_PATTERN, type Baseline, validateNames } from "./protocol.ts";
import { effective, loadBaseline, loadState, saveState } from "./selection.ts";
import { UpdatesError } from "./errors.ts";

const REVISION = "1".repeat(40);

const scratch: string[] = [];
const temporary = (): string => {
  const directory = fs.mkdtempSync(join(os.tmpdir(), "agents-core-test-"));
  scratch.push(directory);
  return directory;
};
afterEach(() => {
  for (const directory of scratch.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

test("accepts plugin and skill names", () => {
  for (const name of ["answer", "gh-stack", "a.b_c", "A1", "x".repeat(128)]) {
    assert.doesNotThrow(() => validateNames([name]), name);
    assert.match(name, NAME_PATTERN);
  }
});

test("rejects names that could escape", () => {
  for (const name of ["", "../x", "a/b", ".hidden", "-x", "x y", "a".repeat(129), "a..b", "."]) {
    assert.throws(() => validateNames([name]), UpdatesError, name);
  }
});

test("a baseline keeps nulls and fills missing variants with null", () => {
  const path = join(temporary(), "baseline.json");
  fs.writeFileSync(
    path,
    JSON.stringify({
      revision: REVISION,
      plugins: {
        answer: { pi: "/nix/store/a", claude: null },
        docfix: { pi: "/nix/store/d" },
      },
      skills: { demo: "/nix/store/skills/demo" },
    }),
  );
  const baseline = loadBaseline(path);
  assert.equal(baseline.revision, REVISION);
  assert.deepEqual(baseline.plugins.answer, { pi: "/nix/store/a", claude: null });
  assert.deepEqual(baseline.plugins.docfix, { pi: "/nix/store/d", claude: null });
  assert.deepEqual(baseline.skills, { demo: "/nix/store/skills/demo" });
});

test("a baseline rejects bad shapes", () => {
  const path = join(temporary(), "baseline.json");
  const payloads: unknown[] = [
    [],
    { revision: 1 },
    { revision: REVISION, plugins: [] },
    { revision: REVISION, plugins: { answer: [] } },
    { revision: REVISION, plugins: { answer: { pi: 3 } } },
    { revision: REVISION, skills: { demo: 3 } },
  ];
  for (const payload of payloads) {
    fs.writeFileSync(path, JSON.stringify(payload));
    assert.throws(() => loadBaseline(path), UpdatesError, JSON.stringify(payload));
  }
});

test("an absent state is empty", () => {
  assert.deepEqual(loadState(join(temporary(), "state")), { plugins: {}, skills: {} });
});

test("the state roundtrips sorted and keeps the schema", () => {
  const state = join(temporary(), "state");
  saveState(
    state,
    {
      zulu: { pi: "/nix/store/z", claude: null, baseline: REVISION },
      answer: { pi: "/nix/store/a", claude: "/nix/store/c", baseline: REVISION },
    },
    { demo: { path: "/nix/store/skills/demo", baseline: REVISION } },
  );
  const raw = JSON.parse(fs.readFileSync(join(state, "current.json"), "utf8"));
  assert.deepEqual(Object.keys(raw), ["plugins", "skills"]);
  assert.deepEqual(Object.keys(raw.plugins), ["answer", "zulu"]);
  assert.deepEqual(raw.plugins.answer, {
    pi: "/nix/store/a",
    claude: "/nix/store/c",
    baseline: REVISION,
  });
  const loaded = loadState(state);
  assert.equal(loaded.plugins.zulu!.claude, null);
  assert.equal(loaded.skills.demo!.path, "/nix/store/skills/demo");
  assert.deepEqual(
    fs.readdirSync(state).filter((name) => name.startsWith(".")),
    [],
    "no temporary file is left behind",
  );
});

test("a failed rename leaves the old state and no temporary", () => {
  const state = join(temporary(), "state");
  saveState(state, { answer: { pi: "old", claude: null, baseline: REVISION } }, {});
  const before = fs.readFileSync(join(state, "current.json"), "utf8");
  assert.throws(() =>
    saveState(
      state,
      { answer: { pi: "new", claude: null, baseline: REVISION } },
      {},
      {
        rename: () => {
          throw new Error("disk full");
        },
      },
    ),
  );
  assert.equal(fs.readFileSync(join(state, "current.json"), "utf8"), before);
  assert.deepEqual(
    fs.readdirSync(state).filter((name) => name.startsWith(".")),
    [],
  );
});

const baseline = (
  plugins: Baseline["plugins"] = {},
  skills: Baseline["skills"] = {},
): Baseline => ({ revision: REVISION, plugins, skills });

test("the baseline alone resolves to itself", () => {
  const resolved = effective(
    baseline(
      {
        answer: { pi: "/b/pi", claude: "/b/claude" },
        docfix: { pi: "/b/docfix", claude: null },
      },
      { demo: "/b/skills/demo" },
    ),
    {},
    {},
  );
  assert.deepEqual(resolved, {
    plugins: {
      answer: { pi: "/b/pi", claude: "/b/claude" },
      docfix: { pi: "/b/docfix", claude: null },
    },
    skills: { demo: "/b/skills/demo" },
  });
});

test("an override wins and a missing variant inherits the pin", () => {
  const resolved = effective(
    baseline({ answer: { pi: "/b/pi", claude: "/b/claude" } }),
    { answer: { pi: "/s/pi", claude: null, baseline: REVISION } },
    {},
  );
  assert.deepEqual(resolved.plugins.answer, { pi: "/s/pi", claude: "/b/claude" });
});

test("a name only the state knows appears with its missing half null", () => {
  const resolved = effective(baseline(), { "brand-new": { pi: "/s/pi", claude: null } }, {});
  assert.deepEqual(resolved.plugins, { "brand-new": { pi: "/s/pi", claude: null } });
  assert.deepEqual(resolved.skills, {});
});

test("skills are overridden and unioned", () => {
  const resolved = effective(
    baseline({}, { demo: "/b/skills/demo", grilling: "/b/skills/grilling" }),
    {},
    {
      new: { path: "/s/skills/new", baseline: REVISION },
      demo: { path: "/s/skills/demo", baseline: REVISION },
    },
  );
  assert.deepEqual(resolved.skills, {
    demo: "/s/skills/demo",
    grilling: "/b/skills/grilling",
    new: "/s/skills/new",
  });
});

test("the resolution is sorted and has no extra keys", () => {
  const resolved = effective(
    baseline({
      zulu: { pi: "/b/z", claude: null },
      answer: { pi: "/b/a", claude: null },
    }),
    {},
    {},
  );
  assert.deepEqual(Object.keys(resolved), ["plugins", "skills"]);
  assert.deepEqual(Object.keys(resolved.plugins), ["answer", "zulu"]);
  assert.deepEqual(Object.keys(resolved.plugins.answer!), ["pi", "claude"]);
});
