import { describe, expect, it } from "vitest";
import type { RegistryMetadata } from "./metadata.ts";
import type { RegistryEntry } from "./protocol.ts";
import { Registry, type RegistryIo } from "./registry.ts";

const core = (over: Partial<RegistryEntry> = {}): RegistryEntry => ({
  pid: 4242,
  sessionId: "session-1",
  cwd: "/work",
  startedAt: 1000,
  kind: "interactive",
  entrypoint: "pi",
  messagingSocketPath: "/run/cc-socks/4242.sock",
  name: "alpha",
  ...over,
});

type Recorder = {
  io: RegistryIo;
  writes: RegistryEntry[];
  removals: number;
  /** Holds every write until the test releases it. */
  hold(): void;
  release(): void;
  idle(): Promise<void>;
};

const recorder = (now = () => 5000): Recorder => {
  const writes: RegistryEntry[] = [];
  const gates: (() => void)[] = [];
  const state = { removals: 0 };
  let holding = false;
  const idle = async () => {
    // The write is recorded synchronously when it starts, so a caller only has to let the queue run.
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  return {
    writes,
    get removals() {
      return state.removals;
    },
    io: {
      now,
      async write(entry) {
        writes.push(entry);
        if (!holding) return;
        await new Promise<void>((done) => gates.push(done));
      },
      async remove() {
        state.removals++;
      },
    },
    hold: () => {
      holding = true;
    },
    release: () => {
      holding = false;
      for (const done of gates.splice(0)) done();
    },
    idle,
  };
};

describe("Registry", () => {
  it("writes nothing before it starts, then the whole entry", async () => {
    const rec = recorder();
    const registry = new Registry(core(), rec.io);
    registry.publish({ status: "busy" });
    expect(registry.current()).toBeUndefined();
    expect(rec.writes).toHaveLength(0);

    registry.setMetadata({ hubPeer: true, tmux: "%2" });
    await registry.start({ status: "idle" });
    expect(rec.writes).toEqual([
      expect.objectContaining({
        pid: 4242,
        sessionId: "session-1",
        messagingSocketPath: "/run/cc-socks/4242.sock",
        status: "idle",
        hubPeer: true,
        tmux: "%2",
      }),
    ]);
  });

  it("keeps adapter metadata across a core status change", async () => {
    const rec = recorder();
    const registry = new Registry(core(), rec.io);
    registry.setMetadata({ hubFailed: "API error", hubHidden: true });
    await registry.start({ status: "idle" });
    registry.publish({ status: "busy" });
    registry.publish({ status: "waiting", waitingFor: "Answer or decline?" });
    await registry.flush();

    const last = rec.writes.at(-1);
    expect(last).toEqual(
      expect.objectContaining({
        status: "waiting",
        waitingFor: "Answer or decline?",
        hubFailed: "API error",
        hubHidden: true,
      }),
    );
  });

  it("clears a hub field the adapter leaves out", async () => {
    const rec = recorder();
    const registry = new Registry(core(), rec.io);
    registry.setMetadata({ hubPeer: true });
    await registry.start({ status: "idle" });
    expect(rec.writes.at(-1)).toHaveProperty("hubPeer", true);

    registry.setMetadata({});
    await registry.flush();
    expect(rec.writes.at(-1)).not.toHaveProperty("hubPeer");
  });

  it("cannot be talked into another session's core fields", async () => {
    const rec = recorder();
    const registry = new Registry(core(), rec.io);
    // As if an adapter sent more than its keys: metadata is merged first, so the core wins.
    registry.setMetadata({
      pid: 9,
      status: "idle",
      name: "someone else",
      messagingSocketPath: "/tmp/other.sock",
    } as RegistryMetadata);
    await registry.start({ status: "busy" });
    expect(rec.writes.at(-1)).toEqual(
      expect.objectContaining({
        pid: 4242,
        name: "alpha",
        status: "busy",
        messagingSocketPath: "/run/cc-socks/4242.sock",
      }),
    );
  });

  it("coalesces a burst into the write it starts and one behind it", async () => {
    const rec = recorder();
    const registry = new Registry(core(), rec.io);
    await registry.start({ status: "idle" });
    for (const status of ["busy", "waiting", "busy", "waiting", "idle"])
      registry.publish({ status });
    await registry.flush();
    // The first publish starts a write before the rest arrive; they coalesce into the one after it,
    // so five status changes cost two writes and the entry ends on the last of them.
    expect(rec.writes).toHaveLength(3);
    expect(rec.writes.map((entry) => entry.status).slice(1)).toEqual(["busy", "idle"]);
  });

  it("never lands a write behind a newer one", async () => {
    const rec = recorder();
    rec.hold();
    const registry = new Registry(core(), rec.io);
    const starting = registry.start({ status: "idle" });
    await rec.idle();
    expect(rec.writes).toEqual([expect.objectContaining({ status: "idle" })]);

    // Both land while the first write is still held: only the last state can be written next.
    registry.publish({ status: "busy" });
    registry.publish({ status: "idle", waitingFor: undefined });
    rec.release();
    await starting;
    await registry.flush();
    expect(rec.writes.map((entry) => entry.status)).toEqual(["idle", "idle"]);
  });

  it("removes the entry only after a write in flight, and drops what is pending", async () => {
    const rec = recorder();
    rec.hold();
    const registry = new Registry(core(), rec.io);
    const starting = registry.start({ status: "idle" });
    await rec.idle();
    rec.release();
    await starting;

    rec.hold();
    registry.publish({ status: "busy" });
    await rec.idle();
    registry.publish({ status: "waiting" });
    const closing = registry.close();
    await rec.idle();
    // Still in flight: the entry must not be removed before the write that is already going out.
    expect(rec.removals).toBe(0);
    rec.release();
    await closing;

    expect(rec.removals).toBe(1);
    expect(rec.writes.map((entry) => entry.status)).toEqual(["idle", "busy"]);
    expect(registry.current()).toBeUndefined();

    registry.publish({ status: "idle" });
    await registry.flush();
    expect(rec.writes).toHaveLength(2);
  });

  it("starts nothing and writes nothing once closed", async () => {
    const rec = recorder();
    const registry = new Registry(core(), rec.io);
    await registry.close();
    expect(rec.removals).toBe(0);
    await registry.start({ status: "idle" });
    registry.setMetadata({ hubPeer: true });
    registry.publish({ status: "busy" });
    await registry.flush();
    expect(rec.writes).toHaveLength(0);
  });

  it("moves statusUpdatedAt only when the status is what changed", async () => {
    let clock = 100;
    const rec = recorder(() => clock);
    const registry = new Registry(core(), rec.io);
    await registry.start({ status: "idle" });
    expect(rec.writes.at(-1)).toEqual(
      expect.objectContaining({ statusUpdatedAt: 100, updatedAt: 100 }),
    );

    clock = 200;
    registry.publish({ waitingFor: "Which branch?" });
    await registry.flush();
    // The same status, so how long it has been idle is unchanged; the entry still moved.
    expect(rec.writes.at(-1)).toEqual(
      expect.objectContaining({ statusUpdatedAt: 100, updatedAt: 200 }),
    );

    clock = 300;
    registry.publish({ status: "waiting", waitingFor: "Which branch?" });
    await registry.flush();
    expect(rec.writes.at(-1)).toEqual(
      expect.objectContaining({ statusUpdatedAt: 300, waitingFor: "Which branch?" }),
    );
  });
});
