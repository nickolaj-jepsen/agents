/**
 * What a person is told: `status`, `check`, `resolve`, and what `--live` claims about a pi session.
 */
import { afterEach, test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import { join } from "node:path";
import { NEXT_REVISION, REVISION, Fixture } from "./test/fixture.ts";

let fixture: Fixture | undefined;
afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
});

const set = (): Fixture => (fixture = new Fixture());

function writeSession(f: Fixture, name: string, payload: Record<string, unknown>): string {
  const sessions = join(f.state, "sessions");
  fs.mkdirSync(sessions, { recursive: true });
  const path = join(sessions, `${name}.json`);
  fs.writeFileSync(path, JSON.stringify(payload));
  return path;
}

function sessionPayload(
  f: Fixture,
  sessionId: string,
  status = "idle",
  pid: number = process.pid,
): Record<string, unknown> {
  return {
    pid,
    harness: "pi",
    sessionId,
    status,
    requestPath: join(f.temporary, `${sessionId}.request.json`),
  };
}

// -- status -------------------------------------------------------------------------------------

test("status reports the pinned revision and the snapshots", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  const { code, out, err } = await f.runCli("status");
  assert.equal(code, 0, err);
  assert.match(out, /baseline: 1111111/);
  assert.ok(out.includes(`answer: pi ${join(f.store, "out-answer-pi")}`));
  assert.match(out, /pinned 1111111/);
});

test("status without state or baseline says so", async () => {
  const f = set();
  const env = { ...f.env };
  delete env.AGENTS_BASELINE;
  const { code, out, err } = await f.runCliWith(env, "status");
  assert.equal(code, 0, err);
  assert.match(out, /baseline: unknown/);
  assert.match(out, /plugins \(0\):/);
  assert.match(out, /none/);
});

test("check is silent and zero when clean", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  const { code, out, err } = await f.runCli("check");
  assert.equal(code, 0, err);
  assert.equal(out, "");
  assert.equal(err, "");
});

test("check warns when the baseline moved", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  f.writeBaseline({ revision: NEXT_REVISION });
  const { code, out, err } = await f.runCli("check");
  assert.equal(code, 0, err);
  assert.match(out, /answer was published from 1111111/);
  assert.match(out, /the pinned baseline is 2222222/);
  assert.match(out, /agents update answer/);
});

test("a moved baseline never withholds or drops snapshots", async () => {
  // The baseline ships from the same flake generation as the CLI, so after a switch its revision
  // always differs from what current.json recorded: a warning, not a reason to ignore overrides.
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  assert.equal((await f.update("demo", "--skill")).code, 0);
  f.writeBaseline({
    revision: NEXT_REVISION,
    plugins: { docfix: { pi: join(f.store, "baseline-docfix-pi"), claude: null } },
    skills: {},
  });
  const resolve = await f.runCli("resolve");
  assert.equal(resolve.code, 0, resolve.err);
  assert.equal(resolve.err, "");
  const resolved = JSON.parse(resolve.out);
  assert.deepEqual(resolved.plugins.answer, {
    pi: join(f.store, "out-answer-pi"),
    claude: join(f.store, "out-answer-claude"),
  });
  assert.equal(resolved.skills.demo, join(f.store, "snapshot", "skills", "demo"));
  assert.ok("docfix" in resolved.plugins);

  const status = await f.runCli("status");
  assert.equal(status.code, 0, status.err);
  assert.match(status.out, /baseline: 2222222/);
  assert.match(status.out, /pinned 1111111/);

  const check = await f.runCli("check");
  assert.equal(check.code, 0);
  assert.match(check.out, /the pinned baseline is 2222222/);
});

test("check warns when a snapshot left the store", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  fs.rmSync(join(f.store, "out-answer-pi"), { recursive: true, force: true });
  const { code, out } = await f.runCli("check");
  assert.equal(code, 0);
  assert.match(out, /the pi snapshot for answer is gone from the store/);
});

test("check without a baseline still exits zero", async () => {
  const f = set();
  const env = { ...f.env };
  delete env.AGENTS_BASELINE;
  const { code, out } = await f.runCliWith(env, "check");
  assert.equal(code, 0);
  assert.match(out, /AGENTS_BASELINE is not set/);
});

test("check reports a corrupt state", async () => {
  const f = set();
  fs.mkdirSync(f.state, { recursive: true });
  fs.writeFileSync(f.current, "{not json");
  const { code, out } = await f.runCli("check");
  assert.equal(code, 0);
  assert.match(out, /is not JSON/);
});

