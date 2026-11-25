/**
 * What the message renderer draws at the widths a session actually has: folded it is one bounded
 * line, expanded the whole message survives, wrapping rather than being cut.
 */
import type { Theme } from "@earendil-works/pi-coding-agent";
import { cellWidth } from "@agents/kit-core/lines.ts";
import { describe, expect, it } from "vitest";
import { PeerMessage, type PeerMessageDetails } from "./message.ts";

/** A theme that paints nothing, so the drawn rows are the text a person reads. */
const plain = {
  fg: (_role: string, text: string) => text,
  bold: (text: string) => text,
  italic: (text: string) => text,
  underline: (text: string) => text,
  inverse: (text: string) => text,
} as unknown as Theme;

const draw = (
  details: Partial<PeerMessageDetails>,
  options: { expanded: boolean; width: number; pad?: number },
) =>
  new PeerMessage(
    plain,
    { kind: "message", fromName: "beta", body: "", ...details },
    options.expanded,
    options.pad ?? 0,
  ).render(options.width);

const rows = (drawn: string[]) => drawn.map((row) => row.trim());
/** Everything under the label row, with the wrapping undone: no spaces, so a split word rejoins. */
const below = (drawn: string[]) => rows(drawn).slice(1).join("").replace(/\s+/g, "");
const widest = (drawn: string[]) => Math.max(...drawn.map((row) => cellWidth(row)));

// A body and a reply address that between them are wider than 70 columns.
const BODY =
  "The retry in src/sync.ts is capped at a minute, and the upload path tries five times before it gives up. " +
  "Is that what you meant, or should the cap be lower?";
const REPLY = "uds:/run/user/1000/cc-socks/4194304-0123abcd/runtime/cc-socks/4194304.sock";

describe("expanded", () => {
  it("keeps the whole body and the reply address at 70 columns", () => {
    const drawn = draw({ body: BODY, replyTo: REPLY }, { expanded: true, width: 70 });
    expect(drawn.length).toBeGreaterThan(3);
    expect(widest(drawn)).toBeLessThanOrEqual(70);
    expect(below(drawn)).toContain(BODY.replace(/\s+/g, ""));
    expect(below(drawn)).toContain(REPLY);
    // Nothing was cut to make it fit.
    expect(below(drawn)).not.toContain("…");
  });

  it("wraps by cells, so wide characters are neither cut nor overrun", () => {
    const body = "日本語のメッセージです。".repeat(12);
    const drawn = draw({ body }, { expanded: true, width: 40 });
    expect(drawn.length).toBeGreaterThan(5);
    expect(widest(drawn)).toBeLessThanOrEqual(40);
    expect(below(drawn)).toBe(body);
    expect(below(drawn)).not.toContain("…");
  });

  it("leaves the padding the host asked for outside the text", () => {
    const drawn = draw({ body: BODY }, { expanded: true, width: 60, pad: 2 });
    expect(drawn.every((row) => row.startsWith("  "))).toBe(true);
    expect(widest(drawn)).toBeLessThanOrEqual(60);
  });

  it("keeps a long sender name whole on its own line", () => {
    const drawn = draw(
      { fromName: "peer-with-a-name-long-enough-to-need-wrapping", body: "hello" },
      { expanded: true, width: 30 },
    );
    expect(widest(drawn)).toBeLessThanOrEqual(30);
    expect(rows(drawn).join("")).toContain("peer-with-a-name-long-enough-to-need-wrapping");
  });
});

describe("folded", () => {
  it("is one line, bounded, cut with an ellipsis", () => {
    const drawn = draw({ body: BODY }, { expanded: false, width: 40 });
    expect(drawn).toHaveLength(1);
    expect(widest(drawn)).toBeLessThanOrEqual(40);
    expect(drawn[0]?.trimEnd().endsWith("…")).toBe(true);
    expect(drawn[0]).toContain("› Message from @beta: ");
  });

  it("keeps a short message whole, with no ellipsis", () => {
    const drawn = draw({ body: "Ping." }, { expanded: false, width: 70 });
    expect(rows(drawn)).toEqual(["› Message from @beta: Ping."]);
  });

  it("names an idle notice and a status line by what they are", () => {
    expect(rows(draw({ kind: "idle", body: "x" }, { expanded: false, width: 70 }))[0]).toContain(
      "› Idle notice:",
    );
    expect(rows(draw({ kind: "status", body: "x" }, { expanded: false, width: 70 }))[0]).toContain(
      "› Message status:",
    );
  });
});
