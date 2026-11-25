import { describe, expect, it } from "vitest";
import {
  METADATA_KEYS,
  readRegistryMetadata,
  registryRequest,
  REGISTRY_PROTOCOL,
} from "./metadata.ts";

describe("readRegistryMetadata", () => {
  it("reads every key an adapter may set", () => {
    expect(
      readRegistryMetadata({
        protocol: REGISTRY_PROTOCOL,
        metadata: {
          hubFailed: "API error",
          hubPeer: true,
          hubHidden: true,
          tmux: "%3",
        },
      }),
    ).toEqual({ hubFailed: "API error", hubPeer: true, hubHidden: true, tmux: "%3" });
  });

  it("ignores another protocol, and is empty for an empty metadata", () => {
    expect(readRegistryMetadata({ protocol: 2, metadata: { hubPeer: true } })).toBeUndefined();
    // A request carries no metadata of its own; answering it is the adapter's job.
    expect(readRegistryMetadata(registryRequest())).toEqual({});
    expect(readRegistryMetadata({ protocol: REGISTRY_PROTOCOL })).toEqual({});
    expect(readRegistryMetadata(null)).toBeUndefined();
  });

  it("clears what the adapter no longer says, however it says it", () => {
    expect(
      readRegistryMetadata({
        protocol: REGISTRY_PROTOCOL,
        metadata: {
          hubFailed: undefined,
          hubPeer: false,
          hubHidden: "yes",
          tmux: "   ",
        },
      }),
    ).toEqual({});
    // A key the adapter leaves out is cleared too, which is how a stale hub field goes away.
    expect(
      readRegistryMetadata({ protocol: REGISTRY_PROTOCOL, metadata: { hubFailed: "boom" } }),
    ).toEqual({ hubFailed: "boom" });
  });

  it("keeps an error message one line and short", () => {
    const read = readRegistryMetadata({
      protocol: REGISTRY_PROTOCOL,
      metadata: { hubFailed: `a\nb\t${"x".repeat(500)}` },
    });
    expect(read?.hubFailed).not.toContain("\n");
    expect((read?.hubFailed ?? "").length).toBeLessThanOrEqual(200);
  });

  it("drops keys that are not the adapter's to set", () => {
    const read = readRegistryMetadata({
      protocol: REGISTRY_PROTOCOL,
      metadata: {
        pid: 1,
        status: "idle",
        messagingSocketPath: "/tmp/other.sock",
        name: "someone else",
        peerProtocol: 9,
        waitingFor: "a dialog",
        tmux: "%1",
      },
    });
    expect(read).toEqual({ tmux: "%1" });
    expect(
      Object.keys(read ?? {}).every((key) => (METADATA_KEYS as readonly string[]).includes(key)),
    ).toBe(true);
  });
});
