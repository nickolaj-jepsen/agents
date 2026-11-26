/**
 * The transaction both commands share: the state file first, the deployed tree second, and the state
 * file put back when the tree fails.
 *
 * The failures are the point. A first publication that cannot deploy must leave no state behind, a
 * failed write must leave the previous state and deploy nothing, a failed deploy must restore the
 * bytes it found — not a re-serialisation of them — and an undo that fails itself must still report
 * the failure that caused it.
 */
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { type CommitIo, commitState } from "./commit.ts";
import { STATE_FILE } from "./protocol.ts";

const REVISION = "1".repeat(40);
const scratch: string[] = [];
afterEach(() => {
  for (const directory of scratch.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

class Fixture {
  readonly state: string;
  readonly path: string;
  readonly warnings: string[] = [];
  /** What the deploy was given, in the order the commit ran it. */
  readonly calls: string[] = [];

  constructor() {
    this.state = join(fs.mkdtempSync(join(os.tmpdir(), "agents-commit-test-")), "state");
    scratch.push(join(this.state, ".."));
    this.path = join(this.state, STATE_FILE);
  }

  /** The state file as some earlier publication left it: handwritten, not in this tool's shape. */
  write(text: string): void {
    fs.mkdirSync(this.state, { recursive: true });
    fs.writeFileSync(this.path, text);
  }

  read(): string | null {
    return fs.existsSync(this.path) ? fs.readFileSync(this.path, "utf8") : null;
  }

  /** Files a write of the state leaves beside it: a temporary here is a temporary left behind. */
  temporaries(): string[] {
    if (!fs.existsSync(this.state)) return [];
    return fs.readdirSync(this.state).filter((name) => name.startsWith("."));
  }

  commit<T>(options: { save?: () => void; deploy: () => T }, io: CommitIo = {}): T {
    return commitState(
      {
        state: this.state,
        warn: (message) => void this.warnings.push(message),
        save:
          options.save === undefined
            ? undefined
            : () => {
                this.calls.push("save");
                options.save!();
              },
        deploy: () => {
          this.calls.push("deploy");
          return options.deploy();
        },
      },
      io,
    );
  }
}

const set = (): Fixture => new Fixture();

test("the state is written before the tree is deployed", () => {
  const f = set();
  const result = f.commit({
    save: () => f.write(`{"plugins":{},"skills":{},"ui":{}}\n`),
    deploy: () => {
      // The tree converges on what `resolve` already reports: the file must be there by now.
      assert.equal(f.read(), `{"plugins":{},"skills":{},"ui":{}}\n`);
      return "deployed";
    },
  });
  assert.equal(result, "deployed");
  assert.deepEqual(f.calls, ["save", "deploy"]);
  assert.deepEqual(f.warnings, []);
});

test("a first publication that cannot deploy leaves no state behind", () => {
  const f = set();
  const failure = new Error("the destination is not a directory");
  assert.throws(
    () =>
      f.commit({
        save: () => f.write(`{"ui":{}}\n`),
        deploy: () => {
          throw failure;
        },
      }),
    failure,
  );
  assert.equal(fs.existsSync(f.path), false, "the state file the run created is gone again");
  assert.deepEqual(f.warnings, [], "an undo that worked says nothing");
  assert.deepEqual(f.temporaries(), [], "the undo leaves no temporary beside the state");
});

test("a state write that fails deploys nothing and keeps the previous state", () => {
  const f = set();
  const before = `{"plugins":{"answer":{"pi":"/nix/store/old","claude":null,"baseline":"${REVISION}"}}}\n`;
  f.write(before);
  const failure = new Error("EACCES: permission denied");
  assert.throws(
    () =>
      f.commit({
        save: () => {
          throw failure;
        },
        deploy: () => {
          throw new Error("the tree must not be touched when the state could not be written");
        },
      }),
    failure,
  );
  assert.deepEqual(f.calls, ["save"], "the deploy never ran");
  assert.equal(f.read(), before);
  assert.deepEqual(f.warnings, []);
  assert.deepEqual(f.temporaries(), []);
});

test("a failed deploy puts the previous bytes back, not a re-serialisation of them", () => {
  const f = set();
  // Bytes this tool would never write: one line, spaces, no trailing newline. An undo that wrote
  // through the JSON serialiser would lose every one of those, and `resolve` would read a document
  // nobody wrote.
  const before = `{"plugins":{}, "skills":{}, "ui":{}}`;
  f.write(before);
  const failure = new Error("the destination is not a directory");
  assert.throws(
    () =>
      f.commit({
        save: () =>
          f.write(`{"plugins":{},"skills":{},"ui":{"herdr-ui":{"path":"/nix/store/new"}}}\n`),
        deploy: () => {
          throw failure;
        },
      }),
    failure,
  );
  assert.equal(f.read(), before);
  assert.deepEqual(f.warnings, []);
  assert.deepEqual(f.temporaries(), []);
});

test("a repair that fails still reports the failure that caused it", () => {
  // The undo needs the same directory the write did, so it can fail for the same reason. The person
  // has to read what actually failed; the state file that could not be put back is the warning.
  const f = set();
  f.write(`{"plugins":{}}\n`);
  const failure = new Error("the destination is not a directory");
  assert.throws(
    () =>
      f.commit(
        {
          save: () => f.write(`{"plugins":{"answer":{}}}\n`),
          deploy: () => {
            throw failure;
          },
        },
        {
          restore: () => {
            throw new Error("EACCES: permission denied, open 'current.json'");
          },
        },
      ),
    failure,
  );
  assert.equal(f.warnings.length, 1);
  assert.match(f.warnings[0]!, /could not put current\.json back after a failed deploy/);
  assert.match(f.warnings[0]!, /EACCES: permission denied/);
});

test("a state write with nothing to save deploys, undoes nothing and says nothing", () => {
  const f = set();
  const before = `{"plugins":{"answer":{}}}\n`;
  f.write(before);
  const result = f.commit({
    deploy: () => "redeployed",
  });
  assert.equal(result, "redeployed");
  assert.deepEqual(f.calls, ["deploy"], "a commit with no state write still runs the deploy");
  assert.equal(f.read(), before);
  assert.deepEqual(f.warnings, []);
});

test("a deploy with no state write that fails leaves the state file alone", () => {
  const f = set();
  const before = `{"plugins":{}}\n`;
  f.write(before);
  const failure = new Error("the destination is not a directory");
  assert.throws(
    () =>
      f.commit(
        {
          deploy: () => {
            throw failure;
          },
        },
        {
          // Undoing would be a state change of its own; nothing was written, so nothing is undone.
          restore: () => {
            throw new Error("a commit with no state write must not undo anything");
          },
        },
      ),
    failure,
  );
  assert.equal(f.read(), before);
  assert.deepEqual(f.warnings, []);
});