test("check reports a failed reload of a live session", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  const session = sessionPayload(f, "s1");
  writeSession(f, "s1", session);
  fs.writeFileSync(
    `${session.requestPath}.ack`,
    JSON.stringify({ id: "x", status: "failed", message: "boom" }),
  );
  const { code, out } = await f.runCli("check");
  assert.equal(code, 0);
  assert.match(out, /session s1's last reload failed: boom/);
});

test("check ignores a dead session's failed reload", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  const session = sessionPayload(f, "s1", "idle", f.deadPid());
  writeSession(f, "s1", session);
  fs.writeFileSync(
    `${session.requestPath}.ack`,
    JSON.stringify({ id: "x", status: "failed", message: "boom" }),
  );
  const { code, out, err } = await f.runCli("check");
  assert.equal(code, 0, err);
  assert.equal(out, "");
});

// -- resolve ------------------------------------------------------------------------------------

test("resolve before any update is the baseline", async () => {
  const f = set();
  const { code, out, err } = await f.runCli("resolve");
  assert.equal(code, 0, err);
  assert.deepEqual(JSON.parse(out), {
    plugins: {
      answer: {
        pi: join(f.store, "baseline-answer-pi"),
        claude: join(f.store, "baseline-answer-claude"),
      },
      docfix: { pi: join(f.store, "baseline-docfix-pi"), claude: null },
    },
    skills: { demo: join(f.store, "baseline-skills", "demo") },
  });
});

test("resolve prints only JSON on stdout", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  const { code, out, err } = await f.runCli("resolve");
  assert.equal(code, 0, err);
  assert.equal(err, "");
  JSON.parse(out);
  assert.equal(out.trim().split("\n").length, 1);
});

test("resolve survives a corrupt state", async () => {
  const f = set();
  fs.mkdirSync(f.state, { recursive: true });
  fs.writeFileSync(f.current, "{not json");
  const { code, out, err } = await f.runCli("resolve");
  assert.equal(code, 0);
  assert.match(err, /resolving the baseline only/);
  assert.equal(JSON.parse(out).plugins.answer.pi, join(f.store, "baseline-answer-pi"));
});

test("resolve without a baseline fails", async () => {
  const f = set();
  const env = { ...f.env };
  delete env.AGENTS_BASELINE;
  const { code, err } = await f.runCliWith(env, "resolve");
  assert.equal(code, 1);
  assert.match(err, /AGENTS_BASELINE is not set/);
});

// -- live --------------------------------------------------------------------------------------

test("live pi writes a request and only claims requested", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  writeSession(f, "s1", sessionPayload(f, "s1"));
  const { code, out, err } = await f.update("answer", "--live", "pi");
  assert.equal(code, 0, err);
  assert.match(out, /live pi: requested in s1 \(idle\); not confirmed/);
  assert.equal(out.includes("applied"), false);
  const request = JSON.parse(fs.readFileSync(join(f.temporary, "s1.request.json"), "utf8"));
  assert.deepEqual(Object.keys(request).sort(), ["id", "requestedAt"]);
  assert.equal(request.id.length, 32);
  assert.match(request.requestedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
});

test("a matching ack is reported as history and a new request goes out", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  writeSession(f, "s1", sessionPayload(f, "s1"));
  assert.equal((await f.update("answer", "--live", "pi")).code, 0);
  const first = JSON.parse(fs.readFileSync(join(f.temporary, "s1.request.json"), "utf8"));
  fs.writeFileSync(
    join(f.temporary, "s1.request.json.ack"),
    JSON.stringify({ id: first.id, status: "applied" }),
  );
  // The ack answers the previous update: history, not this update's result.
  const { out } = await f.update("answer", "--live", "pi");
  assert.match(out, /live pi: s1's previous request was applied/);
  assert.match(out, /live pi: requested in s1 \(idle\); not confirmed/);
  assert.equal(out.includes("applied by s1"), false);
  const second = JSON.parse(fs.readFileSync(join(f.temporary, "s1.request.json"), "utf8"));
  assert.notEqual(first.id, second.id);
});

test("a failed ack is reported with its message and a new request goes out", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  writeSession(f, "s1", sessionPayload(f, "s1"));
  assert.equal((await f.update("answer", "--live", "pi")).code, 0);
  const first = JSON.parse(fs.readFileSync(join(f.temporary, "s1.request.json"), "utf8"));
  fs.writeFileSync(
    join(f.temporary, "s1.request.json.ack"),
    JSON.stringify({ id: first.id, status: "failed", message: "extension reload threw" }),
  );
  const { out } = await f.update("answer", "--live", "pi");
  assert.match(out, /live pi: s1's previous request failed: extension reload threw/);
  assert.match(out, /live pi: requested in s1 \(idle\); not confirmed/);
  const second = JSON.parse(fs.readFileSync(join(f.temporary, "s1.request.json"), "utf8"));
  assert.notEqual(first.id, second.id);
});

test("a malformed ack is history too", async () => {
  // The bridge removes a malformed request and acks with id null; nothing may report that as this
  // update's outcome.
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  writeSession(f, "s1", sessionPayload(f, "s1"));
  fs.writeFileSync(
    join(f.temporary, "s1.request.json.ack"),
    JSON.stringify({ id: null, status: "failed", message: "Malformed reload request" }),
  );
  const { out } = await f.update("answer", "--live", "pi");
  assert.match(out, /live pi: s1's previous request failed: Malformed reload request/);
  assert.match(out, /live pi: requested in s1 \(idle\); not confirmed/);
});

test("busy sessions are queued", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  writeSession(f, "s1", sessionPayload(f, "s1", "busy"));
  const { code, out } = await f.update("answer", "--live", "pi");
  assert.equal(code, 0);
  assert.match(out, /live pi: queued in s1 \(busy\); not confirmed/);
});

test("an unanswered request is not replaced", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  writeSession(f, "s1", sessionPayload(f, "s1"));
  const requestPath = join(f.temporary, "s1.request.json");
  fs.writeFileSync(
    requestPath,
    JSON.stringify({ id: "pending", requestedAt: "2020-01-01T00:00:00Z" }),
  );
  const { code, out } = await f.update("answer", "--live", "pi");
  assert.equal(code, 0);
  assert.match(out, /live pi: s1 has an unanswered request; not queued again/);
  assert.equal(JSON.parse(fs.readFileSync(requestPath, "utf8")).id, "pending");
});

test("a stale request is replaced", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  writeSession(f, "s1", sessionPayload(f, "s1"));
  const requestPath = join(f.temporary, "s1.request.json");
  fs.writeFileSync(requestPath, JSON.stringify({ id: "old", requestedAt: "2020-01-01T00:00:00Z" }));
  fs.utimesSync(requestPath, 0, 0);
  const { code, out } = await f.update("answer", "--live", "pi");
  assert.equal(code, 0);
  assert.match(out, /live pi: requested in s1 \(idle\)/);
  assert.notEqual(JSON.parse(fs.readFileSync(requestPath, "utf8")).id, "old");
});

test("dead pids are ignored", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  writeSession(f, "s1", sessionPayload(f, "s1", "idle", f.deadPid()));
  const { code, out } = await f.update("answer", "--live", "pi");
  assert.equal(code, 0);
  assert.match(out, /live pi: ignored 1 stale session file\(s\)/);
  assert.match(out, /live pi: no running pi session/);
  assert.equal(fs.existsSync(join(f.temporary, "s1.request.json")), false);
});

test("no sessions is reported plainly", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  const { code, out } = await f.update("answer", "--live", "pi");
  assert.equal(code, 0);
  assert.match(out, /live pi: no running pi session/);
});

test("claude is reported unsupported", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  writeSession(f, "s1", sessionPayload(f, "s1"));
  const { code, out } = await f.update("answer", "--live", "all");
  assert.equal(code, 0);
  assert.match(out, /live claude: unsupported; restart the session/);
  assert.match(out, /live pi: requested in s1/);
});

test("status lists sessions", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  writeSession(f, "s1", sessionPayload(f, "s1", "busy"));
  writeSession(f, "s2", sessionPayload(f, "s2", "idle", f.deadPid()));
  const { code, out } = await f.runCli("status");
  assert.equal(code, 0);
  assert.match(out, /sessions \(2\):/);
  assert.match(out, /pi s1 busy/);
  assert.match(out, /pi s2 idle \(missing\)/);
});

test("status reports the last ack as history", async () => {
  const f = set();
  assert.equal((await f.update("answer")).code, 0);
  writeSession(f, "s1", sessionPayload(f, "s1"));
  fs.writeFileSync(
    join(f.temporary, "s1.request.json.ack"),
    JSON.stringify({ id: "old", status: "applied" }),
  );
  const { code, out } = await f.runCli("status");
  assert.equal(code, 0);
  assert.match(out, /pi s1 idle last ack applied/);
});

test("the pinned revision is reported even when only the state knows a name", async () => {
  const f = set();
  fs.mkdirSync(f.state, { recursive: true });
  fs.writeFileSync(
    f.current,
    JSON.stringify({
      plugins: { extra: { pi: "/nix/store/x", claude: null, baseline: REVISION } },
      skills: {},
    }),
  );
  const { code, out } = await f.runCli("status");
  assert.equal(code, 0);
  assert.match(out, /extra: pi \/nix\/store\/x, claude baseline \(pinned 1111111\)/);
});
